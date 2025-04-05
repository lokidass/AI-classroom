import React, { useState, useEffect, useRef, createRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Video, VideoOff, RefreshCcw, Users } from "lucide-react";
import { webSocketClient } from "@/lib/websocket";
import '@/lib/simple-peer-polyfill.js';
// Import SimplePeer dynamically to ensure polyfill is loaded first
import SimplePeer from 'simple-peer';

interface EnhancedVideoInterfaceProps {
  lectureId: number;
  isTeacher?: boolean;
}

interface Peer {
  id: number;
  name: string;
  peer?: any; // SimplePeer instance
  stream?: MediaStream;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export default function EnhancedVideoInterface({ lectureId, isTeacher = false }: EnhancedVideoInterfaceProps) {
  const { toast } = useToast();
  
  // State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [participants, setParticipants] = useState<{id: number, name: string}[]>([]);
  const [peers, setPeers] = useState<Record<number, Peer>>({});
  
  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  
  // Add a log message
  const addLog = (message: string) => {
    console.log(`[EnhancedVideoInterface] ${message}`);
  };
  
  // Initialize WebSocket and media
  useEffect(() => {
    // Display a simple participant entry
    setParticipants([
      { id: -1, name: isTeacher ? "You (Teacher)" : "You (Student)" }
    ]);
    
    addLog(`Initializing for lecture ${lectureId}`);
    
    // Start local media stream with a slight delay to ensure the component is fully mounted
    const timer = setTimeout(() => {
      startLocalStream();
    }, 500);
    
    // Setup WebSocket handlers
    webSocketClient.on('peers_in_lecture', handlePeersInLecture);
    webSocketClient.on('peer_joined', handlePeerJoined);
    webSocketClient.on('peer_left', handlePeerLeft);
    webSocketClient.on('signal', handleSignal);
    
    // Join video room when WebSocket is ready
    webSocketClient.joinVideo();
    addLog('Joined video room via WebSocket');
    
    return () => {
      // Cleanup
      clearTimeout(timer);
      if (localStream) {
        stopLocalStream();
      }
      
      // Close all peer connections
      Object.values(peers).forEach(peer => {
        if (peer.peer) {
          peer.peer.destroy();
          addLog(`Destroyed peer connection for ${peer.id}`);
        }
      });
      
      // Remove WebSocket handlers
      webSocketClient.off('peers_in_lecture', handlePeersInLecture);
      webSocketClient.off('peer_joined', handlePeerJoined);
      webSocketClient.off('peer_left', handlePeerLeft);
      webSocketClient.off('signal', handleSignal);
      
      // Leave video room
      webSocketClient.leaveVideo();
      addLog('Left video room');
    };
  }, [lectureId]);
  
  // When local stream changes, update all peer connections
  useEffect(() => {
    if (localStream) {
      // Add stream to any existing peers
      Object.values(peers).forEach(peer => {
        if (peer.peer) {
          try {
            addLog(`Adding local stream to existing peer ${peer.id}`);
            peer.peer.addStream(localStream);
          } catch (error) {
            addLog(`Error adding stream to peer ${peer.id}: ${(error as Error).message}`);
          }
        }
      });
    }
  }, [localStream]);
  
  // Handle peers in lecture (when first joining)
  const handlePeersInLecture = (data: { peers: number[] }) => {
    addLog(`Received peers in lecture: ${data.peers.join(', ') || 'none'}`);
    
    // Create peer connections for each peer
    data.peers.forEach(peerId => {
      createPeer(peerId, true);
    });
  };
  
  // Handle peer joined event
  const handlePeerJoined = (data: { peerId: number }) => {
    const { peerId } = data;
    addLog(`Peer joined: ${peerId}`);
    
    // Only create a new peer if it doesn't already exist
    if (!peers[peerId]) {
      createPeer(peerId, false);
    }
  };
  
  // Handle peer left event
  const handlePeerLeft = (data: { peerId: number }) => {
    const { peerId } = data;
    addLog(`Peer left: ${peerId}`);
    
    // Destroy and remove the peer
    if (peers[peerId] && peers[peerId].peer) {
      peers[peerId].peer?.destroy();
      
      setPeers(prevPeers => {
        const newPeers = { ...prevPeers };
        delete newPeers[peerId];
        return newPeers;
      });
    }
  };
  
  // Handle WebRTC signal (for peer connection)
  const handleSignal = (data: { peer: number, data: any }) => {
    const { peer: peerId, data: signal } = data;
    addLog(`Received signal from peer ${peerId}`);
    
    // If the peer exists, signal to it
    if (peers[peerId] && peers[peerId].peer) {
      try {
        peers[peerId].peer?.signal(signal);
      } catch (error) {
        addLog(`Error signaling to peer ${peerId}: ${(error as Error).message}`);
      }
    } else {
      addLog(`Received signal for unknown peer ${peerId}`);
    }
  };
  
  // Create a new peer connection (initiator = true if we're initiating the connection)
  const createPeer = (peerId: number, initiator: boolean) => {
    addLog(`Creating ${initiator ? 'initiator' : 'receiver'} peer for ${peerId}`);
    
    try {
      // Check if simple-peer is available
      if (typeof SimplePeer !== 'function') {
        throw new Error('SimplePeer is not available. Polyfill may not be loaded correctly.');
      }
      
      // Create a new video element ref for this peer
      const videoRef = React.createRef<HTMLVideoElement>();
      
      // Create a new SimplePeer instance
      const peer = new SimplePeer({
        initiator,
        stream: localStream || undefined,
        trickle: true,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });
      
      // Set up peer event handlers
      peer.on('signal', (data) => {
        addLog(`Generated signal for peer ${peerId}`);
        webSocketClient.sendSignal(peerId, data);
      });
      
      peer.on('stream', (stream) => {
        addLog(`Received stream from peer ${peerId}`);
        
        // Update the peer in state with the stream
        setPeers(prevPeers => ({
          ...prevPeers,
          [peerId]: {
            ...prevPeers[peerId],
            stream
          }
        }));
        
        // Connect the stream to the video element
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(err => {
            addLog(`Error playing video for peer ${peerId}: ${err.message}`);
          });
        }
      });
      
      peer.on('connect', () => {
        addLog(`Connected to peer ${peerId}`);
        toast({
          title: "Peer Connected",
          description: `Connected to participant ${peerId}`,
          duration: 3000
        });
      });
      
      peer.on('close', () => {
        addLog(`Connection to peer ${peerId} closed`);
        
        setPeers(prevPeers => {
          // Only remove if it's the same peer instance
          if (prevPeers[peerId] && prevPeers[peerId].peer === peer) {
            const newPeers = { ...prevPeers };
            delete newPeers[peerId];
            return newPeers;
          }
          return prevPeers;
        });
      });
      
      peer.on('error', (err) => {
        addLog(`Error with peer ${peerId}: ${err.message}`);
        toast({
          title: "Connection Error",
          description: `Error connecting to peer: ${err.message}`,
          variant: "destructive"
        });
      });
      
      // Add the peer to state
      setPeers(prevPeers => ({
        ...prevPeers,
        [peerId]: {
          id: peerId,
          name: `Participant ${peerId}`,
          peer,
          videoRef
        }
      }));
      
    } catch (error) {
      addLog(`Error creating peer for ${peerId}: ${(error as Error).message}`);
      toast({
        title: "Connection Error",
        description: `Could not create peer connection: ${(error as Error).message}`,
        variant: "destructive"
      });
    }
  };
  
