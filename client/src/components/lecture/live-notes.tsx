import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { webSocketClient } from '@/lib/websocket';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Download, Save } from 'lucide-react';

type LiveNotesProps = {
  lectureId: number;
};

export default function LiveNotes({ lectureId }: LiveNotesProps) {
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notesContent, setNotesContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  
  // Fetch lecture notes
  const { 
    data: notes,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: [`/api/lectures/${lectureId}/notes`],
  });
  
  // Save notes mutation
  const saveNotesMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest(
        "POST", 
        `/api/lectures/${lectureId}/notes`, 
        { content }
      );
    },
    onSuccess: () => {
      toast({
        title: "Notes saved",
        description: "Lecture notes have been saved successfully.",
      });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: [`/api/lectures/${lectureId}/notes`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save notes",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Update notes content when notes data changes
  useEffect(() => {
    if (notes && Array.isArray(notes) && notes.length > 0) {
      // Use the most recent note
      const latestNote = notes[notes.length - 1];
      setNotesContent(latestNote.content);
    } else {
      setNotesContent("Waiting for lecture to begin...");
    }
  }, [notes]);
  
  // Listen for transcription updates
  useEffect(() => {
    const handleTranscription = (data: { text: string, isFinal?: boolean }) => {
      // Only show generating indicator for final transcriptions
      if (data.isFinal === true) {
        setIsAIGenerating(true);
        console.log("Received final transcription:", data.text);
      } else {
        console.log("Received interim transcription");
      }
    };
    
    const handleLectureNote = (data: any) => {
      setIsAIGenerating(false);
      
      // Update the notes content with the new AI-generated notes
      if (data && data.content) {
        setNotesContent(data.content);
      }
      
      // Refresh the notes from the server
      refetch();
    };
    
    webSocketClient.on('transcription', handleTranscription);
    webSocketClient.on('lecture_note', handleLectureNote);
    
    return () => {
      webSocketClient.off('transcription', handleTranscription);
      webSocketClient.off('lecture_note', handleLectureNote);
    };
  }, [refetch]);
  
  // Refresh notes
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast({
        title: "Notes refreshed",
        description: "Lecture notes have been refreshed.",
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: "Failed to refresh lecture notes.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Save notes
  const handleSaveNotes = () => {
    if (notesContent.trim()) {
      saveNotesMutation.mutate(notesContent);
    }
  };
  
  // Toggle editing mode
  const toggleEditing = () => {
    setIsEditing(!isEditing);
  };
  
  // Download notes as a text file
  const handleDownload = () => {
    if (!notesContent.trim()) {
      toast({
        title: "No content",
        description: "There are no notes to download.",
        variant: "destructive",
      });
      return;
    }
    
    const element = document.createElement("a");
    const file = new Blob([notesContent], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `Lecture_Notes_${lectureId}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    
    toast({
      title: "Notes downloaded",
      description: "Lecture notes have been downloaded successfully.",
    });
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <span className="material-icons text-secondary mr-2">auto_awesome</span>
          <h3 className="font-medium">AI-Generated Lecture Notes</h3>
        </div>
        <div className="flex space-x-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleEditing}
                disabled={saveNotesMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveNotes}
                disabled={saveNotesMutation.isPending}
              >
                {saveNotesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleEditing}
              >
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </>
          )}
        </div>
      </div>
      
      <div className="notes-content bg-gray-50 p-4 rounded-md border border-gray-200 relative">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">
            <p>Error loading notes. Please try refreshing.</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={handleRefresh}
            >
              Try Again
            </Button>
          </div>
        ) : isEditing ? (
          <Textarea
            value={notesContent}
            onChange={(e) => setNotesContent(e.target.value)}
            className="min-h-[300px] font-mono"
          />
        ) : (
          <div className="prose max-w-none">
            {isAIGenerating && (
              <div className="absolute top-2 right-2">
                <div className="flex items-center bg-primary/10 px-2 py-1 rounded text-xs font-medium text-primary">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Generating...
                </div>
              </div>
            )}
            
            {notesContent.split('\n').map((paragraph, index) => {
              // Check if the paragraph is a heading
              if (paragraph.startsWith('# ')) {
                return <h1 key={index} className="text-2xl font-bold mt-4 mb-2">{paragraph.replace('# ', '')}</h1>;
              } else if (paragraph.startsWith('## ')) {
                return <h2 key={index} className="text-xl font-bold mt-4 mb-2">{paragraph.replace('## ', '')}</h2>;
              } else if (paragraph.startsWith('### ')) {
                return <h3 key={index} className="text-lg font-bold mt-3 mb-2">{paragraph.replace('### ', '')}</h3>;
              } else if (paragraph.startsWith('- ')) {
                return <li key={index} className="ml-6">{paragraph.replace('- ', '')}</li>;
              } else if (paragraph.startsWith('**')) {
                return <p key={index} className="font-bold my-2">{paragraph.replace(/\*\*/g, '')}</p>;
              } else if (paragraph.trim() === '') {
                return <br key={index} />;
              } else {
                return <p key={index} className="my-2">{paragraph}</p>;
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
}
