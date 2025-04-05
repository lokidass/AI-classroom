import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Video, VideoOff, RefreshCcw } from "lucide-react";

export default function SimpleVideoTest() {
  const { toast } = useToast();
  
  // State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Add a log message
  const addLog = (message: string) => {
    console.log(`[SimpleVideoTest] ${message}`);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };
  
  // Get available devices
  const getDevices = async () => {
    try {
      addLog("Enumerating devices...");
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      setDevices(deviceList);
      
      const audioInputs = deviceList.filter(d => d.kind === 'audioinput');
      const videoInputs = deviceList.filter(d => d.kind === 'videoinput');
      
      addLog(`Found ${audioInputs.length} audio inputs and ${videoInputs.length} video inputs`);
      
      // Log device details
      deviceList.forEach((device, index) => {
        addLog(`Device ${index+1}: ${device.kind}, ${device.label || 'No label'}`);
      });
    } catch (error) {
      addLog(`Error getting devices: ${(error as Error).message}`);
    }
  };
  
  // Initialize
  useEffect(() => {
    addLog("Component mounted");
    getDevices();
    
    // Add device change listener
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    
    return () => {
      // Cleanup
      if (stream) {
        stopStream();
      }
      navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    };
  }, []);
  
  // Start video/audio
  const startStream = async () => {
    try {
      addLog("Requesting media access...");
      
      // Stop any existing stream
      if (stream) {
        stopStream();
      }
      
      // Setup constraints - start with just audio to make it easier
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
      } catch (err) {
        // If that fails, try just audio
        addLog(`Error getting both: ${(err as Error).message}, trying audio only`);
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          addLog("Successfully got just audio");
        } catch (audioErr) {
          // If that fails, try just video
          addLog(`Error getting audio: ${(audioErr as Error).message}, trying video only`);
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
          addLog("Successfully got just video");
        }
      }
      
      // Update state
      setStream(mediaStream);
      setAudioEnabled(mediaStream.getAudioTracks().length > 0);
      setVideoEnabled(mediaStream.getVideoTracks().length > 0);
      
      // Log track info
      mediaStream.getTracks().forEach(track => {
        addLog(`Track: ${track.kind}, ${track.label}, enabled: ${track.enabled}`);
      });
      
      // Connect to video element
      if (videoRef.current) {
        addLog("Attaching stream to video element");
        videoRef.current.srcObject = mediaStream;
        
        try {
          await videoRef.current.play();
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
      
      // Refresh device list to get labels
      getDevices();
      
    } catch (error) {
      addLog(`Error accessing media: ${(error as Error).message}`);
      toast({
        title: "Media Access Error",
        description: "Could not access your camera or microphone. Please check your browser permissions.",
        variant: "destructive"
      });
    }
  };
  
  // Stop stream
  const stopStream = () => {
    if (stream) {
      addLog("Stopping all tracks");
      stream.getTracks().forEach(track => {
        track.stop();
        addLog(`Stopped ${track.kind} track`);
      });
      
      // Clean up video element
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      // Update state
      setStream(null);
      setAudioEnabled(false);
      setVideoEnabled(false);
    }
  };
  
  // Toggle audio
  const toggleAudio = () => {
    if (stream) {
      const tracks = stream.getAudioTracks();
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
    if (stream) {
      const tracks = stream.getVideoTracks();
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
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Simple Video Test</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Video Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative aspect-video bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center mb-4">
              {!stream || !videoEnabled ? (
                <div className="text-center text-white p-4">
                  <VideoOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-lg font-medium">Camera is off</p>
                  <p className="text-sm text-gray-400">Start video to preview your camera</p>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted={!audioEnabled}
                  controls={false}
                />
              )}
            </div>
            
            <div className="flex justify-between items-center">
              <div className="space-x-2">
                <Button 
                  variant={audioEnabled ? "default" : "outline"}
                  size="icon"
                  onClick={toggleAudio}
                  disabled={!stream || stream.getAudioTracks().length === 0}
                >
                  {audioEnabled ? <Mic /> : <MicOff />}
                </Button>
                
                <Button 
                  variant={videoEnabled ? "default" : "outline"}
                  size="icon"
                  onClick={toggleVideo}
                  disabled={!stream || stream.getVideoTracks().length === 0}
                >
                  {videoEnabled ? <Video /> : <VideoOff />}
                </Button>
              </div>
              
              <div className="space-x-2">
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={getDevices}
                >
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  Refresh Devices
                </Button>
                
                {!stream ? (
                  <Button onClick={startStream}>Start Media</Button>
                ) : (
                  <Button variant="destructive" onClick={stopStream}>Stop Media</Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Debug Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <h3 className="text-sm font-medium mb-2">Detected Devices ({devices.length})</h3>
              <ul className="text-sm space-y-1 mb-4">
                {devices.length === 0 ? (
                  <li className="text-gray-500">No devices detected</li>
                ) : (
                  devices.map((device, i) => (
                    <li key={i} className="text-gray-600 dark:text-gray-400">
                      {device.kind}: {device.label || `Device ${i+1}`}
                    </li>
                  ))
                )}
              </ul>
            </div>
            
            <div>
              <h3 className="text-sm font-medium mb-2">Log</h3>
              <div className="bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs font-mono h-48 overflow-y-auto">
                {logs.map((log, i) => (
                  <div key={i} className="whitespace-pre-wrap mb-1">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}