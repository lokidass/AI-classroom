import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { webSocketClient } from '@/lib/websocket';
import { useAuth } from '@/hooks/use-auth';
import { Message } from '@shared/schema';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Send } from 'lucide-react';

type ChatProps = {
  lectureId: number;
  userId: number;
};

interface ChatMessage extends Message {
  user?: {
    id: number;
    username: string;
    fullName: string;
    role: string;
  };
}

export default function Chat({ lectureId, userId }: ChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Fetch initial messages
  const { data: initialMessages, isLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/lectures/${lectureId}/messages`],
  });
  
  // Set initial messages once loaded
  useEffect(() => {
    if (initialMessages) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  // WebSocket event listeners for real-time chat
  useEffect(() => {
    // Handle incoming chat messages
    const handleChatMessage = (message: ChatMessage) => {
      setMessages(prevMessages => [...prevMessages, message]);
    };
    
    // Handle chat history (all messages)
    const handleChatHistory = (data: { messages: ChatMessage[] }) => {
      if (data.messages && Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    };
    
    webSocketClient.on('chat_message', handleChatMessage);
    webSocketClient.on('chat_history', handleChatHistory);
    
    return () => {
      webSocketClient.off('chat_message', handleChatMessage);
      webSocketClient.off('chat_history', handleChatHistory);
    };
  }, []);
  
  // Send message
  const sendMessage = () => {
    if (!messageInput.trim()) return;
    
    setIsSending(true);
    
    webSocketClient.sendChatMessage(messageInput);
    
    setMessageInput('');
    setIsSending(false);
  };
  
  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  
  // Get user's initials for avatar
  const getUserInitials = (fullName: string) => {
    if (!fullName) return '?';
    
    const names = fullName.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
  };
  
  // Get color based on user id (for consistent avatar colors)
  const getUserColor = (id: number) => {
    const colors = [
      'bg-red-500',
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500'
    ];
    
    return colors[id % colors.length];
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <span className="material-icons text-primary mr-2">question_answer</span>
          <h3 className="font-medium">Class Chat</h3>
        </div>
        <div className="text-sm text-gray-500">
          {messages.length} messages
        </div>
      </div>
      
      <div className="chat-container bg-gray-50 p-4 rounded-md border border-gray-200 h-64 sm:h-80 overflow-y-auto mb-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div 
              key={message.id || index} 
              className="mb-4"
            >
              <div className="flex items-start">
                <Avatar className="h-8 w-8 mr-3 flex-shrink-0">
                  <AvatarFallback className={getUserColor(message.userId)}>
                    {message.user ? getUserInitials(message.user.fullName) : '?'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-baseline">
                    <span className="font-medium text-sm">
                      {message.user?.fullName || 'Unknown User'}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                    {message.user?.role === 'teacher' && (
                      <span className="ml-2 text-xs bg-primary text-white px-2 py-0.5 rounded-full">
                        Teacher
                      </span>
                    )}
                  </div>
                  <p className="text-sm mt-1">{message.content}</p>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="flex">
        <Input
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-grow rounded-r-none"
          disabled={isSending}
        />
        <Button
          onClick={sendMessage}
          className="rounded-l-none"
          disabled={!messageInput.trim() || isSending}
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
