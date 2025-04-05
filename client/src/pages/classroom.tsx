import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { useParams, useLocation } from "wouter";
import { Classroom, Assignment, Material, Lecture, Quiz, QuizQuestion } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Calendar, FileText, Video, Plus, Upload, BookOpen, ClipboardCheck, BookText as QuizIcon, Brain, Users, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { Tabs as TabsComponent, TabsList as TabsListComponent, TabsTrigger as TabsTriggerComponent } from "@/components/ui/tabs";
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, 
  DialogHeader, DialogTitle, DialogTrigger 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

export default function ClassroomPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("stream");
  const [isAddAssignmentOpen, setIsAddAssignmentOpen] = useState(false);
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [isCreateQuizOpen, setIsCreateQuizOpen] = useState(false);
  const [isViewSubmissionsOpen, setIsViewSubmissionsOpen] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState<number | null>(null);
  
  const classroomId = id ? parseInt(id) : 0;
  
  // Fetch classroom data
  const { 
    data: classroom, 
    isLoading: isLoadingClassroom,
    error: classroomError 
  } = useQuery<Classroom>({
    queryKey: [`/api/classrooms/${classroomId}`],
  });
  
  // Fetch assignments
  const { 
    data: assignments, 
    isLoading: isLoadingAssignments 
  } = useQuery<Assignment[]>({
    queryKey: [`/api/classrooms/${classroomId}/assignments`],
    enabled: !!classroomId,
  });
  
  // Fetch materials
  const { 
    data: materials, 
    isLoading: isLoadingMaterials 
  } = useQuery<Material[]>({
    queryKey: [`/api/classrooms/${classroomId}/materials`],
    enabled: !!classroomId,
  });
  
  // Fetch active lecture if any
  const {
    data: activeLecture,
    isLoading: isLoadingActiveLecture,
    refetch: refetchActiveLecture
  } = useQuery<Lecture>({
    queryKey: [`/api/classrooms/${classroomId}/lectures/active`],
    enabled: !!classroomId,
    retry: false,
  });
  
  // Define the type for classroom members
  interface ClassroomMember {
    userId: number;
    user: {
      id: number;
      username: string;
      fullName: string | null;
      role: string;
    };
  }
  
  // Fetch classroom members
  const {
    data: classroomMembers,
    isLoading: isLoadingMembers
  } = useQuery<ClassroomMember[]>({
    queryKey: [`/api/classrooms/${classroomId}/members`],
    enabled: !!classroomId,
  });
  
  // Fetch quizzes
  const {
    data: quizzes,
    isLoading: isLoadingQuizzes
  } = useQuery<Quiz[]>({
    queryKey: [`/api/classrooms/${classroomId}/quizzes`],
    enabled: !!classroomId,
  });
  
  // Create lecture mutation
  const createLectureMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string }) => {
      return await apiRequest("POST", `/api/classrooms/${classroomId}/lectures`, data);
    },
    onSuccess: async () => {
      toast({
        title: "Lecture started",
        description: "Your lecture has started successfully.",
      });
      const lecture = await refetchActiveLecture();
      if (lecture.data) {
        navigate(`/lecture/${lecture.data.id}`);
      }
    },
    onError: (error) => {
      toast({
        title: "Failed to start lecture",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Start lecture handler
  const handleStartLecture = () => {
    if (activeLecture) {
      navigate(`/lecture/${activeLecture.id}`);
    } else {
      createLectureMutation.mutate({
        title: `${classroom?.name} Lecture`,
        description: `Live lecture for ${classroom?.name}`
      });
    }
  };
  
  // Assignment schema
  const assignmentSchema = z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    dueDate: z.string().optional(),
  });
  
  const assignmentForm = useForm<z.infer<typeof assignmentSchema>>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      title: "",
      description: "",
      dueDate: "",
    },
  });
  
  // Material schema
  const materialSchema = z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    url: z.string().url("Please enter a valid URL").optional(),
    type: z.string().default("document"),
  });
  
  const materialForm = useForm<z.infer<typeof materialSchema>>({
    resolver: zodResolver(materialSchema),
    defaultValues: {
      title: "",
      description: "",
      url: "",
      type: "document",
    },
  });
  
  // Quiz schema
  const quizSchema = z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    timeLimit: z.string().optional(),
  });
  
  const quizForm = useForm<z.infer<typeof quizSchema>>({
    resolver: zodResolver(quizSchema),
    defaultValues: {
      title: "",
      description: "",
      timeLimit: "",
    },
  });
  
  // Quiz generation schema
  const quizGenerationSchema = z.object({
    title: z.string().min(1, "Title is required"),
    content: z.string().min(10, "Content must be at least 10 characters long"),
    numQuestions: z.preprocess(
      (val) => Number(val),
      z.number().min(1, "Number of questions must be at least 1").max(20, "Number of questions must be at most 20")
    ),
  });
  
  // Function to activate a quiz
  const activateQuizMutation = useMutation({
    mutationFn: async (quizId: number) => {
      return await apiRequest(
        "PATCH", 
        `/api/quizzes/${quizId}/activate`, 
        { isActive: true }
      );
    },
    onSuccess: () => {
      toast({
        title: "Quiz activated",
        description: "The quiz is now active and available to students.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/classrooms/${classroomId}/quizzes`] });
    },
    onError: (error) => {
      toast({
        title: "Failed to activate quiz",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleActivateQuiz = (quizId: number) => {
    activateQuizMutation.mutate(quizId);
  };
  
  const handleViewSubmissions = (quizId: number) => {
    setSelectedQuizId(quizId);
    setIsViewSubmissionsOpen(true);
  };
  
  // Interface for quiz submissions
  interface QuizSubmission {
    id: number;
    userId: number;
    completed: boolean;
    score: number | null;
    completedAt: string | null;
    startedAt: string;
    user: {
      id: number;
      username: string;
      fullName: string | null;
    };
    correctAnswers?: number;
    totalQuestions?: number;
  }
  
  // Fetch quiz submissions when dialog is open
  const {
    data: quizSubmissions,
    isLoading: isLoadingSubmissions,
    refetch: refetchSubmissions
  } = useQuery<QuizSubmission[]>({
    queryKey: [`/api/quizzes/${selectedQuizId}/submissions`],
    enabled: !!selectedQuizId && isViewSubmissionsOpen,
  });
  
  const quizGenerationForm = useForm<z.infer<typeof quizGenerationSchema>>({
    resolver: zodResolver(quizGenerationSchema),
    defaultValues: {
      title: "",
      content: "",
      numQuestions: 10,
    },
  });
  
  // Create assignment mutation
  const createAssignmentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof assignmentSchema>) => {
      return await apiRequest(
        "POST", 
        `/api/classrooms/${classroomId}/assignments`, 
        data
      );
    },
    onSuccess: () => {
      toast({
        title: "Assignment created",
        description: "Your assignment has been created successfully.",
      });
      setIsAddAssignmentOpen(false);
      assignmentForm.reset();
      queryClient.invalidateQueries({ queryKey: [`/api/classrooms/${classroomId}/assignments`] });
    },
    onError: (error) => {
      toast({
        title: "Failed to create assignment",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Create material mutation
  const createMaterialMutation = useMutation({
    mutationFn: async (data: z.infer<typeof materialSchema>) => {
      return await apiRequest(
        "POST", 
        `/api/classrooms/${classroomId}/materials`, 
        data
      );
    },
    onSuccess: () => {
      toast({
        title: "Material added",
        description: "Your material has been added successfully.",
      });
      setIsAddMaterialOpen(false);
      materialForm.reset();
      queryClient.invalidateQueries({ queryKey: [`/api/classrooms/${classroomId}/materials`] });
    },
    onError: (error) => {
      toast({
        title: "Failed to add material",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const onAssignmentSubmit = (data: z.infer<typeof assignmentSchema>) => {
    createAssignmentMutation.mutate(data);
  };
  
  const onMaterialSubmit = (data: z.infer<typeof materialSchema>) => {
    createMaterialMutation.mutate(data);
  };
  
  // Create quiz mutation
  const createQuizMutation = useMutation({
    mutationFn: async (data: z.infer<typeof quizSchema>) => {
      return await apiRequest(
        "POST", 
        `/api/classrooms/${classroomId}/quizzes`, 
        data
      );
    },
    onSuccess: () => {
      toast({
        title: "Quiz created",
        description: "Your quiz has been created successfully.",
      });
      setIsCreateQuizOpen(false);
      quizForm.reset();
      queryClient.invalidateQueries({ queryKey: [`/api/classrooms/${classroomId}/quizzes`] });
    },
    onError: (error) => {
      toast({
        title: "Failed to create quiz",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Generate quiz mutation
  const generateQuizMutation = useMutation({
    mutationFn: async (data: z.infer<typeof quizGenerationSchema>) => {
      return await apiRequest(
        "POST", 
        `/api/classrooms/${classroomId}/quizzes/generate`, 
        data
      );
    },
    onSuccess: () => {
      toast({
        title: "Quiz generated",
        description: "Your quiz has been generated successfully using AI.",
      });
      setIsCreateQuizOpen(false);
      quizGenerationForm.reset();
      queryClient.invalidateQueries({ queryKey: [`/api/classrooms/${classroomId}/quizzes`] });
    },
    onError: (error) => {
      toast({
        title: "Failed to generate quiz",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const onQuizSubmit = (data: z.infer<typeof quizSchema>) => {
    createQuizMutation.mutate(data);
  };
  
  const onQuizGenerationSubmit = (data: z.infer<typeof quizGenerationSchema>) => {
    generateQuizMutation.mutate(data);
  };
  
  // Loading state
  if (isLoadingClassroom) {
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
  if (classroomError || !classroom) {
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
                  Failed to load classroom. The classroom may not exist or you don't have access to it.
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
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activePath={`/classroom/${id}`} />
        
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">{classroom.name}</h1>
                <p className="text-gray-500">{classroom.description}</p>
              </div>
              
              {user?.role === "teacher" && (
                <Button 
                  onClick={handleStartLecture}
                  disabled={createLectureMutation.isPending}
                >
                  {createLectureMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Video className="h-4 w-4 mr-2" />
                  )}
                  {activeLecture ? "Join Active Lecture" : "Start Lecture"}
                </Button>
              )}
              
              {user?.role === "student" && activeLecture && (
                <Button onClick={() => navigate(`/lecture/${activeLecture.id}`)}>
                  <Video className="h-4 w-4 mr-2" />
                  Join Active Lecture
                </Button>
              )}
            </div>
            
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6">
                <TabsTrigger value="stream">Stream</TabsTrigger>
                <TabsTrigger value="assignments">Assignments</TabsTrigger>
                <TabsTrigger value="materials">Materials</TabsTrigger>
                <TabsTrigger value="quizzes">Quizzes</TabsTrigger>
                <TabsTrigger value="people">People</TabsTrigger>
              </TabsList>
              
              <TabsContent value="stream">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2">
                    <Card>
                      <CardHeader>
                        <CardTitle>Announcements</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-500">No announcements yet.</p>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <div>
                    <Card className="mb-6">
                      <CardHeader>
                        <CardTitle>Upcoming</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {isLoadingAssignments ? (
                          <div className="flex items-center justify-center p-4">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : assignments && assignments.length > 0 ? (
                          <ul className="space-y-3">
                            {assignments.slice(0, 3).map((assignment) => (
                              <li key={assignment.id} className="flex items-start">
                                <Calendar className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
                                <div>
                                  <p className="font-medium">{assignment.title}</p>
                                  <p className="text-sm text-gray-500">
                                    {assignment.dueDate
                                      ? `Due ${format(new Date(assignment.dueDate), "MMM d, yyyy")}`
                                      : "No due date"}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-gray-500">No upcoming assignments.</p>
                        )}
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle>Class Code</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="bg-gray-100 p-3 rounded-md text-center">
                          <p className="text-lg font-mono">{classroom.code}</p>
                          <p className="text-xs text-gray-500 mt-1">Share this code with students to join</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="assignments">
                <div className="flex justify-between mb-4">
                  <h2 className="text-xl font-semibold">Assignments</h2>
                  {user?.role === "teacher" && (
                    <Button onClick={() => setIsAddAssignmentOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Assignment
                    </Button>
                  )}
                </div>
                
                {isLoadingAssignments ? (
                  <div className="flex items-center justify-center p-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : assignments && assignments.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {assignments.map((assignment) => (
                      <Card key={assignment.id}>
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle>{assignment.title}</CardTitle>
                              <CardDescription>
                                {assignment.dueDate
                                  ? `Due ${format(new Date(assignment.dueDate), "MMMM d, yyyy")}`
                                  : "No due date"}
                              </CardDescription>
                            </div>
                            <div className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">
                              Upcoming
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-600">
                            {assignment.description || "No description provided."}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Assignments Yet</h3>
                      <p className="text-gray-500 mb-4">
                        {user?.role === "teacher"
                          ? "Create your first assignment to get started."
                          : "There are no assignments in this class yet."}
                      </p>
                      {user?.role === "teacher" && (
                        <Button onClick={() => setIsAddAssignmentOpen(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Assignment
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              <TabsContent value="materials">
                <div className="flex justify-between mb-4">
                  <h2 className="text-xl font-semibold">Materials</h2>
                  {user?.role === "teacher" && (
                    <Button onClick={() => setIsAddMaterialOpen(true)}>
                      <Upload className="h-4 w-4 mr-2" />
                      Add Material
                    </Button>
                  )}
                </div>
                
                {isLoadingMaterials ? (
                  <div className="flex items-center justify-center p-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : materials && materials.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {materials.map((material) => (
                      <Card key={material.id}>
                        <CardHeader>
                          <CardTitle>{material.title}</CardTitle>
                          <CardDescription>
                            {material.createdAt ? format(new Date(material.createdAt), "MMM d, yyyy") : "Date not available"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-600 mb-4">
                            {material.description || "No description provided."}
                          </p>
                          {material.url && (
                            <Button variant="outline" asChild className="w-full">
                              <a href={material.url} target="_blank" rel="noopener noreferrer">
                                View Material
                              </a>
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Materials Yet</h3>
                      <p className="text-gray-500 mb-4">
                        {user?.role === "teacher"
                          ? "Add your first material to get started."
                          : "There are no materials in this class yet."}
                      </p>
                      {user?.role === "teacher" && (
                        <Button onClick={() => setIsAddMaterialOpen(true)}>
                          <Upload className="h-4 w-4 mr-2" />
                          Add Material
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              <TabsContent value="quizzes">
                <div className="flex justify-between mb-4">
                  <h2 className="text-xl font-semibold">Quizzes</h2>
                  {user?.role === "teacher" && (
                    <div>
                      <Button onClick={() => setIsCreateQuizOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Quiz
                      </Button>
                    </div>
                  )}
                </div>
                
                {isLoadingQuizzes ? (
                  <div className="flex items-center justify-center p-16">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : quizzes && quizzes.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {quizzes.map((quiz) => (
                      <Card key={quiz.id} className="flex flex-col">
                        <CardHeader>
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle>{quiz.title}</CardTitle>
                              <CardDescription>
                                {quiz.createdAt ? format(new Date(quiz.createdAt), "MMM d, yyyy") : "Date not available"}
                              </CardDescription>
                            </div>
                            {quiz.isActive === true && (
                              <div className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                                Active
                              </div>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                          <p className="text-sm text-gray-600 mb-4">
                            {quiz.description || "No description provided."}
                          </p>
                        </CardContent>
                        <div className="p-4 pt-0 mt-auto">
                          <Button 
                            variant="outline" 
                            className="w-full mb-2"
                            onClick={() => navigate(`/quizzes/${quiz.id}`)}
                          >
                            {user?.role === "student" ? "Take Quiz" : "View Quiz"}
                          </Button>
                          
                          {user?.role === "teacher" && (
                            <>
                              <Button 
                                variant="outline" 
                                className="w-full mb-2" 
                                onClick={() => handleViewSubmissions(quiz.id)}
                              >
                                <Users className="h-4 w-4 mr-2" />
                                View Submissions
                              </Button>
                              
                              <Button 
                                variant="outline" 
                                className="w-full" 
                                disabled={quiz.isActive === true}
                                onClick={() => handleActivateQuiz(quiz.id)}
                              >
                                {quiz.isActive === true ? "Quiz is Active" : "Activate Quiz"}
                              </Button>
                            </>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <BookOpen className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium mb-2">No Quizzes Yet</h3>
                      <p className="text-gray-500 mb-4">
                        {user?.role === "teacher"
                          ? "Create your first quiz to get started. You can manually create a quiz or use AI to generate one from your content."
                          : "There are no quizzes in this class yet."}
                      </p>
                      {user?.role === "teacher" && (
                        <div className="flex flex-col sm:flex-row gap-2 justify-center">
                          <Button onClick={() => setIsCreateQuizOpen(true)} variant="outline">
                            <QuizIcon className="h-4 w-4 mr-2" />
                            Create Quiz
                          </Button>
                          <Button onClick={() => setIsCreateQuizOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Quiz
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              
              <TabsContent value="people">
                <Card>
                  <CardHeader>
                    <CardTitle>Class Members</CardTitle>
                    <CardDescription>View all members of this classroom</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingMembers ? (
                      <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : classroomMembers && classroomMembers.length > 0 ? (
                      <div className="space-y-8">
                        {/* Teacher section */}
                        <div>
                          <h3 className="font-medium text-sm text-gray-500 uppercase tracking-wider mb-4">
                            Teacher
                          </h3>
                          <div className="space-y-4">
                            {classroomMembers
                              .filter(member => member.user.role === 'teacher')
                              .map(member => (
                                <div key={member.userId} className="flex items-center p-3 rounded-md hover:bg-gray-50">
                                  <div className="h-10 w-10 rounded-full bg-primary text-white flex items-center justify-center mr-3">
                                    {member.user.fullName ? member.user.fullName.charAt(0).toUpperCase() : member.user.username.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-medium">{member.user.fullName || member.user.username}</p>
                                    <p className="text-sm text-gray-500">{member.user.role}</p>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                        
                        {/* Students section */}
                        <div>
                          <h3 className="font-medium text-sm text-gray-500 uppercase tracking-wider mb-4">
                            Students ({classroomMembers.filter(member => member.user.role === 'student').length})
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {classroomMembers
                              .filter(member => member.user.role === 'student')
                              .map(member => (
                                <div key={member.userId} className="flex items-center p-3 rounded-md hover:bg-gray-50">
                                  <div className="h-10 w-10 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center mr-3">
                                    {member.user.fullName ? member.user.fullName.charAt(0).toUpperCase() : member.user.username.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-medium">{member.user.fullName || member.user.username}</p>
                                    <p className="text-sm text-gray-500">{member.user.role}</p>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="h-12 w-12 mx-auto text-gray-400 mb-4">👥</div>
                        <h3 className="text-lg font-medium mb-2">No members yet</h3>
                        <p className="text-gray-500 mb-4">
                          {user?.role === 'teacher' 
                            ? "Share your class code with students to join." 
                            : "You are the only member in this classroom."}
                        </p>
                        {user?.role === 'teacher' && (
                          <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-200 inline-block">
                            <p className="text-sm text-gray-500 mb-2">Class Code</p>
                            <p className="font-mono text-lg">{classroom.code}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
      
      {/* Add Assignment Dialog */}
      <Dialog open={isAddAssignmentOpen} onOpenChange={setIsAddAssignmentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Assignment</DialogTitle>
            <DialogDescription>
              Create a new assignment for your class.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...assignmentForm}>
            <form onSubmit={assignmentForm.handleSubmit(onAssignmentSubmit)}>
              <div className="space-y-4">
                <FormField
                  control={assignmentForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Assignment title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={assignmentForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Provide details about the assignment"
                          rows={4}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={assignmentForm.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddAssignmentOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createAssignmentMutation.isPending}
                >
                  {createAssignmentMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Assignment"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Add Material Dialog */}
      <Dialog open={isAddMaterialOpen} onOpenChange={setIsAddMaterialOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Material</DialogTitle>
            <DialogDescription>
              Add a new material for your class.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...materialForm}>
            <form onSubmit={materialForm.handleSubmit(onMaterialSubmit)}>
              <div className="space-y-4">
                <FormField
                  control={materialForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Material title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={materialForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Provide details about the material"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={materialForm.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="https://example.com/material.pdf" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddMaterialOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMaterialMutation.isPending}
                >
                  {createMaterialMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    "Add Material"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Quiz Creation Dialog with Tabs */}
      <Dialog open={isCreateQuizOpen} onOpenChange={setIsCreateQuizOpen}>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader>
            <DialogTitle>Create Quiz</DialogTitle>
            <DialogDescription>
              Create a new quiz for your class or generate one with AI.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="manual">
            <TabsList className="grid grid-cols-2 mb-4">
              <TabsTrigger value="manual">
                <Plus className="h-4 w-4 mr-2" />
                Manual Creation
              </TabsTrigger>
              <TabsTrigger value="ai">
                <Brain className="h-4 w-4 mr-2" />
                AI Generation
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="manual">
              <Form {...quizForm}>
                <form onSubmit={quizForm.handleSubmit(onQuizSubmit)}>
                  <div className="space-y-4">
                    <FormField
                      control={quizForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title</FormLabel>
                          <FormControl>
                            <Input placeholder="Quiz title" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quizForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Provide details about the quiz"
                              rows={3}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quizForm.control}
                      name="timeLimit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Time Limit (minutes)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              placeholder="e.g., 30"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <DialogFooter className="mt-6">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateQuizOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createQuizMutation.isPending}
                    >
                      {createQuizMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        "Create Quiz"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </TabsContent>
            
            <TabsContent value="ai">
              <Form {...quizGenerationForm}>
                <form onSubmit={quizGenerationForm.handleSubmit(onQuizGenerationSubmit)}>
                  <div className="space-y-4">
                    <FormField
                      control={quizGenerationForm.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quiz Title</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter quiz title" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quizGenerationForm.control}
                      name="content"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Content to Generate Quiz From</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Paste the lecture notes, material content, or text you want to generate a quiz from..."
                              rows={8}
                              className="font-mono text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={quizGenerationForm.control}
                      name="numQuestions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Number of Questions</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              min={1}
                              max={20}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="bg-amber-50 p-4 rounded-md mt-4">
                    <h4 className="text-amber-800 font-medium flex items-center">
                      <AlertCircle className="h-4 w-4 mr-2" />
                      Note
                    </h4>
                    <p className="text-amber-700 text-sm mt-1">
                      Quiz generation uses Google's Gemini AI to create questions based on your content. The process may take 
                      a few moments depending on the length of your content and the number of questions requested.
                    </p>
                  </div>
                  
                  <DialogFooter className="mt-6">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateQuizOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={generateQuizMutation.isPending}
                    >
                      {generateQuizMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating Quiz...
                        </>
                      ) : (
                        "Generate Quiz"
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      
      {/* Quiz Submissions Dialog */}
      <Dialog open={isViewSubmissionsOpen} onOpenChange={setIsViewSubmissionsOpen}>
        <DialogContent className="sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>Quiz Submissions</DialogTitle>
            <DialogDescription>
              View all student submissions for this quiz
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingSubmissions ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : quizSubmissions && quizSubmissions.length > 0 ? (
            <div className="overflow-auto max-h-[500px]">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 px-4">Student</th>
                    <th className="py-2 px-4">Status</th>
                    <th className="py-2 px-4">Score</th>
                    <th className="py-2 px-4">Submitted</th>
                    <th className="py-2 px-4">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {quizSubmissions.map((submission) => (
                    <tr key={submission.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        {submission.user.fullName || submission.user.username}
                      </td>
                      <td className="py-3 px-4">
                        {submission.completed ? (
                          <div className="flex items-center text-green-600">
                            <Check className="h-4 w-4 mr-1" />
                            Completed
                          </div>
                        ) : (
                          <div className="flex items-center text-orange-500">
                            <Loader2 className="h-4 w-4 mr-1" />
                            In Progress
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {submission.completed ? (
                          <div className="font-medium">
                            {submission.score !== null ? `${submission.score}%` : 'N/A'}
                          </div>
                        ) : (
                          <div className="text-gray-400">--</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {submission.completedAt ? (
                          format(new Date(submission.completedAt), "MMM d, yyyy h:mm a")
                        ) : (
                          <div className="text-gray-400">Not submitted</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {submission.completed && submission.correctAnswers !== undefined && submission.totalQuestions !== undefined && (
                          <div className="text-sm text-gray-600">
                            {submission.correctAnswers} / {submission.totalQuestions} correct
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="h-12 w-12 mx-auto text-gray-400 mb-4">📝</div>
              <h3 className="text-lg font-medium mb-2">No Submissions Yet</h3>
              <p className="text-gray-500 mb-4">
                No students have submitted this quiz yet. 
              </p>
            </div>
          )}
          
          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setIsViewSubmissionsOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
