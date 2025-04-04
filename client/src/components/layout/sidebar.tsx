import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { Classroom } from '@shared/schema';
import { 
  Home, Video, FileText, Users, Folder, Calendar,
  BookOpen, Code, Parentheses, School
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

type SidebarProps = {
  activePath: string;
};

export default function Sidebar({ activePath }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  
  // Get all classrooms for the sidebar
  const { data: classrooms, isLoading: isLoadingClassrooms } = useQuery<Classroom[]>({
    queryKey: ["/api/classrooms"],
  });
  
  // Handle screen resize for mobile sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileSidebarOpen(false);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const sidebar = document.querySelector('.sidebar');
      const toggleButton = document.getElementById('sidebar-toggle');
      
      if (
        window.innerWidth < 1024 &&
        isMobileSidebarOpen &&
        sidebar &&
        !sidebar.contains(event.target as Node) &&
        toggleButton !== event.target &&
        !toggleButton?.contains(event.target as Node)
      ) {
        setIsMobileSidebarOpen(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    
    // Cleanup
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isMobileSidebarOpen]);
  
  // Toggle mobile sidebar
  useEffect(() => {
    const toggleButton = document.getElementById('sidebar-toggle');
    
    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        setIsMobileSidebarOpen(!isMobileSidebarOpen);
      });
    }
  }, [isMobileSidebarOpen]);
  
  // Function to get a deterministic color based on classroom name
  const getClassColor = (name: string) => {
    const colors = [
      "bg-primary",
      "bg-secondary",
      "bg-accent",
      "bg-green-600",
      "bg-blue-600",
      "bg-purple-600",
      "bg-orange-600"
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
      return <Code className="h-4 w-4" />;
    } else if (lowerName.includes("math") || lowerName.includes("calculus") || lowerName.includes("algebra")) {
      return <Parentheses className="h-4 w-4" />;
    } else {
      return <BookOpen className="h-4 w-4" />;
    }
  };
  
  // Get active classroom
  const activeClassroom = classrooms?.find(
    classroom => location === `/classroom/${classroom.id}` || 
                 location.startsWith(`/lecture/`) // This is a simplification, ideally we'd check if the lecture belongs to this classroom
  );

  return (
    <aside 
      className={cn(
        "sidebar w-64 bg-white border-r border-gray-200 flex-shrink-0 overflow-y-auto z-10",
        "transition-all duration-300 ease-in-out",
        "lg:relative lg:left-0",
        "fixed top-16 bottom-0 left-[-17rem]",
        isMobileSidebarOpen && "left-0"
      )}
    >
      <div className="flex flex-col h-full">
        {/* Classroom Header - Show only if we're in a classroom context */}
        {activeClassroom && (
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-800">{activeClassroom.name}</h2>
            <p className="text-sm text-gray-500">
              {activeClassroom.description?.length > 40
                ? `${activeClassroom.description.substring(0, 40)}...`
                : activeClassroom.description || "No description"}
            </p>
          </div>
        )}
        
        {/* Main Navigation */}
        <nav className="flex-1">
          <ul>
            {activeClassroom ? (
              /* Classroom-specific Navigation */
              <>
                <li>
                  <Link 
                    href={`/classroom/${activeClassroom.id}`}
                    className={cn(
                      "flex items-center px-4 py-3 text-gray-700 hover:bg-gray-50",
                      activePath === `/classroom/${activeClassroom.id}` && "bg-primary/10 text-primary border-l-4 border-primary"
                    )}
                  >
                    <Home className="h-5 w-5 mr-3" />
                    <span>Stream</span>
                  </Link>
                </li>
                <li>
                  <a 
                    href="#" 
                    className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-50"
                  >
                    <FileText className="h-5 w-5 mr-3" />
                    <span>Assignments</span>
                  </a>
                </li>
                <li>
                  <a 
                    href="#" 
                    className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-50"
                  >
                    <Users className="h-5 w-5 mr-3" />
                    <span>People</span>
                  </a>
                </li>
                <li>
                  <a 
                    href="#" 
                    className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-50"
                  >
                    <Folder className="h-5 w-5 mr-3" />
                    <span>Materials</span>
                  </a>
                </li>
                <li>
                  <a 
                    href="#" 
                    className="flex items-center px-4 py-3 text-gray-700 hover:bg-gray-50"
                  >
                    <Calendar className="h-5 w-5 mr-3" />
                    <span>Schedule</span>
                  </a>
                </li>
              </>
            ) : (
              /* Dashboard Navigation */
              <li>
                <Link 
                  href="/"
                  className={cn(
                    "flex items-center px-4 py-3 text-gray-700 hover:bg-gray-50",
                    activePath === "/" && "bg-primary/10 text-primary border-l-4 border-primary"
                  )}
                >
                  <Home className="h-5 w-5 mr-3" />
                  <span>Dashboard</span>
                </Link>
              </li>
            )}
          </ul>
        </nav>
        
        {/* Classroom List */}
        <div className="p-4 border-t border-gray-200">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">My Classes</h3>
          
          {isLoadingClassrooms ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center p-2">
                  <Skeleton className="h-8 w-8 rounded mr-3" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : classrooms && classrooms.length > 0 ? (
            <ul className="space-y-1">
              {classrooms.map((classroom) => (
                <li key={classroom.id}>
                  <Link
                    href={`/classroom/${classroom.id}`}
                    className={cn(
                      "flex items-center p-2 text-gray-700 hover:bg-gray-50 rounded-md",
                      activePath === `/classroom/${classroom.id}` && "bg-gray-100"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 text-white rounded flex items-center justify-center mr-3",
                      getClassColor(classroom.name)
                    )}>
                      {getSubjectIcon(classroom.name)}
                    </div>
                    <span className="text-sm truncate">{classroom.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center p-4 text-gray-500">
              <School className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No classes yet</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
