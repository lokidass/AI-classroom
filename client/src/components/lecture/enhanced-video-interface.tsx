import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, 
  PhoneOff, Share, Users, MessageSquare, Volume2, VolumeX,
  Circle, Square, FileVideo, RefreshCcw
} from "lucide-react";
import { webSocketClient } from "@/lib/websocket";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import Peer from "simple-peer";
import type SimplePeer from "simple-peer";

interface VideoInterfaceProps {
  lectureId: number;
  isTeacher?: boolean;
}

export default function EnhancedVideoInterface({ lectureId, isTeacher = false }: VideoInterfaceProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Media state
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>("");
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>("");
  
  // UI states
  const [isJoining, setIsJoining] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  
  // WebRTC state
  const [peers, setPeers] = useState<{ [key: number]: SimplePeer }>({});
  const [connectedPeers, setConnectedPeers] = useState<number[]>([]);
  
  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<{ [key: number]: HTMLVideoElement | null }>({});
  
  // Helper to add debug info
  const addDebugInfo = (message: string) => {
    console.log(`[EnhancedVideo] ${message}`);
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // Fetch available media devices
  const getDevices = async () => {
    try {
      addDebugInfo("Enumerating media devices...");
      
      // First check if we need to request permissions to get labeled devices
      if (!stream) {
        try {
          // Request temporary permission
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          // Stop all tracks to release the devices
          tempStream.getTracks().forEach(track => track.stop());
          addDebugInfo("Temporary stream obtained for device labels");
        } catch (err) {
          addDebugInfo("Could not get temporary stream for device labels");
        }
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      // Filter devices
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      const videoInputs = devices.filter(device => device.kind === 'videoinput');
      
      addDebugInfo(`Found ${audioInputs.length} audio devices and ${videoInputs.length} video devices`);
      
      // Ensure we have labels for the devices
      const hasLabels = audioInputs.some(device => !!device.label) || 
                       videoInputs.some(device => !!device.label);
                       
      if (!hasLabels) {
        addDebugInfo("Warning: Devices don't have labels. Permission may not be granted.");
      }
      
      // Set devices
      setAudioDevices(audioInputs);
      setVideoDevices(videoInputs);
      
      // Auto-select first devices if available
      if (audioInputs.length > 0 && !selectedAudioDevice) {
        setSelectedAudioDevice(audioInputs[0].deviceId);
      }
      
      if (videoInputs.length > 0 && !selectedVideoDevice) {
        setSelectedVideoDevice(videoInputs[0].deviceId);
      }
    } catch (error) {
      addDebugInfo(`Failed to enumerate devices: ${(error as Error).message}`);
    }
  };

  // Initialize devices on component mount
  useEffect(() => {
    addDebugInfo("Component mounted, setting up video interface");
    
    // Request initial permissions to properly enumerate devices
    getDevices();
    
    // Setup DeviceChange listener
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    
    return () => {
      // Clean up
      leaveVideoCall();
      navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    };
  }, []);

  // Setup WebSocket event listeners for video/peer connections
  useEffect(() => {
    if (!user || !lectureId) return;
    
    addDebugInfo(`Setting up WebSocket events for lecture ${lectureId}`);
    
    // Connect via WebSocket
    if (!webSocketClient.socket || webSocketClient.socket.readyState !== 1) {
      webSocketClient.connect();
      
      webSocketClient.on("connection", () => {
        addDebugInfo("WebSocket connected, authenticating");
        webSocketClient.authenticate(user.id);
      });
      
      webSocketClient.on("auth_response", (data) => {
        if (data.success) {
          addDebugInfo("Authentication successful, joining lecture");
          webSocketClient.joinLecture(lectureId);
        } else {
          addDebugInfo(`Authentication failed: ${data.error}`);
          toast({
            title: "Authentication Error",
            description: "Failed to authenticate with the lecture server.",
            variant: "destructive",
          });
        }
      });
    } else {
      // If already connected, make sure we're authenticated and joined
      addDebugInfo("WebSocket already connected");
      webSocketClient.authenticate(user.id);
      webSocketClient.joinLecture(lectureId);
    }
    
    // Setup video-related WebSocket events
    webSocketClient.on("join_video", (data) => {
      addDebugInfo(`Peer ${data.peerId} joined video`);
      if (data.peerId !== user.id) {
        // Initialize peer connection as initiator
        initiatePeerConnection(data.peerId);
      }
    });
    
    webSocketClient.on("signal", (data) => {
      addDebugInfo(`Received signal from peer ${data.peer}`);
      
      // Process the incoming signal
      processSignal(data);
    });
    
    webSocketClient.on("peer_left", (data) => {
      addDebugInfo(`Peer ${data.peerId} left`);
      // Clean up peer connection
      if (peers[data.peerId]) {
        peers[data.peerId].destroy();
        setPeers(prevPeers => {
          const newPeers = { ...prevPeers };
          delete newPeers[data.peerId];
          return newPeers;
        });
        setConnectedPeers(prev => prev.filter(id => id !== data.peerId));
      }
    });
    
    return () => {
      // Clean up event listeners
      webSocketClient.off("join_video", () => {});
      webSocketClient.off("signal", () => {});
      webSocketClient.off("peer_left", () => {});
    };
  }, [user, lectureId, stream]);

  // Start media with the selected devices
  const startMedia = async () => {
    try {
      // Stop any existing stream first
      if (stream) {
        stopMedia();
      }
      
      setIsJoining(true);
      addDebugInfo("Starting media with selected devices");
      
      // Prepare constraints
      const constraints: MediaStreamConstraints = {};
      
      // Add audio constraint if we have a device selected
      if (selectedAudioDevice) {
        constraints.audio = {
          deviceId: { exact: selectedAudioDevice }
        };
      } else {
        constraints.audio = true;
      }
      
      // Add video constraint if we have a device selected
      if (selectedVideoDevice) {
        constraints.video = {
          deviceId: { exact: selectedVideoDevice },
          width: { ideal: 640 },
          height: { ideal: 480 }
        };
      } else {
        constraints.video = {
          width: { ideal: 640 },
          height: { ideal: 480 }
        };
      }
      
      addDebugInfo(`Requesting media with constraints: ${JSON.stringify(constraints)}`);
      
      // Request media
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Log the tracks we got
      const videoTracks = mediaStream.getVideoTracks();
      const audioTracks = mediaStream.getAudioTracks();
      
      addDebugInfo(`Stream obtained with ${videoTracks.length} video tracks and ${audioTracks.length} audio tracks`);
      
      // Enable all tracks by default
      videoTracks.forEach(track => {
        track.enabled = true;
        addDebugInfo(`Video track: ${track.label}, enabled: true`);
      });
      
      audioTracks.forEach(track => {
        track.enabled = true;
        addDebugInfo(`Audio track: ${track.label}, enabled: true`);
      });
      
      // Update state
      setStream(mediaStream);
      setVideoEnabled(videoTracks.length > 0);
      setAudioEnabled(audioTracks.length > 0);
      
      // Attach to video element
      if (localVideoRef.current) {
        addDebugInfo("Attaching stream to video element");
        
        // Important: Clear any existing srcObject first
        if (localVideoRef.current.srcObject) {
          localVideoRef.current.srcObject = null;
        }
        
        localVideoRef.current.srcObject = mediaStream;
        localVideoRef.current.muted = true; // Mute local playback to prevent feedback
        
        // Ensure proper attributes
        localVideoRef.current.autoplay = true;
        localVideoRef.current.playsInline = true;
        
        // Try to start playback
        try {
          const playPromise = localVideoRef.current.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => addDebugInfo("Video playback started successfully"))
              .catch(err => {
                addDebugInfo(`Error playing video: ${err.message}`);
                
                // Try to play with user interaction
                toast({
                  title: "Video Playback",
                  description: "Please click the video to start playback",
                  variant: "default",
                });
              });
          }
        } catch (playError) {
          addDebugInfo(`Error calling play(): ${(playError as Error).message}`);
        }
      } else {
        addDebugInfo("Video ref is null, cannot attach stream");
      }
      
      // Join the WebSocket video room 
      addDebugInfo("Joining video room via WebSocket");
      webSocketClient.joinVideo();
      
      // Update existing peer connections with the new stream
      Object.values(peers).forEach(peer => {
        // Remove all tracks first
        if (peer.streams[0]) {
          peer.streams[0].getTracks().forEach(track => {
            peer.removeTrack(track, peer.streams[0]);
          });
        }
        
        // Add new tracks
        mediaStream.getTracks().forEach(track => {
          peer.addTrack(track, mediaStream);
        });
      });
    } catch (error) {
      addDebugInfo(`Error starting media: ${(error as Error).message}`);
      toast({
        title: "Media Access Error",
        description: "Could not access camera or microphone. Please check your browser permissions.",
        variant: "destructive",
      });
    } finally {
      setIsJoining(false);
    }
  };

  // Stop all media
  const stopMedia = () => {
    if (stream) {
      addDebugInfo("Stopping all media tracks");
      
      stream.getTracks().forEach(track => {
        track.stop();
        addDebugInfo(`Stopped ${track.kind} track: ${track.label}`);
      });
      
      // Clear video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      // Update state
      setStream(null);
      setVideoEnabled(false);
      setAudioEnabled(false);
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      const newState = !audioEnabled;
      
      audioTracks.forEach(track => {
        track.enabled = newState;
        addDebugInfo(`Set audio track ${track.label} enabled: ${newState}`);
      });
      
      setAudioEnabled(newState);
    } else {
      addDebugInfo("Cannot toggle audio: no active stream");
      toast({
        title: "No Active Stream",
        description: "Start the media first before toggling audio.",
        variant: "destructive",
      });
    }
  };

  // Toggle video
  const toggleVideo = () => {
    if (stream) {
      const videoTracks = stream.getVideoTracks();
      const newState = !videoEnabled;
      
      videoTracks.forEach(track => {
        track.enabled = newState;
        addDebugInfo(`Set video track ${track.label} enabled: ${newState}`);
      });
      
      setVideoEnabled(newState);
    } else {
      addDebugInfo("Cannot toggle video: no active stream");
      toast({
        title: "No Active Stream",
        description: "Start the media first before toggling video.",
        variant: "destructive",
      });
    }
  };

  // Initialize a peer connection as the initiator
  const initiatePeerConnection = (peerId: number) => {
    if (peers[peerId]) {
      addDebugInfo(`Peer ${peerId} connection already exists`);
      return;
    }
    
    addDebugInfo(`Initiating connection to peer ${peerId} as initiator`);
    
    try {
      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: stream || undefined
      });
      
      // Handle signals
      peer.on('signal', (data) => {
        addDebugInfo(`Generated signal for peer ${peerId}, sending...`);
        webSocketClient.sendSignal(peerId, data);
      });
      
      // Handle stream
      peer.on('stream', (remoteStream) => {
        addDebugInfo(`Received stream from peer ${peerId}`);
        if (remoteVideoRefs.current[peerId]) {
          remoteVideoRefs.current[peerId]!.srcObject = remoteStream;
          
          // Try to start playback
          try {
            remoteVideoRefs.current[peerId]!.play()
              .then(() => addDebugInfo(`Remote video ${peerId} playback started`))
              .catch(err => addDebugInfo(`Error playing remote video ${peerId}: ${err.message}`));
          } catch (err) {
            addDebugInfo(`Error calling play() on remote video ${peerId}: ${(err as Error).message}`);
          }
        } else {
          addDebugInfo(`No video element ref for peer ${peerId}`);
        }
      });
      
      // Handle close
      peer.on('close', () => {
        addDebugInfo(`Connection to peer ${peerId} closed`);
        setPeers(prevPeers => {
          const newPeers = { ...prevPeers };
          delete newPeers[peerId];
          return newPeers;
        });
        setConnectedPeers(prev => prev.filter(id => id !== peerId));
      });
      
      // Handle error
      peer.on('error', (err) => {
        addDebugInfo(`Peer ${peerId} error: ${err.message}`);
        setPeers(prevPeers => {
          const newPeers = { ...prevPeers };
          delete newPeers[peerId];
          return newPeers;
        });
        setConnectedPeers(prev => prev.filter(id => id !== peerId));
      });
      
      // Add the peer to our list
      setPeers(prev => ({ ...prev, [peerId]: peer }));
      setConnectedPeers(prev => [...prev, peerId]);
      
    } catch (error) {
      addDebugInfo(`Error creating peer connection to ${peerId}: ${(error as Error).message}`);
    }
  };

  // Process incoming signals
  const processSignal = (data: { peer: number; data: any }) => {
    const { peer: peerId, data: signalData } = data;
    
    // If we already have a connection to this peer
    if (peers[peerId]) {
      addDebugInfo(`Processing signal for existing peer ${peerId}`);
      peers[peerId].signal(signalData);
    } else {
      // Create a new peer connection (non-initiator)
      addDebugInfo(`Creating new peer connection for ${peerId} (not initiator)`);
      
      try {
        const peer = new Peer({
          initiator: false,
          trickle: false,
          stream: stream || undefined
        });
        
        // Handle signals
        peer.on('signal', (data) => {
          addDebugInfo(`Generated response signal for peer ${peerId}`);
          webSocketClient.sendSignal(peerId, data);
        });
        
        // Handle stream
        peer.on('stream', (remoteStream) => {
          addDebugInfo(`Received stream from peer ${peerId}`);
          if (remoteVideoRefs.current[peerId]) {
            remoteVideoRefs.current[peerId]!.srcObject = remoteStream;
            
            // Try to start playback
            try {
              remoteVideoRefs.current[peerId]!.play()
                .then(() => addDebugInfo(`Remote video ${peerId} playback started`))
                .catch(err => addDebugInfo(`Error playing remote video ${peerId}: ${err.message}`));
            } catch (err) {
              addDebugInfo(`Error calling play() on remote video ${peerId}: ${(err as Error).message}`);
            }
          } else {
            addDebugInfo(`No video element ref for peer ${peerId}`);
          }
        });
        
        // Handle close
        peer.on('close', () => {
          addDebugInfo(`Connection to peer ${peerId} closed`);
          setPeers(prevPeers => {
            const newPeers = { ...prevPeers };
            delete newPeers[peerId];
            return newPeers;
          });
          setConnectedPeers(prev => prev.filter(id => id !== peerId));
        });
        
        // Handle error
        peer.on('error', (err) => {
          addDebugInfo(`Peer ${peerId} error: ${err.message}`);
          setPeers(prevPeers => {
            const newPeers = { ...prevPeers };
            delete newPeers[peerId];
            return newPeers;
          });
          setConnectedPeers(prev => prev.filter(id => id !== peerId));
        });
        
        // Process the signal data
        peer.signal(signalData);
        
        // Add the peer to our list
        setPeers(prev => ({ ...prev, [peerId]: peer }));
        setConnectedPeers(prev => [...prev, peerId]);
        
      } catch (error) {
        addDebugInfo(`Error creating peer connection from signal: ${(error as Error).message}`);
      }
    }
  };

  // Leave the video call completely
  const leaveVideoCall = () => {
    addDebugInfo("Leaving video call");
    
    // Stop all media tracks
    stopMedia();
    
    // Close all peer connections
    Object.values(peers).forEach(peer => {
      peer.destroy();
    });
    
    // Clear peer state
    setPeers({});
    setConnectedPeers([]);
  };

  // Toggle transcription (placeholder - implement actual transcription in a real app)
  const toggleTranscription = () => {
    setIsTranscribing(!isTranscribing);
    
    // This would be where you'd start or stop transcription service
    if (!isTranscribing) {
      addDebugInfo("Starting transcription");
      toast({
        title: "Transcription Started",
        description: "Speech recognition will now transcribe the lecture.",
      });
    } else {
      addDebugInfo("Stopping transcription");
    }
  };

  // Toggle recording (placeholder - implement actual recording in a real app)
  const toggleRecording = () => {
    setIsRecording(!isRecording);
    
    // This would be where you'd start or stop recording
    if (!isRecording) {
      addDebugInfo("Starting recording");
      toast({
        title: "Recording Started",
        description: "This lecture is now being recorded.",
      });
    } else {
      addDebugInfo("Stopping recording");
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Video display area */}
      <div className="relative">
        <div className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center">
          {!stream || !videoEnabled ? (
            <div className="text-center text-white p-4">
              <VideoOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-lg font-medium">Camera is off</p>
              
              {/* Hidden video element for audio-only */}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted={true}
                controls={false}
                className="hidden"
              >
                Your browser does not support video playback.
              </video>
            </div>
          ) : (
            <video
              ref={localVideoRef}
              autoPlay={true}
              playsInline={true}
              muted={true}
              controls={false}
              className="w-full h-full bg-black object-cover rounded-lg"
              style={{ minHeight: '240px', backgroundColor: '#000' }}
            >
              {/* Add fallback text for browsers that don't support video */}
              Your browser does not support video playback.
            </video>
          )}
          
          {/* Remote video thumbnails */}
          {connectedPeers.length > 0 && (
            <div className="absolute bottom-4 right-4 flex flex-wrap gap-2 max-w-[30%]">
              {connectedPeers.map(peerId => (
                <div 
                  key={peerId} 
                  className="w-24 h-24 bg-gray-800 rounded overflow-hidden border border-gray-700"
                >
                  <video
                    key={`video-${peerId}`}
                    ref={el => remoteVideoRefs.current[peerId] = el}
                    autoPlay={true}
                    playsInline={true}
                    className="w-full h-full bg-black object-cover"
                  >
                    {/* Fallback text */}
                    Your browser does not support video playback.
                  </video>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Control buttons */}
      <div className="flex flex-wrap items-center justify-center gap-3 py-2">
        <Button
          variant={audioEnabled ? "default" : "outline"}
          size="icon"
          onClick={toggleAudio}
          className="rounded-full w-10 h-10"
          disabled={!stream}
        >
          {audioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        
        <Button
          variant={videoEnabled ? "default" : "outline"}
          size="icon"
          onClick={toggleVideo}
          className="rounded-full w-10 h-10"
          disabled={!stream}
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
              className="rounded-full w-10 h-10"
              title="Toggle Recording"
            >
              {isRecording ? <Square className="h-5 w-5" /> : <Circle className="h-5 w-5 fill-red-500" />}
            </Button>
          </>
        )}
        
        <Button
          variant="outline"
          size="icon"
          className="rounded-full w-10 h-10"
          onClick={getDevices}
          title="Refresh Devices"
        >
          <RefreshCcw className="h-5 w-5" />
        </Button>

        <Button
          variant="default"
          onClick={startMedia}
          disabled={isJoining}
          className={`ml-auto ${!isJoining ? "bg-green-600 hover:bg-green-700" : ""}`}
        >
          {isJoining ? "Connecting..." : "Start Video"}
        </Button>
        
        <Button
          variant="destructive"
          onClick={leaveVideoCall}
          disabled={!stream}
        >
          <PhoneOff className="h-5 w-5 mr-2" />
          Leave
        </Button>
      </div>

      {/* Debug info */}
      {debugInfo.length > 0 && (
        <div className="mt-4 p-2 text-xs bg-gray-100 dark:bg-gray-800 rounded-md max-h-32 overflow-y-auto">
          <p className="font-semibold mb-1">Debug Info:</p>
          {debugInfo.slice(-10).map((info, i) => (
            <div key={i} className="font-mono text-gray-600 dark:text-gray-400">
              {info}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}