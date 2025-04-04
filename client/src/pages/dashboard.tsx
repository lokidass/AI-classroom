import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import CreateClassroomDialog from "@/components/classroom/create-classroom-dialog";
import JoinClassroomDialog from "@/components/classroom/join-classroom-dialog";
import ClassroomCard from "@/components/classroom/classroom-card";
import { Classroom } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { user } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);

  // Fetch classrooms
  const { data: classrooms, isLoading, error, refetch } = useQuery<Classroom[]>({
    queryKey: ["/api/classrooms"],
  });

  return (
    <div className="h-screen flex flex-col">
      <Header />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activePath="/" />
        
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">My Classrooms</h1>
                <p className="text-gray-500">Manage your classrooms and courses</p>
              </div>
              
              <div className="flex space-x-2">
                {user?.role === "teacher" && (
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Classroom
                  </Button>
                )}
                <Button variant="outline" onClick={() => setIsJoinDialogOpen(true)}>
                  Join Classroom
                </Button>
              </div>
            </div>
            
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="overflow-hidden">
                    <CardHeader className="pb-0">
                      <Skeleton className="h-6 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-24 w-full mt-4" />
                    </CardContent>
                    <CardFooter>
                      <Skeleton className="h-9 w-full" />
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : error ? (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-red-500">Error loading classrooms. Please try again.</p>
                  <Button variant="outline" className="mx-auto mt-4 block" onClick={() => refetch()}>
                    Retry
                  </Button>
                </CardContent>
              </Card>
            ) : classrooms && classrooms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {classrooms.map((classroom) => (
                  <ClassroomCard key={classroom.id} classroom={classroom} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center">
                  <h3 className="text-lg font-medium mb-2">No Classrooms Yet</h3>
                  <p className="text-gray-500 mb-4">
                    {user?.role === "teacher" 
                      ? "Create your first classroom to get started!"
                      : "Join a classroom to get started!"}
                  </p>
                  {user?.role === "teacher" ? (
                    <Button onClick={() => setIsCreateDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Classroom
                    </Button>
                  ) : (
                    <Button onClick={() => setIsJoinDialogOpen(true)}>
                      Join Classroom
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
      
      <CreateClassroomDialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen}
        onClassroomCreated={() => refetch()}
      />
      
      <JoinClassroomDialog 
        open={isJoinDialogOpen} 
        onOpenChange={setIsJoinDialogOpen}
        onClassroomJoined={() => refetch()}
      />
    </div>
  );
}
