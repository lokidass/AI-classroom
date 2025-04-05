import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import EnhancedVideoInterface from "@/components/lecture/enhanced-video-interface";
import BasicVideoTest from "@/components/lecture/basic-video-test";

export default function VideoTestPage() {
  const { toast } = useToast();
  const [lectureId, setLectureId] = useState<number>(1); // Default test lecture ID
  const [isTeacher, setIsTeacher] = useState<boolean>(true);
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Video & WebRTC Test Page</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Test Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium mb-1">Test Lecture ID</label>
              <Input 
                type="number" 
                value={lectureId} 
                onChange={(e) => setLectureId(parseInt(e.target.value) || 1)}
                min={1}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <Button
                variant={isTeacher ? "default" : "outline"}
                className="mr-2"
                onClick={() => setIsTeacher(true)}
              >
                Teacher
              </Button>
              <Button
                variant={!isTeacher ? "default" : "outline"}
                onClick={() => setIsTeacher(false)}
              >
                Student
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Tabs defaultValue="enhanced" className="w-full">
        <TabsList className="grid grid-cols-2 w-[400px] mb-4">
          <TabsTrigger value="enhanced">Enhanced Video Interface</TabsTrigger>
          <TabsTrigger value="basic">Basic Media Test</TabsTrigger>
        </TabsList>
        
        <TabsContent value="enhanced" className="p-4 border rounded-lg">
          <p className="text-sm text-gray-500 mb-4">
            This test uses the enhanced video interface with WebRTC peer connections.
            Open this page in multiple browsers or devices to test the peer connections.
          </p>
          <EnhancedVideoInterface lectureId={lectureId} isTeacher={isTeacher} />
        </TabsContent>
        
        <TabsContent value="basic" className="p-4 border rounded-lg">
          <p className="text-sm text-gray-500 mb-4">
            This test focuses only on local media access without WebRTC connections.
            Use this to test basic camera and microphone access.
          </p>
          <BasicVideoTest />
        </TabsContent>
      </Tabs>
    </div>
  );
}