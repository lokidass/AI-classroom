import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function BasicVideoTest() {
  const { toast } = useToast();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Simplified function to start media
  const startMedia = async () => {
    try {
      // First try to get both video and audio
      console.log("Attempting to get user media with video and audio...");
      let mediaStream;
      
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 640 },
            height: { ideal: 480 } 
          },
          audio: true
        });
        console.log("Successfully got both video and audio.");
      } catch (err) {
        console.warn("Could not get both video and audio:", err);
        
        // Try with just video
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true
          });
          console.log("Successfully got just video.");
        } catch (videoErr) {
          console.warn("Could not get video:", videoErr);
          
          // Try with just audio
          mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: true
          });
          console.log("Successfully got just audio.");
        }
      }
      
      // Log the tracks we got
      console.log(`Stream obtained with ${mediaStream.getVideoTracks().length} video tracks and ${mediaStream.getAudioTracks().length} audio tracks`);
      
      // Enable all tracks
      mediaStream.getTracks().forEach(track => {
        track.enabled = true;
        console.log(`Enabled ${track.kind} track: ${track.label}`);
      });
      
      // Update state
      setStream(mediaStream);
      setVideoEnabled(mediaStream.getVideoTracks().length > 0);
      setAudioEnabled(mediaStream.getAudioTracks().length > 0);
      
      // Attach to video element with a small delay to ensure DOM is ready
      setTimeout(() => {
        if (videoRef.current) {
          console.log("Setting video element source");
          videoRef.current.srcObject = mediaStream;
          
          // Try to start playback
          try {
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => console.log("Video playback started successfully"))
                .catch(err => {
                  console.error("Error playing video:", err);
                  toast({
                    title: "Video Playback Error",
                    description: `Could not start video playback: ${err.message}`,
                    variant: "destructive",
                  });
                });
            }
          } catch (playError) {
            console.error("Error calling play():", playError);
          }
        } else {
          console.error("Video ref is null, cannot attach stream");
        }
      }, 100);
      
    } catch (error) {
      console.error("Error accessing media devices:", error);
      toast({
        title: "Media Access Error",
        description: "Could not access camera or microphone. Please check your browser permissions.",
        variant: "destructive",
      });
    }
  };
  
  // Toggle audio
  const toggleAudio = () => {
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !audioEnabled;
        console.log(`Set audio track ${track.label} enabled: ${!audioEnabled}`);
      });
      setAudioEnabled(!audioEnabled);
    } else {
      toast({
        title: "No Active Stream",
        description: "Start the video/audio first before toggling audio.",
        variant: "destructive",
      });
    }
  };
  
  // Toggle video
  const toggleVideo = () => {
    if (stream) {
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !videoEnabled;
        console.log(`Set video track ${track.label} enabled: ${!videoEnabled}`);
      });
      setVideoEnabled(!videoEnabled);
    } else {
      toast({
        title: "No Active Stream",
        description: "Start the video/audio first before toggling video.",
        variant: "destructive",
      });
    }
  };
  
  // Stop all media
  const stopMedia = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log(`Stopped ${track.kind} track: ${track.label}`);
      });
      
      setStream(null);
      setVideoEnabled(false);
      setAudioEnabled(false);
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  };
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);
  
  return (
    <div className="flex flex-col items-center p-4 bg-white rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Basic Video Test</h2>
      
      <div className="video-container bg-black rounded-lg overflow-hidden mb-4 w-full max-w-lg aspect-video">
        {!stream ? (
          <div className="w-full h-full flex items-center justify-center text-white">
            <div className="text-center p-8">
              <VideoOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-lg font-medium">Video Not Started</p>
              <p className="text-sm opacity-70 mb-4">
                Click the button below to start your camera and microphone
              </p>
              <Button onClick={startMedia} className="mx-auto">
                Start Media
              </Button>
            </div>
          </div>
        ) : !videoEnabled ? (
          <div className="w-full h-full flex items-center justify-center text-white">
            <div className="text-center">
              <VideoOff className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-lg font-medium">Camera is off</p>
              <p className="text-sm opacity-70">Click the camera button below to turn it on</p>
              
              {/* Still show video element for audio-only scenario */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={!audioEnabled}
                className="hidden"
              />
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={!audioEnabled}
            className="w-full h-full bg-black object-contain"
          />
        )}
      </div>
      
      <div className="flex space-x-4 my-4">
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
          variant="destructive"
          size="icon"
          onClick={stopMedia}
          className="rounded-full w-10 h-10"
          disabled={!stream}
        >
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
      
      <div className="mt-4 text-sm text-gray-500">
        <p>Video Tracks: {stream?.getVideoTracks().length || 0}</p>
        <p>Audio Tracks: {stream?.getAudioTracks().length || 0}</p>
        {stream && (
          <div className="mt-2">
            <p className="font-medium">Active Tracks:</p>
            <ul className="list-disc pl-5">
              {stream.getTracks().map((track, index) => (
                <li key={index}>
                  {track.kind}: {track.label || 'Unnamed'} ({track.enabled ? 'enabled' : 'disabled'})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}