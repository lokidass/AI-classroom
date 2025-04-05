import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, 
  RefreshCcw, Check, AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function MediaTestPage() {
  const { toast } = useToast();
  
  // Media state
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>("");
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>("");
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch available devices
  const getDevices = async () => {
    try {
      addDebugInfo("Enumerating media devices...");
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      // Filter devices
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      const videoInputs = devices.filter(device => device.kind === 'videoinput');
      
      addDebugInfo(`Found ${audioInputs.length} audio devices and ${videoInputs.length} video devices`);
      
      // Set devices
      setAudioDevices(audioInputs);
      setVideoDevices(videoInputs);
      
      // Log details about devices
      audioInputs.forEach((device, index) => {
        addDebugInfo(`Audio device ${index + 1}: ${device.label || 'Unnamed device'}`);
      });
      
      videoInputs.forEach((device, index) => {
        addDebugInfo(`Video device ${index + 1}: ${device.label || 'Unnamed device'}`);
      });
      
      // Auto-select first devices if available
      if (audioInputs.length > 0 && !selectedAudioDevice) {
        setSelectedAudioDevice(audioInputs[0].deviceId);
      }
      
      if (videoInputs.length > 0 && !selectedVideoDevice) {
        setSelectedVideoDevice(videoInputs[0].deviceId);
      }
    } catch (error) {
      const err = error as Error;
      addError(`Failed to enumerate devices: ${err.message}`);
    }
  };

  // Initialize devices on component mount
  useEffect(() => {
    addDebugInfo("Component mounted");
    getDevices();
    
    // Setup DeviceChange listener
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    
    return () => {
      // Clean up
      stopMedia();
      navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    };
  }, []);

  // Helper to add debug info
  const addDebugInfo = (message: string) => {
    console.log(`[MediaTest] ${message}`);
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // Helper to add error messages
  const addError = (message: string) => {
    console.error(`[MediaTest] ${message}`);
    setErrorMessages(prev => [...prev, message]);
    toast({
      title: "Media Error",
      description: message,
      variant: "destructive"
    });
  };

  // Start media (video and/or audio)
  const startMedia = async () => {
    try {
      // Stop any existing stream
      stopMedia();
      
      addDebugInfo("Starting media capture...");
      setErrorMessages([]);
      
      // Prepare constraints
      const constraints: MediaStreamConstraints = {
        audio: selectedAudioDevice ? { deviceId: { exact: selectedAudioDevice } } : true,
        video: selectedVideoDevice ? { 
          deviceId: { exact: selectedVideoDevice },
          width: { ideal: 640 },
          height: { ideal: 480 }
        } : true
      };
      
      addDebugInfo(`Using constraints: ${JSON.stringify(constraints)}`);
      
      // Request media
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Log the tracks we got
      const videoTracks = mediaStream.getVideoTracks();
      const audioTracks = mediaStream.getAudioTracks();
      
      addDebugInfo(`Stream obtained with ${videoTracks.length} video tracks and ${audioTracks.length} audio tracks`);
      
      // Log details about tracks
      videoTracks.forEach(track => {
        addDebugInfo(`Video track: ${track.label}, enabled: ${track.enabled}`);
      });
      
      audioTracks.forEach(track => {
        addDebugInfo(`Audio track: ${track.label}, enabled: ${track.enabled}`);
      });
      
      // Update state
      setStream(mediaStream);
      setVideoEnabled(videoTracks.length > 0);
      setAudioEnabled(audioTracks.length > 0);
      
      // Attach to video element
      if (videoRef.current) {
        addDebugInfo("Attaching stream to video element");
        videoRef.current.srcObject = mediaStream;
        
        // Make sure these attributes are set
        videoRef.current.autoplay = true;
        videoRef.current.playsInline = true;
        videoRef.current.muted = false; // Unmuted for testing
        
        // Try to start playback
        try {
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => addDebugInfo("Video playback started successfully"))
              .catch(err => {
                addError(`Could not start video playback: ${err.message}`);
              });
          }
        } catch (playError) {
          const err = playError as Error;
          addError(`Error calling play(): ${err.message}`);
        }
      } else {
        addError("Video element reference is null");
      }
    } catch (error) {
      const err = error as Error;
      addError(`Failed to get media: ${err.message}`);
      
      // Clean up any partial stream
      stopMedia();
    }
  };

  // Stop all media
  const stopMedia = () => {
    if (stream) {
      addDebugInfo("Stopping all tracks and releasing stream");
      stream.getTracks().forEach(track => {
        track.stop();
        addDebugInfo(`Stopped ${track.kind} track: ${track.label}`);
      });
      
      // Clear video element
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      
      // Reset state
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
      addError("No active stream to toggle audio");
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
      addError("No active stream to toggle video");
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Media Access Test</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Video Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center">
                {!stream || !videoEnabled ? (
                  <div className="text-center text-white">
                    <VideoOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-lg font-medium">Camera is off</p>
                    <p className="text-sm opacity-70">Start media to preview camera</p>
                  </div>
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={false}
                    className="w-full h-full bg-black object-cover"
                  >
                    Your browser does not support video playback
                  </video>
                )}
              </div>
              
              <div className="flex space-x-4 mt-4">
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
                
                <Button
                  variant="default"
                  onClick={startMedia}
                  className="ml-auto"
                >
                  Start Media
                </Button>
                
                <Button
                  variant="destructive"
                  onClick={stopMedia}
                  disabled={!stream}
                >
                  Stop Media
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Device Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Audio Input Devices: {audioDevices.length}</h3>
                  {audioDevices.length === 0 ? (
                    <p className="text-amber-500 flex items-center">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      No audio devices detected
                    </p>
                  ) : (
                    <ul className="list-disc pl-5">
                      {audioDevices.map((device, index) => (
                        <li key={device.deviceId} className="mb-1">
                          {device.label || `Audio device ${index + 1}`}
                          {device.deviceId === selectedAudioDevice && (
                            <Check className="inline-block ml-2 h-4 w-4 text-green-500" />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                
                <div>
                  <h3 className="font-semibold mb-2">Video Input Devices: {videoDevices.length}</h3>
                  {videoDevices.length === 0 ? (
                    <p className="text-amber-500 flex items-center">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      No video devices detected
                    </p>
                  ) : (
                    <ul className="list-disc pl-5">
                      {videoDevices.map((device, index) => (
                        <li key={device.deviceId} className="mb-1">
                          {device.label || `Video device ${index + 1}`}
                          {device.deviceId === selectedVideoDevice && (
                            <Check className="inline-block ml-2 h-4 w-4 text-green-500" />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={getDevices}
                  className="flex items-center gap-2"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Refresh Devices
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Debug Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-y-auto bg-gray-100 dark:bg-gray-900 p-3 rounded-md text-sm font-mono">
                {debugInfo.length === 0 ? (
                  <p className="text-gray-500">No debug information available</p>
                ) : (
                  <ul className="space-y-1">
                    {debugInfo.map((info, index) => (
                      <li key={index}>{info}</li>
                    ))}
                  </ul>
                )}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDebugInfo([])}
                className="mt-2"
              >
                Clear Log
              </Button>
            </CardContent>
          </Card>
          
          {errorMessages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-500">Error Messages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 rounded-md text-sm">
                  <ul className="space-y-2">
                    {errorMessages.map((error, index) => (
                      <li key={index} className="text-red-600 dark:text-red-400">{error}</li>
                    ))}
                  </ul>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setErrorMessages([])}
                  className="mt-2"
                >
                  Clear Errors
                </Button>
              </CardContent>
            </Card>
          )}
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Browser Compatibility Info</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <span className="font-semibold mr-2">getUserMedia:</span>
                  <span>
                    {navigator.mediaDevices !== undefined
                      ? <span className="text-green-500">Supported</span> 
                      : <span className="text-red-500">Not supported</span>}
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="font-semibold mr-2">enumerateDevices:</span>
                  <span>
                    {navigator.mediaDevices !== undefined
                      ? <span className="text-green-500">Supported</span> 
                      : <span className="text-red-500">Not supported</span>}
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="font-semibold mr-2">WebRTC API:</span>
                  <span>
                    {typeof window.RTCPeerConnection !== 'undefined'
                      ? <span className="text-green-500">Supported</span> 
                      : <span className="text-red-500">Not supported</span>}
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="font-semibold mr-2">Browser:</span>
                  <span>{navigator.userAgent}</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}