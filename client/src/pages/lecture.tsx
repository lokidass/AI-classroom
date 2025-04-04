import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Lecture, Classroom } from "@shared/schema";
import { webSocketClient } from "@/lib/websocket";
import Header from "@/components/layout/header";
import VideoInterface from "@/components/lecture/video-interface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LiveNotes from "@/components/lecture/live-notes";
import AIAssistant from "@/components/lecture/ai-assistant";
import Chat from "@/components/lecture/chat";
import ParticipantsList from "@/components/lecture/participants-list";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

export default function LecturePage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("notes");
  const wsInitialized = useRef(false);
  const isTeacher = user?.role === "teacher";
  
  const lectureId = parseInt(id);
  
  // Fetch lecture data
  const { 
    data: lecture, 
    isLoading: isLoadingLecture,
    error: lectureError 
  } = useQuery<Lecture>({
    queryKey: [`/api/lectures/${lectureId}`],
    refetchInterval: 30000, // Refetch every 30 seconds to check if lecture is still active
  });
  
  // Fetch classroom data once we have the lecture
  const { data: classroom } = useQuery<Classroom>({
    queryKey: [`/api/classrooms/${lecture?.classroomId}`],
    enabled: !!lecture?.classroomId,
  });
  
  // End lecture mutation (for teachers)
  const endLectureMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/lectures/${lectureId}/end`, {});
    },
    onSuccess: () => {
      toast({
        title: "Lecture ended",
        description: "The lecture has been ended successfully.",
      });
      // Navigate back to classroom page
      if (lecture?.classroomId) {
        navigate(`/classroom/${lecture.classroomId}`);
      } else {
        navigate("/");
      }
    },
    onError: (error) => {
      toast({
        title: "Failed to end lecture",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Handle WebSocket connection
  useEffect(() => {
    if (!user || !lectureId || wsInitialized.current) return;
    
    wsInitialized.current = true;
    webSocketClient.connect();
    
    // Set up event listeners
    webSocketClient.on("connection", () => {
      if (user) {
        webSocketClient.authenticate(user.id);
      }
    });
    
    webSocketClient.on("auth_response", (data) => {
      if (data.success) {
        webSocketClient.joinLecture(lectureId);
      }
    });
    
    return () => {
      if (webSocketClient.lectureId === lectureId) {
        webSocketClient.leaveLecture();
      }
    };
  }, [user, lectureId]);
  
  // Check if lecture has ended
  useEffect(() => {
    if (lecture && !lecture.isActive) {
      toast({
        title: "Lecture ended",
        description: "This lecture has ended.",
      });
      if (lecture.classroomId) {
        navigate(`/classroom/${lecture.classroomId}`);
      } else {
        navigate("/");
      }
    }
  }, [lecture, navigate, toast]);
  
  // End lecture handler (for teachers)
  const handleEndLecture = () => {
    if (confirm("Are you sure you want to end this lecture?")) {
      endLectureMutation.mutate();
    }
  };
  
  // Loading state
  if (isLoadingLecture) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }
  
  // Error state
  if (lectureError || !lecture) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  Failed to load lecture. The lecture may not exist or you don't have access to it.
                </AlertDescription>
              </Alert>
              <Button 
                className="w-full mt-4" 
                variant="secondary"
                onClick={() => navigate("/")}
              >
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Header />
      
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          {/* Lecture Container */}
          <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-2">
              <div>
                <h2 className="text-xl font-medium text-gray-800">{lecture.title}</h2>
                <p className="text-sm text-gray-500">
                  {classroom?.name || "Loading..."} • Started {new Date(lecture.startTime).toLocaleTimeString()}
                </p>
              </div>
              <div className="flex space-x-2">
                {isTeacher && (
                  <Button 
                    onClick={handleEndLecture}
                    variant="destructive"
                    disabled={endLectureMutation.isPending}
                  >
                    {endLectureMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <span className="material-icons text-sm mr-1">call_end</span>
                    )}
                    End Lecture
                  </Button>
                )}
              </div>
            </div>
            
            {/* Video Interface */}
            <VideoInterface 
              lectureId={lectureId} 
              isTeacher={isTeacher}
            />
          </div>
          
          {/* Tab Interface */}
          <div className="bg-white rounded-lg shadow-sm mb-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="border-b border-gray-200">
                <TabsList className="w-full h-auto bg-transparent border-b-0 p-0">
                  <TabsTrigger 
                    value="notes" 
                    className="flex-1 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-4 px-6"
                  >
                    <span className="material-icons mr-2 text-lg">auto_stories</span>
                    <span>Live Notes</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="ai" 
                    className="flex-1 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-4 px-6"
                  >
                    <span className="material-icons mr-2 text-lg">smart_toy</span>
                    <span>AI Assistant</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="chat" 
                    className="flex-1 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-4 px-6"
                  >
                    <span className="material-icons mr-2 text-lg">question_answer</span>
                    <span>Class Chat</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="participants" 
                    className="flex-1 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-4 px-6"
                  >
                    <span className="material-icons mr-2 text-lg">groups</span>
                    <span>Participants</span>
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="notes">
                <LiveNotes lectureId={lectureId} />
              </TabsContent>
              
              <TabsContent value="ai">
                <AIAssistant lectureId={lectureId} />
              </TabsContent>
              
              <TabsContent value="chat">
                <Chat lectureId={lectureId} userId={user?.id || 0} />
              </TabsContent>
              
              <TabsContent value="participants">
                <ParticipantsList lectureId={lectureId} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
