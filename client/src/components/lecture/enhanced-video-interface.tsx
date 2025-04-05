import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Video, VideoOff, RefreshCcw, Users } from "lucide-react";
import { webSocketClient } from "@/lib/websocket";

interface EnhancedVideoInterfaceProps {
  lectureId: number;
  isTeacher?: boolean;
}

export default function EnhancedVideoInterface({ lectureId, isTeacher = false }: EnhancedVideoInterfaceProps) {
  const { toast } = useToast();
  
  // State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [participants, setParticipants] = useState<{id: number, name: string}[]>([]);
  
  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  
  // Add a log message
  const addLog = (message: string) => {
    console.log(`[EnhancedVideoInterface] ${message}`);
  };
  
  // Initialize media
  useEffect(() => {
    // Display a simple participant entry
    setParticipants([
      { id: -1, name: isTeacher ? "You (Teacher)" : "You (Student)" }
    ]);
    
    // Start local media stream with a slight delay to ensure the component is fully mounted
    const timer = setTimeout(() => {
      startLocalStream();
    }, 500);
    
    return () => {
      // Cleanup
      clearTimeout(timer);
      if (localStream) {
        stopLocalStream();
      }
    };
  }, [lectureId]);
  
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
      </div>
      
      {/* Participants and Status */}
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
                {participants.length}
              </span>
            </div>
            
            {participants.length === 0 ? (
              <p className="text-sm text-gray-500">No participants yet</p>
            ) : (
              <ul className="space-y-2">
                {participants.map((participant) => (
                  <li 
                    key={participant.id} 
                    className="flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mr-3">
                      {participant.name[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{participant.name}</p>
                      <p className="text-xs text-gray-500">
                        {participant.id === -1 ? (isTeacher ? "Teacher (You)" : "Student (You)") : "Participant"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}