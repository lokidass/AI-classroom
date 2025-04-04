import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Bot, Send, RefreshCcw } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

type AIAssistantProps = {
  lectureId: number;
};

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

export default function AIAssistant({ lectureId }: AIAssistantProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Initialize with welcome message
  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        content: "Hi there! I'm your AI learning assistant for this lecture. Ask me any questions about the topics being discussed, and I'll do my best to help.",
        sender: 'ai',
        timestamp: new Date(),
      },
    ]);
  }, [lectureId]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // AI response mutation
  const aiResponseMutation = useMutation({
    mutationFn: async (question: string) => {
      // This would call an endpoint that uses the Gemini API
      // For now, we'll directly call our API that handles this
      return await apiRequest(
        "POST", 
        `/api/lectures/${lectureId}/ai-question`, 
        { question }
      );
    },
    onSuccess: async (response) => {
      const data = await response.json();
      
      // Add AI response to messages
      setMessages(prevMessages => [
        ...prevMessages,
        {
          id: `ai-${Date.now()}`,
          content: data.answer || "I'm sorry, I couldn't generate a response. Please try again.",
          sender: 'ai',
          timestamp: new Date(),
        },
      ]);
      
      setIsTyping(false);
    },
    onError: (error: Error) => {
      // Add error message
      setMessages(prevMessages => [
        ...prevMessages,
        {
          id: `ai-error-${Date.now()}`,
          content: "I'm sorry, I encountered an error processing your question. Please try again later.",
          sender: 'ai',
          timestamp: new Date(),
        },
      ]);
      
      toast({
        title: "AI Assistant Error",
        description: error.message,
        variant: "destructive",
      });
      
      setIsTyping(false);
    },
  });
  
  // Send question to AI
  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    
    // Add user message to chat
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };
    
    setMessages(prevMessages => [...prevMessages, userMessage]);
    
    // Start "AI is typing" indication
    setIsTyping(true);
    
    // Send to AI
    aiResponseMutation.mutate(inputValue);
    
    // Clear input
    setInputValue('');
  };
  
  // Handle Enter key in input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // Clear chat history
  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome-new',
        content: "Chat history cleared. How can I help you with today's lecture?",
        sender: 'ai',
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <span className="material-icons text-secondary mr-2">smart_toy</span>
          <h3 className="font-medium">AI Learning Assistant</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearChat}
        >
          <RefreshCcw className="h-4 w-4 mr-2" />
          Clear chat
        </Button>
      </div>
      
      <div className="chat-container bg-gray-50 p-4 rounded-md border border-gray-200 h-64 sm:h-80 overflow-y-auto mb-4">
        {messages.map((message) => (
          <div 
            key={message.id}
            className={`chat-message ${message.sender === 'user' ? 'user' : 'ai'} mb-4`}
          >
            <div className="flex items-start">
              {message.sender === 'ai' ? (
                <Avatar className="h-8 w-8 mr-2">
                  <AvatarFallback className="bg-green-500 text-white">AI</AvatarFallback>
                </Avatar>
              ) : (
                <Avatar className="h-8 w-8 mr-2">
                  <AvatarFallback className="bg-primary text-white">
                    {user?.fullName?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="flex-1">
                <div className="bg-white p-3 rounded-lg shadow-sm">
                  <div className="whitespace-pre-wrap">
                    {message.content}
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="chat-message ai mb-4">
            <div className="flex items-start">
              <Avatar className="h-8 w-8 mr-2">
                <AvatarFallback className="bg-green-500 text-white">AI</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="bg-white p-3 rounded-lg shadow-sm">
                  <div className="flex items-center">
                    <div className="dot-typing"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <div className="flex">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about the lecture..."
          className="flex-grow rounded-r-none"
          disabled={isTyping || aiResponseMutation.isPending}
        />
        <Button
          onClick={handleSendMessage}
          className="rounded-l-none"
          disabled={!inputValue.trim() || isTyping || aiResponseMutation.isPending}
        >
          {aiResponseMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      
      <style jsx>{`
        .chat-message.user {
          background-color: #e3f2fd;
          margin-left: auto;
          border-bottom-right-radius: 4px;
        }
        
        .chat-message.ai {
          background-color: #e8f5e9;
          margin-right: auto;
          border-bottom-left-radius: 4px;
        }
        
        .dot-typing {
          position: relative;
          left: -9999px;
          width: 6px;
          height: 6px;
          border-radius: 5px;
          background-color: #9e9e9e;
          color: #9e9e9e;
          box-shadow: 9984px 0 0 0 #9e9e9e, 9999px 0 0 0 #9e9e9e, 10014px 0 0 0 #9e9e9e;
          animation: dot-typing 1.5s infinite linear;
        }
        
        @keyframes dot-typing {
          0% {
            box-shadow: 9984px 0 0 0 #9e9e9e, 9999px 0 0 0 #9e9e9e, 10014px 0 0 0 #9e9e9e;
          }
          16.667% {
            box-shadow: 9984px -10px 0 0 #9e9e9e, 9999px 0 0 0 #9e9e9e, 10014px 0 0 0 #9e9e9e;
          }
          33.333% {
            box-shadow: 9984px 0 0 0 #9e9e9e, 9999px 0 0 0 #9e9e9e, 10014px 0 0 0 #9e9e9e;
          }
          50% {
            box-shadow: 9984px 0 0 0 #9e9e9e, 9999px -10px 0 0 #9e9e9e, 10014px 0 0 0 #9e9e9e;
          }
          66.667% {
            box-shadow: 9984px 0 0 0 #9e9e9e, 9999px 0 0 0 #9e9e9e, 10014px 0 0 0 #9e9e9e;
          }
          83.333% {
            box-shadow: 9984px 0 0 0 #9e9e9e, 9999px 0 0 0 #9e9e9e, 10014px -10px 0 0 #9e9e9e;
          }
          100% {
            box-shadow: 9984px 0 0 0 #9e9e9e, 9999px 0 0 0 #9e9e9e, 10014px 0 0 0 #9e9e9e;
          }
        }
      `}</style>
    </div>
  );
}
