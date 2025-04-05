import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import { Quiz, QuizQuestion } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, CheckCircle2, Circle, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function QuizView() {
  const { id } = useParams<{ id: string }>();
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  
  // Fetch quiz data and questions
  const {
    data: quizData,
    isLoading: isLoadingQuiz,
    error: quizError
  } = useQuery<{ quiz: Quiz, questions: QuizQuestion[] }>({
    queryKey: [`/api/quizzes/${id}`],
  });
  
  // Extract quiz and questions from response
  const quiz = quizData?.quiz;
  const questions = quizData?.questions;
  const isLoadingQuestions = isLoadingQuiz; // since they're fetched together
  
  const handleAnswerSelect = (questionId: number, answer: string) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };
  
  const handleSubmit = () => {
    // Here you would submit the quiz responses to the server
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      navigate(`/classroom/${quiz?.classroomId}`);
    }, 1500);
  };
  
  const handleGoBack = () => {
    navigate(`/classroom/${quiz?.classroomId}`);
  };
  
  // Loading state
  if (isLoadingQuiz || isLoadingQuestions) {
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
  if (quizError || !quiz) {
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
                  Failed to load quiz. The quiz may not exist or you don't have access to it.
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
        <Sidebar activePath={`/classroom/${quiz.classroomId}`} />
        
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <Button 
                variant="ghost" 
                className="flex items-center text-gray-500 hover:text-gray-700"
                onClick={handleGoBack}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Classroom
              </Button>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900">{quiz.title}</h1>
                  {quiz.description && (
                    <p className="text-gray-500 mt-1">{quiz.description}</p>
                  )}
                </div>
                <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm">
                  {quiz.isActive ? "Active" : "Inactive"}
                </div>
              </div>
              
              <Separator className="my-4" />
              
              <div className="mt-6 space-y-8">
                {questions && questions.length > 0 ? (
                  questions.map((question, index) => (
                    <div key={question.id} className="border rounded-md p-4">
                      <h3 className="text-md font-medium mb-3">
                        Question {index + 1}: {question.questionText}
                      </h3>
                      <div className="space-y-2 ml-1">
                        {['A', 'B', 'C', 'D'].map((option) => {
                          const optionKey = `option${option}` as keyof typeof question;
                          const optionValue = question[optionKey] as string;
                          
                          if (!optionValue) return null;
                          
                          const isSelected = selectedAnswers[question.id] === option;
                          
                          return (
                            <div 
                              key={option}
                              className={`flex items-start p-2 rounded-md cursor-pointer hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50 border border-blue-100' : ''}`}
                              onClick={() => handleAnswerSelect(question.id, option)}
                            >
                              <div className="mr-3 mt-0.5">
                                {isSelected ? (
                                  <CheckCircle2 className="h-5 w-5 text-blue-600" />
                                ) : (
                                  <Circle className="h-5 w-5 text-gray-300" />
                                )}
                              </div>
                              <div>
                                <span className="font-medium mr-2">{option}.</span>
                                {optionValue}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10">
                    <h3 className="text-lg font-medium text-gray-500">No questions available</h3>
                    <p className="text-gray-400 mt-1">This quiz doesn't have any questions yet.</p>
                  </div>
                )}
              </div>
              
              {questions && questions.length > 0 && (
                <div className="mt-8 flex justify-end">
                  <Button 
                    onClick={handleSubmit}
                    disabled={isSubmitting || Object.keys(selectedAnswers).length === 0}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit Quiz"
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}