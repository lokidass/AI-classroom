import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Mic, MicOff, Video, VideoOff, RefreshCcw, Users } from 'lucide-react';
import { webSocketClient } from '@/lib/websocket';
import '@/lib/simple-peer-polyfill.js';

// Create a custom interface for simple-peer
interface SimplePeer {
  on: (event: string, callback: (...args: any[]) => void) => void;
  signal: (data: any) => void;
  destroy: () => void;
  addStream: (stream: MediaStream) => void;
  removeStream: (stream: MediaStream) => void;
}

// Define the SimplePeer constructor type
type SimplePeerConstructor = new (options: any) => SimplePeer;

interface BasicVideoChatProps {
  lectureId: number;
  isTeacher?: boolean;
}

export default function BasicVideoChat({ lectureId, isTeacher = false }: BasicVideoChatProps) {
  const { toast } = useToast();
  
  // References
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideos = useRef<Map<number, HTMLVideoElement>>(new Map());
  const peers = useRef<Map<number, SimplePeer>>(new Map());
  
  // State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [remoteUsers, setRemoteUsers] = useState<{id: number, name: string}[]>([]);
  const [initialized, setInitialized] = useState(false);
  
  // Logger function with enhanced visibility
  const log = (message: string) => {
    console.log(`%c[BasicVideoChat] ${message}`, 'background: #222; color: #bada55; padding: 2px 4px; border-radius: 2px');
  };
  
  // Register WebSocket event handlers
  useEffect(() => {
    log(`Setting up WebSocket event handlers`);
    
    // Register all event handlers first
    webSocketClient.on('peer_joined', handlePeerJoined);
    webSocketClient.on('peer_left', handlePeerLeft);
    webSocketClient.on('signal', handleSignal);
    webSocketClient.on('peers_in_lecture', handlePeersInLecture);
    
    return () => {
      // Clean up all event handlers
      log('Removing WebSocket event handlers');
      webSocketClient.off('peer_joined', handlePeerJoined);
      webSocketClient.off('peer_left', handlePeerLeft);
      webSocketClient.off('signal', handleSignal);
      webSocketClient.off('peers_in_lecture', handlePeersInLecture);
    };
  }, []); // This only needs to run once
  
  // Initialize media and join video room
  useEffect(() => {
    log(`Initializing for lecture ${lectureId}`);
    
    const initializeVideoChat = async () => {
      try {
        // Check if SimplePeer is available
        if (!(window as any).SimplePeer) {
          log('SimplePeer not available yet, will retry in 1 second');
          setTimeout(initializeVideoChat, 1000);
          return;
        }
        
        // Start media first to get access to camera/mic
        const stream = await startLocalStream();
        if (!stream) {
          throw new Error('Failed to get local media stream');
        }
        
        // Then join the video room, which will trigger connection with other peers
        webSocketClient.joinVideo();
        log('Joined video room with userId: ' + webSocketClient.userId);
        
        setInitialized(true);
      } catch (error) {
        log(`Error initializing: ${(error as Error).message}`);
        toast({
          title: 'Initialization Error',
          description: `${(error as Error).message}. Try refreshing the page.`,
          variant: 'destructive'
        });
      }
    };
    
    initializeVideoChat();
    
    // Cleanup on unmount or lecture change
    return () => {
      log(`Cleaning up for lecture ${lectureId}`);
      
      // Leave video room first
      webSocketClient.leaveVideo();
      log('Left video room');
      
      // Then close all peer connections
      peers.current.forEach(peer => {
        peer.destroy();
      });
      peers.current.clear();
      
      // Finally stop local media
      stopLocalStream();
      
      setRemoteUsers([]);
      setInitialized(false);
    };
  }, [lectureId]);
  
  // Handle existing peers in lecture
  const handlePeersInLecture = (data: { peers: number[] }) => {
    log(`Received existing peers: ${data.peers.join(', ') || 'none'}`);
    
    // Create a peer connection for each existing user
    data.peers.forEach(peerId => {
      if (!peers.current.has(peerId)) {
        createPeerConnection(peerId, true);
      }
    });
    
    // Update the list of remote users
    setRemoteUsers(prev => [
      ...prev,
      ...data.peers.filter(id => !prev.some(u => u.id === id))
        .map(id => ({ id, name: `Participant ${id}` }))
    ]);
  };
  
  // Handle new peer joining
  const handlePeerJoined = (data: { peerId: number }) => {
    const { peerId } = data;
    log(`Peer joined: ${peerId}`);
    
    // Create a peer connection if it doesn't exist
    if (!peers.current.has(peerId)) {
      createPeerConnection(peerId, false);
    }
    
    // Add user to the list of remote users
    setRemoteUsers(prev => {
      if (!prev.some(u => u.id === peerId)) {
        return [...prev, { id: peerId, name: `Participant ${peerId}` }];
      }
      return prev;
    });
  };
  
  // Handle peer leaving
  const handlePeerLeft = (data: { peerId: number }) => {
    const { peerId } = data;
    log(`Peer left: ${peerId}`);
    
    // Clean up peer connection
    if (peers.current.has(peerId)) {
      peers.current.get(peerId)?.destroy();
      peers.current.delete(peerId);
    }
    
    // Remove user from the list
    setRemoteUsers(prev => prev.filter(u => u.id !== peerId));
  };
  
  // Handle WebRTC signaling
  const handleSignal = (data: { peer: number, data: any }) => {
    const { peer: peerId, data: signalData } = data;
    log(`Received signal from peer ${peerId}`);
    
    // Forward the signal to the appropriate peer
    if (peers.current.has(peerId)) {
      try {
        peers.current.get(peerId)?.signal(signalData);
      } catch (error) {
        log(`Error signaling to peer ${peerId}: ${(error as Error).message}`);
      }
    } else {
      log(`Received signal for unknown peer ${peerId}`);
    }
  };
  
  // Create a peer connection
  const createPeerConnection = (peerId: number, initiator: boolean) => {
    log(`Creating ${initiator ? 'initiator' : 'receiver'} peer for ${peerId}`);
    
    try {
      // Get SimplePeer from the global window object (loaded from CDN)
      const SimplePeer = (window as any).SimplePeer as SimplePeerConstructor;
      if (!SimplePeer) {
        throw new Error('SimplePeer is not available. It should be loaded from CDN in index.html.');
      }
      
      // Create a new peer connection
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
      
      // Set up event handlers
      peer.on('signal', signalData => {
        log(`Generated signal for peer ${peerId}`);
        webSocketClient.sendSignal(peerId, signalData);
      });
      
      peer.on('stream', stream => {
        log(`Received stream from peer ${peerId}`);
        
        // Find or create a video element for the remote stream
        const videoElement = document.createElement('video');
        videoElement.id = `remote-video-${peerId}`;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.srcObject = stream;
        
        // Store the video element
        remoteVideos.current.set(peerId, videoElement);
        
        // Append the video element to the DOM
        const container = document.getElementById('remote-videos-container');
        if (container) {
          // First, check if there's already a video for this peer
          const existingVideo = container.querySelector(`#remote-video-${peerId}`);
          if (existingVideo) {
            container.removeChild(existingVideo);
          }
          
          // Create a wrapper for the video
          const wrapper = document.createElement('div');
          wrapper.className = 'remote-video-wrapper';
          wrapper.appendChild(videoElement);
          
          // Add a label with the peer ID
          const label = document.createElement('div');
          label.className = 'remote-video-label';
          label.textContent = `Participant ${peerId}`;
          wrapper.appendChild(label);
          
          container.appendChild(wrapper);
        }
        
        toast({
          title: 'Connected',
          description: `Connected to participant ${peerId}`,
          duration: 3000,
        });
      });
      
      peer.on('close', () => {
        log(`Connection to peer ${peerId} closed`);
        
        // Remove the video element
        const container = document.getElementById('remote-videos-container');
        const videoElement = document.getElementById(`remote-video-${peerId}`);
        if (container && videoElement) {
          container.removeChild(videoElement.parentElement || videoElement);
        }
        
        // Clean up references
        remoteVideos.current.delete(peerId);
        peers.current.delete(peerId);
      });
      
      peer.on('error', err => {
        log(`Error with peer ${peerId}: ${err.message}`);
        toast({
          title: 'Connection Error',
          description: `Error connecting to peer: ${err.message}`,
          variant: 'destructive'
        });
      });
      
      // Store the peer
      peers.current.set(peerId, peer);
      
    } catch (error) {
      log(`Error creating peer for ${peerId}: ${(error as Error).message}`);
      toast({
        title: 'Connection Error',
        description: `Failed to create peer connection: ${(error as Error).message}`,
        variant: 'destructive'
      });
    }
  };

  // Start local media stream
  const startLocalStream = async () => {
    try {
      log('Requesting media access...');
      
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser doesn't support media device access");
      }
      
      // Stop any existing stream
      if (localStream) {
        stopLocalStream();
      }
      
      // Try to get both audio and video
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        });
        log('Successfully got both audio and video');
        toast({
          title: 'Media Connected',
          description: 'Camera and microphone connected successfully.',
        });
      } catch (err) {
        // If that fails, try audio only
        log(`Error getting both: ${(err as Error).message}, trying audio only`);
        
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          log('Got audio only');
          toast({
            title: 'Audio Only',
            description: 'Microphone connected, but camera access failed.',
          });
        } catch (audioErr) {
          // If that also fails, try video only
          log(`Error getting audio: ${(audioErr as Error).message}, trying video only`);
          try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            log('Got video only');
            toast({
              title: 'Video Only',
              description: 'Camera connected, but microphone access failed.',
            });
          } catch (videoErr) {
            throw new Error('Could not access any media devices. Please check your permissions.');
          }
        }
      }
      
      // Update state
      setLocalStream(mediaStream);
      setAudioEnabled(mediaStream.getAudioTracks().length > 0);
      setVideoEnabled(mediaStream.getVideoTracks().length > 0);
      
      // Connect to video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
        
        try {
          await localVideoRef.current.play();
        } catch (playErr) {
          log(`Error playing video: ${(playErr as Error).message}`);
          toast({
            title: 'Playback Error',
            description: 'Could not automatically play video. Try clicking the play button.',
            variant: 'destructive'
          });
        }
      }
      
      // Add the stream to any existing peers
      peers.current.forEach(peer => {
        try {
          peer.addStream(mediaStream);
        } catch (error) {
          log(`Error adding stream to peer: ${(error as Error).message}`);
        }
      });
      
      return mediaStream;
    } catch (error) {
      log(`Error accessing media: ${(error as Error).message}`);
      toast({
        title: 'Media Access Error',
        description: (error as Error).message,
        variant: 'destructive'
      });
      return null;
    }
  };
  
  // Stop local stream
  const stopLocalStream = () => {
    if (localStream) {
      log('Stopping all tracks');
      
      // First, remove the stream from all peers
      peers.current.forEach(peer => {
        try {
          peer.removeStream(localStream);
        } catch (error) {
          log(`Error removing stream from peer: ${(error as Error).message}`);
        }
      });
      
      // Then stop all tracks
      localStream.getTracks().forEach(track => {
        track.stop();
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
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length === 0) return;
      
      const newEnabled = !audioEnabled;
      audioTracks.forEach(track => {
        track.enabled = newEnabled;
      });
      
      setAudioEnabled(newEnabled);
    }
  };
  
  // Toggle video
  const toggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length === 0) return;
      
      const newEnabled = !videoEnabled;
      videoTracks.forEach(track => {
        track.enabled = newEnabled;
      });
      
      setVideoEnabled(newEnabled);
    }
  };
  
  // Restart media
  const restartMedia = () => {
    startLocalStream();
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
                      onClick={restartMedia}
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
                    muted={true}
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
            
            {/* Controls */}
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
              
              <Button 
                variant="outline"
                size="sm"
                onClick={restartMedia}
                className="whitespace-nowrap"
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                {localStream ? "Restart Media" : "Start Media"}
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Remote videos */}
        <Card className="mt-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium">Remote Participants</h3>
              <span className="bg-primary/10 text-primary px-2 py-1 rounded-full text-xs font-medium">
                {remoteUsers.length}
              </span>
            </div>
            
            {remoteUsers.length === 0 ? (
              <div className="text-center p-6 border rounded-md bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                <div>
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-gray-500">No other participants yet</p>
                </div>
              </div>
            ) : (
              <div id="remote-videos-container" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Remote videos will be dynamically added here */}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Status panel */}
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
              <p>Connected peers: {peers.current.size}</p>
              <p>Initialized: {initialized ? "Yes" : "No"}</p>
            </div>
          </CardContent>
        </Card>
        
        {/* Participants list */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Participants
              </h3>
              <span className="bg-primary/10 text-primary px-2 py-1 rounded-full text-xs font-medium">
                {remoteUsers.length + 1}
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
              
              {/* Remote users */}
              {remoteUsers.map(user => (
                <li 
                  key={user.id} 
                  className="flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mr-3">
                    {user.id.toString()[0] || 'P'}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-gray-500">Participant</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      
      <style>{`
        .remote-video-wrapper {
          position: relative;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          border-radius: 0.375rem;
          background-color: #1e293b;
        }
        
        .remote-video-wrapper video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .remote-video-label {
          position: absolute;
          bottom: 0.5rem;
          left: 0.5rem;
          background-color: rgba(0, 0, 0, 0.6);
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
        }
      `}</style>
    </div>
  );
}