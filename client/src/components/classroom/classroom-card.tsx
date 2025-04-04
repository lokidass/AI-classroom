import { useAuth } from "@/hooks/use-auth";
import { Classroom } from "@shared/schema";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Code, Parentheses, School, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";

type ClassroomCardProps = {
  classroom: Classroom;
};

export default function ClassroomCard({ classroom }: ClassroomCardProps) {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  
  // Function to get a deterministic color based on classroom name
  const getClassColor = (name: string) => {
    const colors = [
      "bg-primary text-primary-foreground",
      "bg-secondary text-secondary-foreground",
      "bg-accent text-accent-foreground",
      "bg-green-600 text-white",
      "bg-blue-600 text-white",
      "bg-purple-600 text-white",
      "bg-orange-600 text-white"
    ];
    
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  };
  
  // Get icon for classroom subject
  const getSubjectIcon = (name: string) => {
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes("computer") || lowerName.includes("programming") || lowerName.includes("code")) {
      return <Code className="h-5 w-5" />;
    } else if (lowerName.includes("math") || lowerName.includes("calculus") || lowerName.includes("algebra")) {
      return <Parentheses className="h-5 w-5" />;
    } else {
      return <BookOpen className="h-5 w-5" />;
    }
  };
  
  const cardColor = getClassColor(classroom.name);
  const subjectIcon = getSubjectIcon(classroom.name);
  
  // Format creation date
  const formattedDate = useMemo(() => {
    if (!classroom.createdAt) return "";
    return new Date(classroom.createdAt).toLocaleDateString();
  }, [classroom.createdAt]);

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow duration-200">
      <div className={`h-3 ${cardColor.split(" ")[0]}`}></div>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl">{classroom.name}</CardTitle>
            <CardDescription>Created {formattedDate}</CardDescription>
          </div>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cardColor}`}>
            {subjectIcon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 h-14 overflow-hidden">
          <p className="text-sm text-gray-600 line-clamp-2">
            {classroom.description || "No description provided."}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="font-normal">
            Code: {classroom.code}
          </Badge>
          {isTeacher && (
            <Badge variant="secondary">
              Teacher
            </Badge>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <Link to={`/classroom/${classroom.id}`}>
            Enter Classroom
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