  // Start local stream
  const startLocalStream = async () => {
    try {
      addLog("Requesting media access...");
      
      // First, check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser doesn't support media device access. Please try a different browser.");
      }
      
      // Stop any existing stream
      if (localStream) {
        stopLocalStream();
      }
      
      // Setup constraints
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      };
      
      addLog(`Using constraints: ${JSON.stringify(constraints)}`);
      
      // Try to get both audio and video
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        addLog("Successfully got both audio and video");
        toast({
          title: "Media Connected",
          description: "Camera and microphone connected successfully.",
        });
      } catch (err) {
        // If that fails, try just audio
        addLog(`Error getting both: ${(err as Error).message}, trying audio only`);
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          addLog("Successfully got just audio");
          toast({
            title: "Audio Only",
            description: "Microphone connected, but camera access failed.",
          });
        } catch (audioErr) {
          // If that fails, try just video
          addLog(`Error getting audio: ${(audioErr as Error).message}, trying video only`);
          try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            addLog("Successfully got just video");
            toast({
              title: "Video Only",
              description: "Camera connected, but microphone access failed.",
            });
          } catch (videoErr) {
            throw new Error("Could not access your camera or microphone. Please check your browser permissions.");
          }
        }
      }
      
      // Update state
      setLocalStream(mediaStream);
      setAudioEnabled(mediaStream.getAudioTracks().length > 0);
      setVideoEnabled(mediaStream.getVideoTracks().length > 0);
      
      // Log track info
      mediaStream.getTracks().forEach(track => {
        addLog(`Track: ${track.kind}, ${track.label}, enabled: ${track.enabled}`);
      });
      
      // Connect to video element
      if (localVideoRef.current) {
        addLog("Attaching stream to video element");
        localVideoRef.current.srcObject = mediaStream;
        
        try {
          await localVideoRef.current.play();
          addLog("Video playback started");
        } catch (playErr) {
          addLog(`Error playing video: ${(playErr as Error).message}`);
          toast({
            title: "Playback Error",
            description: "Could not automatically play video. Try clicking the play button.",
            variant: "destructive"
          });
        }
      } else {
        addLog("Video element reference is null");
      }
      
    } catch (error) {
      addLog(`Error accessing media: ${(error as Error).message}`);
      toast({
        title: "Media Access Error",
        description: "Could not access your camera or microphone. Please check your browser permissions.",
        variant: "destructive"
      });
    }
  };
  
  // Stop local stream
  const stopLocalStream = () => {
    if (localStream) {
      addLog("Stopping all tracks");
      localStream.getTracks().forEach(track => {
        track.stop();
        addLog(`Stopped ${track.kind} track`);
      });
      
      // Clean up video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      // Update state
      setLocalStream(null);
      setAudioEnabled(false);
      setVideoEnabled(false);
    }
  };
  
  // Toggle audio
  const toggleAudio = () => {
    if (localStream) {
      const tracks = localStream.getAudioTracks();
      const newEnabled = !audioEnabled;
      
      tracks.forEach(track => {
        track.enabled = newEnabled;
        addLog(`Set audio track ${track.label} enabled: ${newEnabled}`);
      });
      
      setAudioEnabled(newEnabled);
    } else {
      addLog("Cannot toggle audio: no active stream");
    }
  };
  
  // Toggle video
  const toggleVideo = () => {
    if (localStream) {
      const tracks = localStream.getVideoTracks();
      const newEnabled = !videoEnabled;
      
      tracks.forEach(track => {
        track.enabled = newEnabled;
        addLog(`Set video track ${track.label} enabled: ${newEnabled}`);
      });
      
      setVideoEnabled(newEnabled);
    } else {
      addLog("Cannot toggle video: no active stream");
    }
  };
  
  // Render remote videos
  const renderRemoteVideos = () => {
    const peersList = Object.values(peers);
    
    if (peersList.length === 0) {
      return (
        <div className="text-center p-6 border rounded-md bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
          <div>
            <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm text-gray-500">No other participants yet</p>
          </div>
        </div>
      );
    }
    
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {peersList.map(peer => (
          <div key={peer.id} className="bg-slate-800 rounded-lg overflow-hidden">
            <div className="relative aspect-video flex items-center justify-center">
              {!peer.stream ? (
                <div className="text-center text-white p-4">
                  <VideoOff className="h-8 w-8 mx-auto mb-1 opacity-50" />
                  <p className="text-xs font-medium">Connecting...</p>
                </div>
              ) : (
                <video
                  ref={peer.videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                />
              )}
              <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-1 text-xs rounded">
                {peer.name}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Local video */}
      <div className="md:col-span-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-medium mb-3">Your Video</h3>
            
            <div className="relative aspect-video bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center mb-4">
              {!localStream || !videoEnabled ? (
                <div className="text-center text-white p-4">
                  <VideoOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-lg font-medium">Camera is off</p>
                  {localStream ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="mt-2 bg-white/20 hover:bg-white/30 text-white"
                      onClick={toggleVideo}
                    >
                      Turn on camera
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="mt-2 bg-white/20 hover:bg-white/30 text-white"
                      onClick={startLocalStream}
                    >
                      Start media
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <video
                    ref={localVideoRef}
                    className="w-full h-full object-cover"
                    autoPlay
                    playsInline
                    muted={true} // Always mute local video to prevent feedback
                    controls={false}
                  />
                  {/* Audio indicator */}
                  <div className="absolute bottom-2 right-2 bg-black/40 p-1 rounded-md">
                    {audioEnabled ? (
                      <Mic className="h-5 w-5 text-green-400" />
                    ) : (
                      <MicOff className="h-5 w-5 text-red-400" />
                    )}
                  </div>
                </>
              )}
            </div>
            
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div className="space-x-2">
                <Button 
                  variant={audioEnabled ? "default" : "outline"}
                  size="icon"
                  onClick={toggleAudio}
                  disabled={!localStream || localStream.getAudioTracks().length === 0}
                >
                  {audioEnabled ? <Mic /> : <MicOff />}
                </Button>
                
                <Button 
                  variant={videoEnabled ? "default" : "outline"}
                  size="icon"
                  onClick={toggleVideo}
                  disabled={!localStream || localStream.getVideoTracks().length === 0}
                >
                  {videoEnabled ? <Video /> : <VideoOff />}
                </Button>
              </div>
              
              <div>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={startLocalStream}
                  className="whitespace-nowrap"
                >
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  {localStream ? "Restart Media" : "Start Media"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Remote Videos - only render if there are peers */}
        {Object.keys(peers).length > 0 && (
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium">
                  Remote Participants
                </h3>
                <span className="bg-primary/10 text-primary px-2 py-1 rounded-full text-xs font-medium">
                  {Object.keys(peers).length}
                </span>
              </div>
              {renderRemoteVideos()}
            </CardContent>
          </Card>
        )}
      </div>
      
      {/* Status and Participants */}
      <div className="space-y-4">
        {/* Lecture status */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-medium mb-2">Status</h3>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <p className="text-sm">Lecture is active</p>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              <p>Video: {localStream?.getVideoTracks().length ? "Connected" : "Not connected"}</p>
              <p>Audio: {localStream?.getAudioTracks().length ? "Connected" : "Not connected"}</p>
              <p>Connected peers: {Object.keys(peers).length}</p>
            </div>
          </CardContent>
        </Card>
        
        {/* Participants List */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Participants
              </h3>
              <span className="bg-primary/10 text-primary px-2 py-1 rounded-full text-xs font-medium">
                {Object.keys(peers).length + 1} {/* +1 for local user */}
              </span>
            </div>
            
            <ul className="space-y-2">
              {/* Local user */}
              <li className="flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mr-3">
                  Y
                </div>
                <div>
                  <p className="text-sm font-medium">You</p>
                  <p className="text-xs text-gray-500">
                    {isTeacher ? "Teacher" : "Student"}
                  </p>
                </div>
              </li>
              
              {/* Remote peers */}
              {Object.values(peers).map(peer => (
                <li 
                  key={peer.id} 
                  className="flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mr-3">
                    {peer.id.toString()[0] || 'P'}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{peer.name}</p>
                    <p className="text-xs text-gray-500">
                      Participant
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}