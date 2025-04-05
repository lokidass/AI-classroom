import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { BrowserPeer } from "@/lib/browser-peer";
import {
  RefreshCcw,
  Play,
  Video as VideoIcon,
  Mic,
  MicOff,
  VideoOff,
  CopyIcon,
  Clipboard,
  Check
} from "lucide-react";

interface SignalData {
  type: string;
  sdp?: string;
  candidate?: any;
}

export default function WebRTCTestPage() {
  // Media state
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>("");
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>("");
  
  // WebRTC state
  const [peer, setPeer] = useState<BrowserPeer | null>(null);
  const [offerSignal, setOfferSignal] = useState<string>("");
  const [answerSignal, setAnswerSignal] = useState<string>("");
  const [offerCopied, setOfferCopied] = useState(false);
  const [answerCopied, setAnswerCopied] = useState(false);
  const [connected, setConnected] = useState(false);
  
  // UI state
  const [role, setRole] = useState<"none" | "offer" | "answer">("none");
  const [logs, setLogs] = useState<string[]>([]);
  
  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  // Add a log entry
  const addLog = (message: string) => {
    console.log(`[WebRTC Test] ${message}`);
    setLogs(prevLogs => [...prevLogs, `${new Date().toLocaleTimeString()}: ${message}`]);
  };
  
  // Enumerate devices
  const getDevices = async () => {
    try {
      addLog("Enumerating media devices...");
      
      // Request a temporary stream to get device labels (if needed)
      if (!localStream) {
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          tempStream.getTracks().forEach(track => track.stop());
          addLog("Temporary stream obtained for device labels");
        } catch (err) {
          addLog(`Could not get temporary stream: ${(err as Error).message}`);
        }
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      const videoInputs = devices.filter(device => device.kind === 'videoinput');
      
      addLog(`Found ${audioInputs.length} audio inputs and ${videoInputs.length} video inputs`);
      
      setAudioDevices(audioInputs);
      setVideoDevices(videoInputs);
      
      // Select first devices by default
      if (audioInputs.length > 0 && !selectedAudioDevice) {
        setSelectedAudioDevice(audioInputs[0].deviceId);
      }
      
      if (videoInputs.length > 0 && !selectedVideoDevice) {
        setSelectedVideoDevice(videoInputs[0].deviceId);
      }
    } catch (error) {
      addLog(`Error enumerating devices: ${(error as Error).message}`);
    }
  };
  
  // Initialize component
  useEffect(() => {
    addLog("WebRTC Test Page loaded");
    getDevices();
    
    // Add devicechange listener
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    
    return () => {
      // Clean up
      stopLocalStream();
      cleanupPeerConnection();
      navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    };
  }, []);
  
  // Start local stream
  const startLocalStream = async () => {
    try {
      // Stop any existing stream
      if (localStream) {
        stopLocalStream();
      }
      
      addLog("Starting local stream...");
      
      // Build constraints
      const constraints: MediaStreamConstraints = {};
      
      if (selectedAudioDevice) {
        constraints.audio = {
          deviceId: { exact: selectedAudioDevice }
        };
      } else {
        constraints.audio = true;
      }
      
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
      
      addLog(`Requesting media with constraints: ${JSON.stringify(constraints)}`);
      
      // Get media stream
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Set stream states
      setLocalStream(stream);
      setAudioEnabled(true);
      setVideoEnabled(true);
      
      // Attach to video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        
        // Start playback
        try {
          await localVideoRef.current.play();
          addLog("Local video playback started");
        } catch (err) {
          addLog(`Error starting local video: ${(err as Error).message}`);
        }
      }
      
      addLog(`Local stream started with ${stream.getVideoTracks().length} video and ${stream.getAudioTracks().length} audio tracks`);
      
    } catch (error) {
      addLog(`Error starting local stream: ${(error as Error).message}`);
    }
  };
  
  // Stop local stream
  const stopLocalStream = () => {
    if (localStream) {
      addLog("Stopping local stream");
      
      localStream.getTracks().forEach(track => {
        track.stop();
      });
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      
      setLocalStream(null);
      setAudioEnabled(false);
      setVideoEnabled(false);
    }
  };
  
  // Toggle audio
  const toggleAudio = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      const newState = !audioEnabled;
      
      audioTracks.forEach(track => {
        track.enabled = newState;
      });
      
      setAudioEnabled(newState);
      addLog(`Audio ${newState ? 'enabled' : 'disabled'}`);
    }
  };
  
  // Toggle video
  const toggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      const newState = !videoEnabled;
      
      videoTracks.forEach(track => {
        track.enabled = newState;
      });
      
      setVideoEnabled(newState);
      addLog(`Video ${newState ? 'enabled' : 'disabled'}`);
    }
  };
  
  // Create offer
  const createOffer = () => {
    if (!localStream) {
      addLog("Error: Local stream not available. Start your camera first.");
      return;
    }
    
    // Clean up any existing peer connection
    cleanupPeerConnection();
    
    try {
      addLog("Creating offer as initiator");
      setRole("offer");
      
      // Create peer connection as initiator
      const newPeer = new BrowserPeer({
        initiator: true,
        stream: localStream,
        trickle: false
      });
      
      // Handle the generated offer signal
      newPeer.on('signal', (data: SignalData) => {
        addLog(`Offer generated: type=${data.type}`);
        setOfferSignal(JSON.stringify(data));
      });
      
      // Handle incoming stream
      newPeer.on('stream', (stream: MediaStream) => {
        addLog("Received remote stream");
        setRemoteStream(stream);
        
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          
          // Start playback
          try {
            remoteVideoRef.current.play()
              .then(() => addLog("Remote video playback started"))
              .catch(err => addLog(`Error starting remote video: ${err.message}`));
          } catch (err) {
            addLog(`Error with remote video: ${(err as Error).message}`);
          }
        }
      });
      
      // Handle connection state
      newPeer.on('connect', () => {
        addLog("Peer connection established!");
        setConnected(true);
      });
      
      // Handle errors
      newPeer.on('error', (err: Error) => {
        addLog(`Peer error: ${err.message}`);
        cleanupPeerConnection();
      });
      
      // Set the peer
      setPeer(newPeer);
      
    } catch (error) {
      addLog(`Error creating offer: ${(error as Error).message}`);
    }
  };
  
  // Create answer
  const createAnswer = () => {
    if (!localStream) {
      addLog("Error: Local stream not available. Start your camera first.");
      return;
    }
    
    if (!offerSignal || offerSignal.trim() === '') {
      addLog("Error: No offer signal provided");
      return;
    }
    
    // Clean up any existing peer connection
    cleanupPeerConnection();
    
    try {
      addLog("Creating answer as non-initiator");
      setRole("answer");
      
      // Create peer connection as non-initiator
      const newPeer = new BrowserPeer({
        initiator: false,
        stream: localStream,
        trickle: false
      });
      
      // Handle generated answer signal
      newPeer.on('signal', (data: SignalData) => {
        addLog(`Answer generated: type=${data.type}`);
        setAnswerSignal(JSON.stringify(data));
      });
      
      // Handle incoming stream
      newPeer.on('stream', (stream: MediaStream) => {
        addLog("Received remote stream");
        setRemoteStream(stream);
        
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          
          // Start playback
          try {
            remoteVideoRef.current.play()
              .then(() => addLog("Remote video playback started"))
              .catch(err => addLog(`Error starting remote video: ${err.message}`));
          } catch (err) {
            addLog(`Error with remote video: ${(err as Error).message}`);
          }
        }
      });
      
      // Handle connection state
      newPeer.on('connect', () => {
        addLog("Peer connection established!");
        setConnected(true);
      });
      
      // Handle errors
      newPeer.on('error', (err: Error) => {
        addLog(`Peer error: ${err.message}`);
        cleanupPeerConnection();
      });
      
      // Set the peer and process the offer
      setPeer(newPeer);
      
      // Process the offer signal
      try {
        const offerData = JSON.parse(offerSignal);
        newPeer.signal(offerData);
      } catch (err) {
        addLog(`Error parsing offer: ${(err as Error).message}`);
      }
      
    } catch (error) {
      addLog(`Error creating answer: ${(error as Error).message}`);
    }
  };
  
  // Process answer when received
  const processAnswer = () => {
    if (!peer) {
      addLog("Error: No peer connection available");
      return;
    }
    
    if (!answerSignal || answerSignal.trim() === '') {
      addLog("Error: No answer signal provided");
      return;
    }
    
    try {
      const answerData = JSON.parse(answerSignal);
      addLog(`Processing answer signal: type=${answerData.type}`);
      peer.signal(answerData);
    } catch (error) {
      addLog(`Error processing answer: ${(error as Error).message}`);
    }
  };
  
  // Clean up peer connection
  const cleanupPeerConnection = () => {
    if (peer) {
      addLog("Cleaning up peer connection");
      peer.destroy();
      setPeer(null);
      setConnected(false);
      
      // Clear signal data
      if (role === "offer") {
        setAnswerSignal("");
      } else if (role === "answer") {
        setOfferSignal("");
      }
      
      // Clear remote stream
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      setRemoteStream(null);
    }
  };
  
  // Copy text to clipboard
  const copyToClipboard = (text: string, type: 'offer' | 'answer') => {
    navigator.clipboard.writeText(text).then(() => {
      if (type === 'offer') {
        setOfferCopied(true);
        setTimeout(() => setOfferCopied(false), 2000);
      } else {
        setAnswerCopied(true);
        setTimeout(() => setAnswerCopied(false), 2000);
      }
      addLog(`${type} signal copied to clipboard`);
    });
  };
  
  // Reset the test
  const resetTest = () => {
    cleanupPeerConnection();
    setRole("none");
    setOfferSignal("");
    setAnswerSignal("");
    setOfferCopied(false);
    setAnswerCopied(false);
    addLog("Test reset");
  };
  
  return (
    <div className="container py-8 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">WebRTC Connection Test</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Local video column */}
        <Card>
          <CardHeader>
            <CardTitle>Local Video</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="aspect-video bg-gray-900 rounded-lg relative overflow-hidden mb-4">
              {!localStream ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <VideoOff className="h-12 w-12 mx-auto mb-2" />
                    <p>No local stream</p>
                  </div>
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
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="videoDevice">Video Source</Label>
                  <select
                    id="videoDevice"
                    className="w-full px-3 py-2 border rounded-md"
                    value={selectedVideoDevice}
                    onChange={(e) => setSelectedVideoDevice(e.target.value)}
                  >
                    {videoDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Video device ${device.deviceId.substring(0, 5)}...`}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="audioDevice">Audio Source</Label>
                  <select
                    id="audioDevice"
                    className="w-full px-3 py-2 border rounded-md"
                    value={selectedAudioDevice}
                    onChange={(e) => setSelectedAudioDevice(e.target.value)}
                  >
                    {audioDevices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Audio device ${device.deviceId.substring(0, 5)}...`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex gap-2 flex-wrap">
                <Button onClick={startLocalStream} className="flex-1">
                  <Play className="h-4 w-4 mr-2" />
                  Start Camera
                </Button>
                
                <Button onClick={getDevices} variant="outline" className="px-3">
                  <RefreshCcw className="h-4 w-4" />
                </Button>
                
                <Button
                  onClick={toggleVideo}
                  variant="outline"
                  disabled={!localStream}
                  className="px-3"
                >
                  {videoEnabled ? (
                    <VideoIcon className="h-4 w-4" />
                  ) : (
                    <VideoOff className="h-4 w-4" />
                  )}
                </Button>
                
                <Button
                  onClick={toggleAudio}
                  variant="outline"
                  disabled={!localStream}
                  className="px-3"
                >
                  {audioEnabled ? (
                    <Mic className="h-4 w-4" />
                  ) : (
                    <MicOff className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Remote video column */}
        <Card>
          <CardHeader>
            <CardTitle>Remote Video</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="aspect-video bg-gray-900 rounded-lg relative overflow-hidden mb-4">
              {!remoteStream ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <VideoOff className="h-12 w-12 mx-auto mb-2" />
                    <p>No remote stream</p>
                  </div>
                </div>
              ) : (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              )}
              
              {connected && (
                <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-md text-xs">
                  Connected
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={createOffer}
                  variant={role === "offer" ? "default" : "outline"}
                  className="flex-1"
                  disabled={!localStream}
                >
                  Create Offer
                </Button>
                
                <Button
                  onClick={createAnswer}
                  variant={role === "answer" ? "default" : "outline"}
                  className="flex-1"
                  disabled={!localStream || !offerSignal}
                >
                  Create Answer
                </Button>
              </div>
              
              <div className="flex gap-2">
                <Button onClick={processAnswer} disabled={role !== "offer" || !answerSignal || !peer}>
                  Connect
                </Button>
                
                <Button onClick={resetTest} variant="destructive">
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Signaling data exchange */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Offer Signal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Textarea
                value={offerSignal}
                onChange={(e) => setOfferSignal(e.target.value)}
                placeholder="Paste offer signal here if you're answering"
                rows={4}
                className="font-mono text-xs"
              />
              {offerSignal && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2"
                  onClick={() => copyToClipboard(offerSignal, 'offer')}
                >
                  {offerCopied ? <Check className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Answer Signal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Textarea
                value={answerSignal}
                onChange={(e) => setAnswerSignal(e.target.value)}
                placeholder="Paste answer signal here if you're offering"
                rows={4}
                className="font-mono text-xs"
              />
              {answerSignal && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2"
                  onClick={() => copyToClipboard(answerSignal, 'answer')}
                >
                  {answerCopied ? <Check className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Log section */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-100 dark:bg-gray-900 rounded-md p-2 h-32 overflow-y-auto text-xs font-mono">
            {logs.map((log, index) => (
              <div key={index} className="pb-1">
                {log}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      <div className="mt-6 text-sm text-gray-500">
        <p>
          <strong>How to test:</strong> Open this page in two different browsers or devices.
          On the first device, click "Create Offer" and copy the offer signal.
          On the second device, paste the offer signal, click "Create Answer" and copy the answer signal.
          Go back to the first device, paste the answer signal, and click "Connect".
        </p>
      </div>
    </div>
  );
}