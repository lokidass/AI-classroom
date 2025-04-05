import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { webSocketClient } from '@/lib/websocket';
import { useAuth } from '@/hooks/use-auth';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Mic, MicOff, Search } from 'lucide-react';

type ParticipantsListProps = {
  lectureId: number;
};

interface Participant {
  userId: number;
  user: {
    id: number;
    fullName: string;
    username: string;
    role: string;
  };
  isHost?: boolean;
  isAudioOn?: boolean;
  isVideoOn?: boolean;
}

export default function ParticipantsList({ lectureId }: ParticipantsListProps) {
  const { user } = useAuth();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeParticipantIds, setActiveParticipantIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Get the classroom ID for the lecture
  const { data: lecture } = useQuery({
    queryKey: [`/api/lectures/${lectureId}`],
    enabled: !!lectureId,
  });
  
  // Fetch classroom members
  const { data: classroomMembers, isLoading } = useQuery({
    queryKey: [`/api/classrooms/${lecture?.classroomId}/members`],
    enabled: !!lecture?.classroomId,
  });
  
  // Add the current user as a participant if not already included
  useEffect(() => {
    if (user && lectureId) {
      webSocketClient.on('auth_response', (data) => {
        if (data.success) {
          console.log('Auth successful, joining lecture:', lectureId);
          // Now join the lecture room
          webSocketClient.joinLecture(lectureId);
        }
      });
      
      // Make sure we're authenticated with websocket
      webSocketClient.authenticate(user.id);
    }
  }, [user, lectureId]);
  
  // Handle peers in lecture updates from WebSocket
  useEffect(() => {
    const handlePeersInLecture = (data: { peers: number[] }) => {
      console.log('Received peers_in_lecture with peers:', data.peers);
      // Update active participants
      setActiveParticipantIds(data.peers);
    };
    
    webSocketClient.on('peers_in_lecture', handlePeersInLecture);
    
    // Handle peer joined event
    const handlePeerJoined = (data: { peerId: number }) => {
      console.log('Peer joined:', data.peerId);
      setActiveParticipantIds(prev => {
        if (!prev.includes(data.peerId)) {
          return [...prev, data.peerId];
        }
        return prev;
      });
    };
    
    // Handle peer left event
    const handlePeerLeft = (data: { peerId: number }) => {
      console.log('Peer left:', data.peerId);
      setActiveParticipantIds(prev => prev.filter(id => id !== data.peerId));
    };
    
    webSocketClient.on('peer_joined', handlePeerJoined);
    webSocketClient.on('peer_left', handlePeerLeft);
    
    // Add current user to active participants if not already included
    if (user) {
      setActiveParticipantIds(prev => {
        if (!prev.includes(user.id)) {
          return [...prev, user.id];
        }
        return prev;
      });
    }
    
    return () => {
      webSocketClient.off('peers_in_lecture', handlePeersInLecture);
      webSocketClient.off('peer_joined', handlePeerJoined);
      webSocketClient.off('peer_left', handlePeerLeft);
    };
  }, [user]);
  
  // Update participants when classroom members or active participants change
  useEffect(() => {
    if (classroomMembers && Array.isArray(classroomMembers)) {
      // Map classroom members to participants, marking those who are actively connected
      const updatedParticipants = classroomMembers.map(member => ({
        ...member,
        isAudioOn: activeParticipantIds.includes(member.userId),
        isVideoOn: activeParticipantIds.includes(member.userId),
        isActive: activeParticipantIds.includes(member.userId)
      }));
      
      // Mark teacher as host
      updatedParticipants.forEach(participant => {
        if (participant.user.role === 'teacher') {
          participant.isHost = true;
        }
      });
      
      // Make sure the current user is included
      if (user && !updatedParticipants.some(p => p.userId === user.id)) {
        updatedParticipants.push({
          userId: user.id,
          user: {
            id: user.id,
            fullName: user.fullName || user.username,
            username: user.username,
            role: user.role
          },
          isHost: user.role === 'teacher',
          isAudioOn: true,
          isVideoOn: false,
          isActive: true
        });
      }
      
      setParticipants(updatedParticipants);
    } else if (user) {
      // If no classroom members but we have a user, at least show the current user
      setParticipants([{
        userId: user.id,
        user: {
          id: user.id,
          fullName: user.fullName || user.username,
          username: user.username,
          role: user.role
        },
        isHost: user.role === 'teacher',
        isAudioOn: true,
        isVideoOn: false,
        isActive: true
      }]);
    }
  }, [classroomMembers, activeParticipantIds, user]);
  
  // Filter participants based on search term
  const filteredParticipants = participants.filter(
    participant => participant.user.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Separate hosts/teachers and students
  const hosts = filteredParticipants.filter(p => p.isHost || p.user.role === 'teacher');
  const students = filteredParticipants.filter(p => !p.isHost && p.user.role !== 'teacher');
  
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
          <span className="material-icons text-primary mr-2">groups</span>
          <h3 className="font-medium">Participants ({participants.length})</h3>
        </div>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search participants"
            className="pl-9 h-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      <div className="bg-gray-50 p-4 rounded-md border border-gray-200 h-64 sm:h-80 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : participants.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No participants yet.</p>
          </div>
        ) : (
          <>
            {hosts.length > 0 && (
              <div className="mb-3">
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Host & Co-Hosts
                </h4>
                {hosts.map(participant => (
                  <div 
                    key={participant.userId} 
                    className="flex items-center p-2 hover:bg-gray-100 rounded-md"
                  >
                    <Avatar className="h-8 w-8 mr-3">
                      <AvatarFallback className={getUserColor(participant.userId)}>
                        {getUserInitials(participant.user.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-grow">
                      <div className="flex items-center">
                        <span className="font-medium text-sm">
                          {participant.user.fullName}
                        </span>
                        <span className="ml-2 text-xs bg-primary text-white px-2 py-0.5 rounded-full">
                          Host
                        </span>
                      </div>
                    </div>
                    {participant.isAudioOn ? (
                      <Mic className="h-4 w-4 text-green-500" />
                    ) : (
                      <MicOff className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {students.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Students
                </h4>
                {students.map(participant => (
                  <div 
                    key={participant.userId} 
                    className="flex items-center p-2 hover:bg-gray-100 rounded-md"
                  >
                    <Avatar className="h-8 w-8 mr-3">
                      <AvatarFallback className={getUserColor(participant.userId)}>
                        {getUserInitials(participant.user.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-grow">
                      <span className="font-medium text-sm">
                        {participant.user.fullName}
                      </span>
                    </div>
                    {participant.isAudioOn ? (
                      <Mic className="h-4 w-4 text-green-500" />
                    ) : (
                      <MicOff className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
