import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, 
  PhoneOff, Share, Users, MessageSquare, Volume2, VolumeX,
  Circle, Square, FileVideo
} from "lucide-react";
import { webSocketClient } from "@/lib/websocket";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import Peer from "simple-peer";
import type SimplePeer from "simple-peer";

type VideoInterfaceProps = {
  lectureId: number;
  isTeacher: boolean;
};

export default function VideoInterface({ lectureId, isTeacher }: VideoInterfaceProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>("");
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<{ [key: number]: SimplePeer }>({});
  const [connectedPeers, setConnectedPeers] = useState<number[]>([]);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const remoteVideoRefs = useRef<{ [key: number]: HTMLVideoElement | null }>({});
  
  // Function to get available media devices
  const getDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const audioDevices = devices.filter(device => device.kind === 'audioinput');
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      setAudioInputDevices(audioDevices);
      setVideoInputDevices(videoDevices);
      
      if (audioDevices.length > 0 && !selectedAudioDevice) {
        setSelectedAudioDevice(audioDevices[0].deviceId);
      }
      
      if (videoDevices.length > 0 && !selectedVideoDevice) {
        setSelectedVideoDevice(videoDevices[0].deviceId);
      }
    } catch (error) {
      console.error('Error getting media devices:', error);
    }
  };
  
  // Initialize devices
  useEffect(() => {
    getDevices();
    
    // Request permission to access devices
    navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .then(stream => {
        // Stop the stream right away to release the devices
        stream.getTracks().forEach(track => track.stop());
        getDevices();
      })
      .catch(error => {
        console.error('Error requesting media permissions:', error);
        toast({
          title: "Permission Error",
          description: "Please allow access to your camera and microphone to use the video feature.",
          variant: "destructive",
        });
      });
  }, []);
  
  // Toggle audio
  const toggleAudio = async () => {
    if (!stream) {
      // If no stream exists, create one with just audio
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined }
        });
        setStream(newStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = newStream;
        }
        setAudioEnabled(true);
      } catch (error) {
        console.error('Error getting audio stream:', error);
        toast({
          title: "Audio Error",
          description: "Failed to access your microphone.",
          variant: "destructive",
        });
      }
    } else {
      // Toggle existing audio tracks
      stream.getAudioTracks().forEach(track => {
        track.enabled = !audioEnabled;
      });
      setAudioEnabled(!audioEnabled);
    }
  };
  
  // Toggle video
  const toggleVideo = async () => {
    if (!stream) {
      // If no stream exists, create one with just video
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: selectedVideoDevice ? { exact: selectedVideoDevice } : undefined }
        });
        setStream(newStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = newStream;
        }
        setVideoEnabled(true);
      } catch (error) {
        console.error('Error getting video stream:', error);
        toast({
          title: "Video Error",
          description: "Failed to access your camera.",
          variant: "destructive",
        });
      }
    } else {
      // Toggle existing video tracks
      stream.getVideoTracks().forEach(track => {
        track.enabled = !videoEnabled;
      });
      setVideoEnabled(!videoEnabled);
    }
  };
  
  // Join video call
  const joinVideoCall = async () => {
    try {
      // Request both audio and video
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined },
        video: { deviceId: selectedVideoDevice ? { exact: selectedVideoDevice } : undefined }
      });
      
      setStream(newStream);
      setAudioEnabled(true);
      setVideoEnabled(true);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
      }
      
      // Join the WebSocket video room
      webSocketClient.joinVideo();
      
    } catch (error) {
      console.error('Error joining video call:', error);
      toast({
        title: "Media Error",
        description: "Failed to access your camera and microphone.",
        variant: "destructive",
      });
    }
  };
  
  // Leave video call
  const leaveVideoCall = () => {
    // Stop all media tracks
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    
    // Close all peer connections
    Object.values(peers).forEach(peer => {
      peer.destroy();
    });
    
    setPeers({});
    setConnectedPeers([]);
    setAudioEnabled(false);
    setVideoEnabled(false);
    
    // Leave the WebSocket video room
    webSocketClient.leaveVideo();
  };
  
  // WebSocket event handlers for WebRTC signaling
  useEffect(() => {
    if (!user) return;
    
    // Create a peer connection when a new user joins
    const handlePeerJoined = (data: { peerId: number }) => {
      const { peerId } = data;
      
      // Don't create a connection to yourself
      if (peerId === user.id) return;
      
      console.log(`Peer joined: ${peerId}`);
      
      // If we already have a connection to this peer, don't create another one
      if (peers[peerId]) return;
      
      // Create a new peer connection (initiator)
      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: stream || undefined
      });
      
      // Handle signals
      peer.on('signal', (data) => {
        webSocketClient.sendSignal(peerId, data);
      });
      
      // Handle stream
      peer.on('stream', (remoteStream) => {
        if (remoteVideoRefs.current[peerId]) {
          remoteVideoRefs.current[peerId]!.srcObject = remoteStream;
        }
      });
      
      // Handle close
      peer.on('close', () => {
        console.log(`Connection to peer ${peerId} closed`);
        setPeers(prevPeers => {
          const newPeers = { ...prevPeers };
          if (newPeers[peerId]) {
            delete newPeers[peerId];
          }
          return newPeers;
        });
        setConnectedPeers(prev => prev.filter(id => id !== peerId));
      });
      
      // Handle error
      peer.on('error', (err) => {
        console.error(`Peer error with ${peerId}:`, err);
        setPeers(prevPeers => {
          const newPeers = { ...prevPeers };
          if (newPeers[peerId]) {
            delete newPeers[peerId];
          }
          return newPeers;
        });
        setConnectedPeers(prev => prev.filter(id => id !== peerId));
      });
      
      // Add the peer to our list
      setPeers(prev => ({ ...prev, [peerId]: peer }));
      setConnectedPeers(prev => [...prev, peerId]);
    };
    
    // Handle incoming signals
    const handleSignal = (data: { peer: number; data: any }) => {
      const { peer: peerId, data: signalData } = data;
      
      // If we already have a connection to this peer
      if (peers[peerId]) {
        peers[peerId].signal(signalData);
      } else {
        // Create a new peer connection (non-initiator)
        const peer = new Peer({
          initiator: false,
          trickle: false,
          stream: stream || undefined
        });
        
        // Handle signals
        peer.on('signal', (data) => {
          webSocketClient.sendSignal(peerId, data);
        });
        
        // Handle stream
        peer.on('stream', (remoteStream) => {
          if (remoteVideoRefs.current[peerId]) {
            remoteVideoRefs.current[peerId]!.srcObject = remoteStream;
          }
        });
        
        // Handle close
        peer.on('close', () => {
          console.log(`Connection to peer ${peerId} closed`);
          setPeers(prevPeers => {
            const newPeers = { ...prevPeers };
            if (newPeers[peerId]) {
              delete newPeers[peerId];
            }
            return newPeers;
          });
          setConnectedPeers(prev => prev.filter(id => id !== peerId));
        });
        
        // Handle error
        peer.on('error', (err) => {
          console.error(`Peer error with ${peerId}:`, err);
          setPeers(prevPeers => {
            const newPeers = { ...prevPeers };
            if (newPeers[peerId]) {
              delete newPeers[peerId];
            }
            return newPeers;
          });
          setConnectedPeers(prev => prev.filter(id => id !== peerId));
        });
        
        // Process the signal data
        peer.signal(signalData);
        
        // Add the peer to our list
        setPeers(prev => ({ ...prev, [peerId]: peer }));
        setConnectedPeers(prev => [...prev, peerId]);
      }
    };
    
    // Handle when a peer leaves
    const handlePeerLeft = (data: { peerId: number }) => {
      const { peerId } = data;
      console.log(`Peer left: ${peerId}`);
      
      // Close and remove the peer connection
      setPeers(prevPeers => {
        const newPeers = { ...prevPeers };
        if (newPeers[peerId]) {
          newPeers[peerId].destroy();
          delete newPeers[peerId];
        }
        return newPeers;
      });
      setConnectedPeers(prev => prev.filter(id => id !== peerId));
    };
    
    // Get initial list of peers
    const handlePeersInLecture = (data: { peers: number[] }) => {
      console.log(`Peers in lecture:`, data.peers);
      setConnectedPeers(data.peers);
    };
    
    // Set up WebSocket event listeners
    webSocketClient.on('peer_joined', handlePeerJoined);
    webSocketClient.on('signal', handleSignal);
    webSocketClient.on('peer_left', handlePeerLeft);
    webSocketClient.on('peers_in_lecture', handlePeersInLecture);
    
    // Cleanup
    return () => {
      webSocketClient.off('peer_joined', handlePeerJoined);
      webSocketClient.off('signal', handleSignal);
      webSocketClient.off('peer_left', handlePeerLeft);
      webSocketClient.off('peers_in_lecture', handlePeersInLecture);
      
      // Stop streams and close peer connections
      leaveVideoCall();
    };
  }, [user, stream]);
  
  // Create ref objects for remote videos when connectedPeers changes
  useEffect(() => {
    // Create a new object to store refs for the current set of peers
    remoteVideoRefs.current = {};
    
    // For each connected peer, create a ref if it doesn't exist
    connectedPeers.forEach(peerId => {
      remoteVideoRefs.current[peerId] = null;
    });
  }, [connectedPeers]);
  
  // Speech recognition for transcript generation
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const networkRetryCountRef = useRef<number>(0);
  
  const toggleTranscription = () => {
    if (!isTranscribing) {
      startTranscription();
    } else {
      stopTranscription();
    }
  };
  
  const startTranscription = () => {
    // Reset retry counter
    networkRetryCountRef.current = 0;
    
    // Check if SpeechRecognition is available
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      toast({
        title: "Not Supported",
        description: "Speech recognition is not supported in your browser.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      recognitionRef.current = new SpeechRecognition();
      const recognition = recognitionRef.current;
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        setIsTranscribing(true);
        transcriptRef.current = [];
      };
      
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join(' ');
        
        // Only send stable (final) results to avoid too many updates
        if (event.results[event.results.length - 1].isFinal) {
          const lastResult = event.results[event.results.length - 1][0].transcript;
          transcriptRef.current.push(lastResult);
          
          // Send transcription via WebSocket
          webSocketClient.sendTranscription(lastResult);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        
        if (event.error === 'no-speech') {
          // This is a common error, just restart
          recognition.stop();
          setTimeout(() => {
            if (isTranscribing) recognition.start();
          }, 100);
        } else if (event.error === 'network') {
          // Network errors are common in development environments
          // Retry with a max number of attempts
          networkRetryCountRef.current += 1;
          
          if (networkRetryCountRef.current < 5) {
            toast({
              title: "Network Issue",
              description: `Reconnecting transcription service... (Attempt ${networkRetryCountRef.current}/5)`,
            });
            
            recognition.stop();
            setTimeout(() => {
              if (isTranscribing) recognition.start();
            }, 1000);
          } else {
            toast({
              title: "Transcription Error",
              description: "Too many network errors, transcription service stopped. Please try again later.",
              variant: "destructive",
            });
            stopTranscription();
            networkRetryCountRef.current = 0;
          }
        } else {
          toast({
            title: "Transcription Error",
            description: `Speech recognition error: ${event.error}`,
            variant: "destructive",
          });
          stopTranscription();
        }
      };
      
      recognition.onend = () => {
        // Restart if we're still supposed to be transcribing
        if (isTranscribing) {
          try {
            recognition.start();
          } catch (e) {
            console.error('Failed to restart recognition', e);
          }
        }
      };
      
      recognition.start();
      
      toast({
        title: "Transcription Started",
        description: "Your speech is now being transcribed and used to generate notes.",
      });
      
    } catch (error) {
      console.error('Error starting transcription:', error);
      toast({
        title: "Transcription Error",
        description: "Failed to start speech recognition.",
        variant: "destructive",
      });
    }
  };
  
  const stopTranscription = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    setIsTranscribing(false);
    
    toast({
      title: "Transcription Stopped",
      description: "Speech transcription has been stopped.",
    });
  };
  
  // Recording functionality
  const startRecording = () => {
    if (!stream) {
      toast({
        title: "Recording Error",
        description: "Cannot start recording without active media stream",
        variant: "destructive",
      });
      return;
    }

    try {
      // Initialize the MediaRecorder with the stream
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9,opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];
      
      // Handle dataavailable event to collect recorded chunks
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
          
          // Send the data chunk to the server via WebSocket
          // This is optional - for very large recordings, it might be better to
          // just save at the end rather than streaming chunks
          webSocketClient.sendRecordingData(event.data);
        }
      };
      
      // Handle recording stop
      mediaRecorder.onstop = () => {
        // Create a single Blob from all the chunks
        const recordedBlob = new Blob(recordedChunksRef.current, {
          type: 'video/webm'
        });
        
        // Create a download link for the recording (optional)
        try {
          const url = URL.createObjectURL(recordedBlob);
          const a = document.createElement('a');
          document.body.appendChild(a);
          a.style.display = 'none';
          a.href = url;
          a.download = `lecture-recording-${Date.now()}.webm`;
          a.click();
          
          // Clean up
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
        } catch (error) {
          console.error('Error creating download link:', error);
          toast({
            title: "Download Error",
            description: "Could not create download link for recording. The recording has been saved to the server.",
            variant: "destructive",
          });
        }
        
        // Notify WebSocket that recording has stopped
        webSocketClient.stopRecording();
        
        setIsRecording(false);
        
        toast({
          title: "Recording Saved",
          description: "Your lecture recording has been saved.",
        });
      };
      
      // Start recording
      mediaRecorder.start(1000); // Collect data in 1-second chunks
      
      // Notify WebSocket that recording has started
      webSocketClient.startRecording();
      
      setIsRecording(true);
      
      toast({
        title: "Recording Started",
        description: "Your lecture is now being recorded.",
      });
      
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Recording Error",
        description: "Failed to start recording.",
        variant: "destructive",
      });
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };
  
  const toggleRecording = () => {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      leaveVideoCall();
      stopTranscription();
      if (isRecording) {
        stopRecording();
      }
    };
  }, [isRecording]);

  return (
    <div className="flex flex-col">
      <div className="video-container bg-black rounded-lg overflow-hidden mb-4" ref={containerRef}>
        <div className="relative w-full h-full flex items-center justify-center">
          {!stream || !videoEnabled ? (
            <div className="text-center text-white">
              <VideoOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-lg font-medium">
                {isTeacher ? "Your camera is off" : "Waiting for video..."}
              </p>
              <p className="text-sm opacity-70">
                {isTeacher ? "Click the camera button below to turn it on" : "The presenter hasn't started video yet"}
              </p>
            </div>
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          )}
          
          {/* Remote video thumbnails */}
          {connectedPeers.length > 0 && (
            <div className="absolute bottom-4 right-4 flex space-x-2">
              {connectedPeers.map(peerId => (
                <div 
                  key={peerId} 
                  className="w-32 h-20 bg-gray-800 rounded overflow-hidden border border-gray-700"
                >
                  <video
                    ref={el => remoteVideoRefs.current[peerId] = el}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div className="flex flex-wrap items-center justify-center gap-3 py-2">
        <Button
          variant={audioEnabled ? "default" : "outline"}
          size="icon"
          onClick={toggleAudio}
          className="rounded-full w-10 h-10"
        >
          {audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        
        <Button
          variant={videoEnabled ? "default" : "outline"}
          size="icon"
          onClick={toggleVideo}
          className="rounded-full w-10 h-10"
        >
          {videoEnabled ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>
        
        {isTeacher && (
          <>
            <Button
              variant={isTranscribing ? "default" : "outline"}
              size="icon"
              onClick={toggleTranscription}
              className="rounded-full w-10 h-10"
              title="Toggle Transcription"
            >
              {isTranscribing ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </Button>
            
            <Button
              variant={isRecording ? "default" : "outline"}
              size="icon"
              onClick={toggleRecording}
              className={`rounded-full w-10 h-10 ${isRecording ? "bg-red-500 text-white hover:bg-red-600" : ""}`}
              title={isRecording ? "Stop Recording" : "Start Recording"}
            >
              {isRecording ? <Square className="h-5 w-5" /> : <Circle className="h-5 w-5 fill-current" />}
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-10 h-10"
              title="View Recordings"
              onClick={() => {
                toast({
                  title: "Recordings",
                  description: "View your lecture recordings in the classroom materials section.",
                });
              }}
            >
              <FileVideo className="h-5 w-5" />
            </Button>
          </>
        )}
        
        <Button
          variant="outline"
          size="icon"
          className="rounded-full w-10 h-10"
          title="Share Screen"
          disabled // Placeholder for future functionality
        >
          <Share className="h-5 w-5" />
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          className="rounded-full w-10 h-10"
          title="Participants"
          disabled // Placeholder for future functionality
        >
          <Users className="h-5 w-5" />
        </Button>
        
        <Button
          variant="outline"
          size="icon"
          className="rounded-full w-10 h-10"
          title="Chat"
          disabled // Placeholder for future functionality
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
        
        <Button
          variant="destructive"
          size="icon"
          onClick={leaveVideoCall}
          className="rounded-full w-10 h-10"
          title="Leave Call"
        >
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
