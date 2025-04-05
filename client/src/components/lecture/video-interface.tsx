import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
      console.log("Enumerating devices...");
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const audioDevices = devices.filter(device => device.kind === 'audioinput');
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      console.log(`Found ${audioDevices.length} audio devices and ${videoDevices.length} video devices`);
      
      // Log detailed device info to help with debugging
      if (audioDevices.length > 0) {
        console.log("Audio devices:", audioDevices.map(device => ({
          deviceId: device.deviceId.substring(0, 8) + '...',
          label: device.label || 'Unnamed device'
        })));
      }
      
      if (videoDevices.length > 0) {
        console.log("Video devices:", videoDevices.map(device => ({
          deviceId: device.deviceId.substring(0, 8) + '...',
          label: device.label || 'Unnamed device'
        })));
      }
      
      setAudioInputDevices(audioDevices);
      setVideoInputDevices(videoDevices);
      
      if (audioDevices.length > 0 && !selectedAudioDevice) {
        console.log("Setting default audio device:", audioDevices[0].label || 'Default audio device');
        setSelectedAudioDevice(audioDevices[0].deviceId);
      }
      
      if (videoDevices.length > 0 && !selectedVideoDevice) {
        console.log("Setting default video device:", videoDevices[0].label || 'Default video device');
        setSelectedVideoDevice(videoDevices[0].deviceId);
      }
      
      return { audioDevices, videoDevices };
    } catch (error) {
      console.error('Error getting media devices:', error);
      return { audioDevices: [], videoDevices: [] };
    }
  };
  
  // Initialize devices
  useEffect(() => {
    console.log("Initializing media devices...");
    
    // Initial device discovery - this will be incomplete without permissions
    getDevices().then(() => {
      console.log("Initial device enumeration complete");
    });
    
    // Request permissions for at least one type of device to enable full device discovery
    async function requestInitialPermissions() {
      console.log("Requesting initial permissions...");
      
      // Try different combinations of constraints, in order of preference
      const constraintOptions = [
        { audio: true, video: true },  // Ideal case - both permissions
        { video: true },               // Just video
        { audio: true }                // Just audio
      ];
      
      let permissionGranted = false;
      
      for (const constraints of constraintOptions) {
        if (permissionGranted) break;
        
        try {
          console.log("Trying to get permission with constraints:", constraints);
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          console.log("Permission granted for:", constraints);
          
          // Permission granted - stop the stream to release devices
          stream.getTracks().forEach(track => {
            track.stop();
            console.log(`Stopped ${track.kind} track to release device`);
          });
          
          // Now we can get a complete list of devices
          await getDevices();
          permissionGranted = true;
          
          console.log("Full device list obtained after permissions granted");
        } catch (error) {
          console.warn(`Could not get permission for ${JSON.stringify(constraints)}:`, error);
        }
      }
      
      if (!permissionGranted) {
        console.error('Failed to get any media permissions');
        toast({
          title: "Camera/Microphone Access Required",
          description: "Please allow access to your camera or microphone to use the video features.",
          variant: "destructive",
        });
      }
    }
    
    requestInitialPermissions();
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
    console.log("Toggle video called. Current state:", {
      stream: stream ? "exists" : "null",
      videoEnabled,
      selectedVideoDevice
    });
    
    if (!stream || stream.getVideoTracks().length === 0) {
      // If no stream exists or no video tracks, create a new stream
      try {
        console.log("Attempting to get user media for video...");
        
        // First, try without specific device ID to ensure we get any camera
        const constraints = {
          video: true,
          // Only include audio if already enabled
          ...(audioEnabled && { audio: { deviceId: selectedAudioDevice ? { exact: selectedAudioDevice } : undefined } })
        };
        
        console.log("Using constraints:", constraints);
        
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log("Successfully got video stream with", newStream.getVideoTracks().length, "video tracks");
        
        // If we already have an audio stream, merge the tracks
        if (stream && stream.getAudioTracks().length > 0 && audioEnabled) {
          stream.getAudioTracks().forEach(track => {
            newStream.addTrack(track);
          });
        }
        
        setStream(newStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = newStream;
        }
        setVideoEnabled(true);
      } catch (error) {
        console.error('Error getting video stream:', error);
        toast({
          title: "Camera Access Error",
          description: "Could not access your camera. Please check your browser permissions and make sure your camera is properly connected.",
          variant: "destructive",
        });
      }
    } else {
      // Toggle existing video tracks
      console.log("Toggling existing video tracks. Current state:", videoEnabled);
      stream.getVideoTracks().forEach(track => {
        track.enabled = !videoEnabled;
        console.log("Set video track enabled to:", !videoEnabled);
      });
      setVideoEnabled(!videoEnabled);
    }
  };
  
  // Join video call
  const joinVideoCall = async () => {
    console.log("Joining video call...");
    try {
      // First try with simpler constraints to ensure we get at least something
      console.log("Attempting to get user media with basic constraints");
      const constraints = {
        audio: true,
        video: true
      };
      
      console.log("Using constraints:", constraints);
      
      let newStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log("Successfully got media stream with basic constraints");
      } catch (basicError) {
        console.error("Failed with basic constraints:", basicError);
        
        // If that fails, try with even more basic constraints - video only
        try {
          console.log("Trying with video-only constraints");
          newStream = await navigator.mediaDevices.getUserMedia({ video: true });
          console.log("Successfully got video-only stream");
        } catch (videoError) {
          console.error("Failed with video-only constraints:", videoError);
          
          // If that also fails, try with just audio
          try {
            console.log("Trying with audio-only constraints");
            newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Successfully got audio-only stream");
          } catch (audioError) {
            console.error("Failed with audio-only constraints:", audioError);
            // Re-throw the original error for the catch block
            throw basicError;
          }
        }
      }
      
      console.log("Stream obtained successfully with", 
        newStream.getVideoTracks().length, "video tracks and",
        newStream.getAudioTracks().length, "audio tracks");
      
      setStream(newStream);
      setAudioEnabled(newStream.getAudioTracks().length > 0);
      setVideoEnabled(newStream.getVideoTracks().length > 0);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
      }
      
      // Join the WebSocket video room
      webSocketClient.joinVideo();
      
    } catch (error) {
      console.error('Error joining video call:', error);
      toast({
        title: "Media Access Error",
        description: "Failed to access your camera and microphone. Please check your device permissions and ensure your camera is properly connected.",
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
  
  // We're removing manual transcription as requested
  // This implementation will focus solely on direct speech recognition
  
  // Create a separate function to set up the speech recognition instance
  const setupSpeechRecognition = () => {
    // Check if SpeechRecognition is available
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      toast({
        title: "Speech Recognition Not Supported",
        description: "Speech recognition is not supported in your browser. Please try using a modern browser like Chrome or Edge.",
        duration: 5000,
      });
      return false;
    }
    
    try {
      // Clean up any existing recognition instance
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore errors when stopping an existing instance
        }
      }
      
      // Create a new instance
      recognitionRef.current = new SpeechRecognition();
      const recognition = recognitionRef.current;
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        setIsTranscribing(true);
        console.log("Speech recognition started successfully");
      };
      
      return true;
    } catch (error) {
      console.error("Error setting up speech recognition:", error);
      toast({
        title: "Speech Recognition Error",
        description: "Failed to initialize speech recognition.",
        variant: "destructive",
      });
      return false;
    }
  };
  
  const startTranscription = () => {
    // Reset retry counter
    networkRetryCountRef.current = 0;
    
    // Set up a new speech recognition instance
    if (!setupSpeechRecognition()) {
      return;
    }
    
    try {
      const recognition = recognitionRef.current;
      
      // Reset transcript when starting new session
      transcriptRef.current = [];
      
      recognition.onstart = () => {
        setIsTranscribing(true);
        transcriptRef.current = [];
      };
      
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join(' ');
        
        console.log("Speech recognition result:", transcript);
        
        // Send interim results too, but mark them as not final
        const currentResult = event.results[event.results.length - 1];
        const currentTranscript = currentResult[0].transcript;
        const isFinal = currentResult.isFinal;
        
        console.log(`Sending transcription: "${currentTranscript}", isFinal: ${isFinal}`);
        webSocketClient.sendTranscription(currentTranscript, isFinal);
        
        // For final results, store them in our transcript history
        if (isFinal) {
          transcriptRef.current.push(currentTranscript);
          console.log("Final transcript segment added:", currentTranscript);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        
        if (event.error === 'no-speech') {
          // This is a common error, just restart without notification
          // to avoid overwhelming the user with messages
          recognition.stop();
          setTimeout(() => {
            if (isTranscribing) recognition.start();
          }, 100);
        } else if (event.error === 'network') {
          // Network errors are common in development and browser environments
          // This happens especially in sandboxed environments like Replit
          
          networkRetryCountRef.current += 1;
          
          // Calculate retry delay with exponential backoff (max 15 seconds)
          const retryDelay = Math.min(1000 * Math.pow(1.5, Math.min(networkRetryCountRef.current, 8)), 15000);
          
          // Only show toast at specific meaningful points to avoid flooding the UI
          if (networkRetryCountRef.current === 1) {
            toast({
              title: "Transcription Network Issue",
              description: "The speech recognition service is connecting. Please continue speaking.",
              duration: 3000,
            });
          } else if (networkRetryCountRef.current === 5) {
            toast({
              title: "Speech Recognition Issues",
              description: "Connectivity issues detected. The system will continue trying to transcribe automatically.",
              duration: 10000,
            });
          } else if (networkRetryCountRef.current === 15) {
            toast({
              title: "Persistent Network Issues",
              description: "Speech recognition is experiencing persistent connection problems. Please ensure your microphone is working correctly.",
              variant: "destructive",
              duration: 10000,
            });
          }
          
          console.log(`Speech recognition network error #${networkRetryCountRef.current}, retrying in ${retryDelay}ms`);
          
          try {
            recognition.stop();
          } catch (e) {
            // Ignore errors when stopping
          }
          
          setTimeout(() => {
            // Only restart if transcription is still enabled
            if (isTranscribing) {
              try {
                // First try restarting the existing instance
                recognition.start();
                console.log("Speech recognition restarted after network error");
              } catch (e) {
                console.error("Failed to restart recognition, creating new instance:", e);
                
                // If that fails, create a completely new recognition instance
                if (setupSpeechRecognition() && recognitionRef.current) {
                  try {
                    recognitionRef.current.start();
                    console.log("New speech recognition instance started successfully");
                  } catch (err) {
                    console.error("New speech recognition instance also failed to start:", err);
                    
                    // If we hit a high error count, suggest checking hardware
                    if (networkRetryCountRef.current > 20) {
                      toast({
                        title: "Speech Recognition Failed",
                        description: "Please check your microphone and browser permissions. The system will continue trying to reconnect.",
                        variant: "destructive",
                        duration: 10000,
                      });
                    }
                  }
                }
              }
            }
          }, retryDelay);
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
            console.log("Speech recognition ended, attempting to restart...");
            recognition.start();
          } catch (e) {
            console.error('Failed to restart recognition after end event', e);
            
            // Try to recreate the recognition instance
            console.log("Attempting to create a new speech recognition instance...");
            if (setupSpeechRecognition() && recognitionRef.current) {
              try {
                recognitionRef.current.start();
                console.log("New speech recognition instance started successfully after end event");
              } catch (err) {
                console.error("Failed to start new speech recognition instance after end event:", err);
                
                // If everything fails, just toggle transcription to give visual feedback
                if (networkRetryCountRef.current > 20) {
                  console.log("Too many errors, stopping transcription");
                  stopTranscription();
                  toast({
                    title: "Transcription Stopped",
                    description: "Speech recognition encountered too many errors and was stopped automatically.",
                    variant: "destructive",
                  });
                }
              }
            }
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

  // Function to test manual note generation
  const testNoteGeneration = async () => {
    const testText = "This is a test of the note generation system. The human brain processes visual information faster than text. Colors can influence emotions and decision-making. Learning styles vary among individuals. Memory retention improves with repeated exposure to information over time.";
    
    console.log("Sending test transcription:", testText);
    webSocketClient.sendTranscription(testText, true);
    
    toast({
      title: "Test Transcription Sent",
      description: "A test transcription has been sent to generate notes.",
    });
    
    // Set up a listener for note generation errors
    webSocketClient.once("note_generation_error", (data) => {
      console.error("Note generation error:", data);
      toast({
        title: "Note Generation Error",
        description: data.details || data.message,
        variant: "destructive",
      });
    });
    
    // Set up a listener for successfully generated notes
    webSocketClient.once("lecture_note", (data) => {
      console.log("Lecture note received:", data);
      toast({
        title: "Note Generated",
        description: "AI successfully generated a note from your test transcription.",
      });
    });
  };

  // Initialize WebSocket connection and add websocket event listeners
  useEffect(() => {
    if (user) {
      console.log("Connecting to WebSocket server...");
      webSocketClient.connect();
      webSocketClient.authenticate(user.id);
      
      if (lectureId) {
        console.log(`Joining lecture ${lectureId}...`);
        webSocketClient.joinLecture(lectureId);
      }
      
      // Set up global WebSocket event listeners
      webSocketClient.on("error", (data) => {
        console.error("WebSocket error:", data);
        toast({
          title: "WebSocket Error",
          description: data.message || "An error occurred with the WebSocket connection.",
          variant: "destructive",
        });
      });
      
      webSocketClient.on("note_generation_error", (data) => {
        console.error("Note generation error:", data);
        toast({
          title: "Note Generation Error",
          description: data.details || data.message,
          variant: "destructive",
        });
      });
    }
    
    return () => {
      // Clean up event listeners
      webSocketClient.off("error", () => {});
      webSocketClient.off("note_generation_error", () => {});
    };
  }, [user, lectureId]);

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
        
        {isTeacher && (
          <Button
            variant="outline"
            onClick={testNoteGeneration}
            className="rounded-full"
            title="Test Note Generation"
          >
            Test Notes
          </Button>
        )}

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
