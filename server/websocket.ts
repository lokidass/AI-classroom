import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { WebSocketMessage } from "@shared/schema";
import { storage } from "./storage";

interface ConnectedClient {
  ws: WebSocket;
  userId?: number;
  lectureId?: number;
}

export function setupWebSockets(httpServer: HttpServer) {
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: "/ws",
    // Allow all origins since we're running both client and server on the same port
    verifyClient: (info: { origin: string; req: any; secure: boolean }) => {
      console.log("WebSocket connection attempt from origin:", info.origin);
      return true;
    }
  });
  const connectedClients: ConnectedClient[] = [];

  wss.on("connection", (ws) => {
    console.log("WebSocket connection established");
    const client: ConnectedClient = { ws };
    connectedClients.push(client);

    ws.on("message", async (messageData) => {
      try {
        const message: WebSocketMessage = JSON.parse(messageData.toString());
        console.log(`Received message of type: ${message.type}`);

        switch (message.type) {
          case "auth":
            // Authenticate the client
            const { userId } = message.payload;
            
            try {
              // Verify the user exists
              const user = await storage.getUser(userId);
              
              if (user) {
                client.userId = userId;
                
                // Send confirmation
                ws.send(JSON.stringify({
                  type: "auth_response",
                  payload: { success: true, userId }
                }));
                console.log(`User authenticated: ${userId}`);
              } else {
                // User not found
                ws.send(JSON.stringify({
                  type: "auth_response",
                  payload: { success: false, error: "User not found" }
                }));
                console.log(`Authentication failed: User not found for ID ${userId}`);
              }
            } catch (error) {
              console.error("Error during authentication:", error);
              ws.send(JSON.stringify({
                type: "auth_response",
                payload: { success: false, error: "Authentication error" }
              }));
            }
            break;
          
          case "join_lecture":
            // Join a lecture room
            if (!client.userId) {
              ws.send(JSON.stringify({
                type: "join_lecture_response",
                payload: { 
                  success: false, 
                  error: "Not authenticated. Authenticate first before joining a lecture." 
                }
              }));
              console.log("Join lecture failed: Not authenticated");
              break;
            }
            
            const { lectureId } = message.payload;
            
            try {
              // Verify the lecture exists
              const lecture = await storage.getLecture(lectureId);
              
              if (!lecture) {
                ws.send(JSON.stringify({
                  type: "join_lecture_response",
                  payload: { 
                    success: false, 
                    error: "Lecture not found" 
                  }
                }));
                console.log(`Join lecture failed: Lecture not found - ID ${lectureId}`);
                break;
              }
              
              // Verify user access to the lecture
              const isUserInClassroom = await storage.isUserInClassroom(client.userId, lecture.classroomId);
              
              if (!isUserInClassroom) {
                ws.send(JSON.stringify({
                  type: "join_lecture_response",
                  payload: { 
                    success: false, 
                    error: "You don't have access to this lecture" 
                  }
                }));
                console.log(`Join lecture failed: User ${client.userId} does not have access to lecture ${lectureId}`);
                break;
              }
              
              // All checks passed, allow joining the lecture
              client.lectureId = lectureId;
              
              // Send confirmation
              ws.send(JSON.stringify({
                type: "join_lecture_response",
                payload: { 
                  success: true, 
                  lectureId 
                }
              }));
              console.log(`User ${client.userId} joined lecture ${lectureId}`);
              
              // Send existing messages
              const messages = await storage.getMessagesByLecture(lectureId);
              
              // Fetch user details for each message
              const messagesWithUsers = await Promise.all(
                messages.map(async (msg) => {
                  const user = await storage.getUser(msg.userId);
                  if (user) {
                    const { password, ...userWithoutPassword } = user;
                    return {
                      ...msg,
                      user: userWithoutPassword
                    };
                  }
                  return msg;
                })
              );
              
              ws.send(JSON.stringify({
                type: "chat_history",
                payload: { messages: messagesWithUsers }
              }));
              
            } catch (error) {
              console.error("Error joining lecture:", error);
              ws.send(JSON.stringify({
                type: "join_lecture_response",
                payload: { 
                  success: false, 
                  error: "Error joining lecture" 
                }
              }));
            }
            break;
          
          case "leave_lecture":
            client.lectureId = undefined;
            break;
          
          case "chat_message":
            if (!client.userId || !client.lectureId) {
              ws.send(JSON.stringify({
                type: "error",
                payload: { message: "Not authenticated or not in a lecture" }
              }));
              break;
            }
            
            const { content } = message.payload;
            
            // Store the message
            const dbMessage = await storage.createMessage({
              lectureId: client.lectureId,
              userId: client.userId,
              content
            });
            
            // Get user details
            const user = await storage.getUser(client.userId);
            if (!user) break;
            
            const { password, ...userWithoutPassword } = user;
            
            // Broadcast to all clients in the same lecture
            const messageWithUser = {
              ...dbMessage,
              user: userWithoutPassword
            };
            
            broadcastToLecture(client.lectureId, {
              type: "chat_message",
              payload: messageWithUser
            });
            break;
          
          case "signal":
            if (!client.lectureId) {
              ws.send(JSON.stringify({
                type: "error",
                payload: { message: "Not in a lecture" }
              }));
              break;
            }
            
            const { target, data } = message.payload;
            
            // Find the target client
            const targetClient = connectedClients.find(
              c => c.userId === target && c.lectureId === client.lectureId
            );
            
            if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
              targetClient.ws.send(JSON.stringify({
                type: "signal",
                payload: {
                  peer: client.userId,
                  data
                }
              }));
            }
            break;
          
          case "join_video":
            if (!client.userId || !client.lectureId) {
              ws.send(JSON.stringify({
                type: "error",
                payload: { message: "Not authenticated or not in a lecture" }
              }));
              break;
            }
            
            // Notify other clients that a new peer has joined
            broadcastToLecture(client.lectureId, {
              type: "peer_joined",
              payload: { peerId: client.userId }
            }, client);
            
            // Send list of existing peers to the new client
            const peers = connectedClients
              .filter(c => c !== client && c.lectureId === client.lectureId && c.userId)
              .map(c => c.userId);
            
            ws.send(JSON.stringify({
              type: "peers_in_lecture",
              payload: { peers }
            }));
            break;
          
          case "leave_video":
            if (!client.userId || !client.lectureId) break;
            
            // Notify other clients that a peer has left
            broadcastToLecture(client.lectureId, {
              type: "peer_left",
              payload: { peerId: client.userId }
            }, client);
            break;
          
          case "transcription":
            if (!client.userId || !client.lectureId) {
              ws.send(JSON.stringify({
                type: "error",
                payload: { message: "Not authenticated or not in a lecture" }
              }));
              break;
            }
            
            // Broadcast the transcription to all clients in the lecture
            broadcastToLecture(client.lectureId, {
              type: "transcription",
              payload: message.payload
            });
            
            try {
              // Process transcription with AI to generate notes if available
              const { text, isFinal } = message.payload;
              
              if (isFinal && text && text.trim().length > 0) {
                // Import the processTranscription function dynamically to avoid circular dependencies
                const { processTranscription } = await import('./gemini');
                
                // Get existing notes for this lecture to provide context
                const existingNotes = await storage.getLectureNotes(client.lectureId);
                let previousNoteContent = "";
                
                if (existingNotes && existingNotes.length > 0) {
                  // Use the most recent note as context
                  previousNoteContent = existingNotes[existingNotes.length - 1].content;
                }
                
                // Process the transcription with AI
                console.log("Processing transcription with Gemini API...");
                const noteContent = await processTranscription([text], previousNoteContent);
                
                if (noteContent && noteContent !== previousNoteContent) {
                  // Store the generated note
                  const note = await storage.addLectureNote({
                    lectureId: client.lectureId,
                    content: noteContent
                  });
                  
                  // Broadcast the note to all clients in the lecture
                  broadcastToLecture(client.lectureId, {
                    type: "lecture_note",
                    payload: note
                  });
                  
                  console.log("Generated and saved AI notes for lecture:", client.lectureId);
                }
              }
            } catch (error) {
              console.error("Error processing transcription for AI notes:", error);
            }
            
            break;
          
          case "lecture_note":
            if (!client.userId || !client.lectureId) {
              ws.send(JSON.stringify({
                type: "error",
                payload: { message: "Not authenticated or not in a lecture" }
              }));
              break;
            }
            
            // Store the note in the database
            const note = await storage.addLectureNote({
              lectureId: client.lectureId,
              content: message.payload.content
            });
            
            // Broadcast the note to all clients in the lecture
            broadcastToLecture(client.lectureId, {
              type: "lecture_note",
              payload: note
            });
            break;
            
          case "start_recording":
            if (!client.userId || !client.lectureId) {
              ws.send(JSON.stringify({
                type: "error",
                payload: { message: "Not authenticated or not in a lecture" }
              }));
              break;
            }
            
            // Check if the user is the teacher/creator of the lecture
            const lecture = await storage.getLecture(client.lectureId);
            if (!lecture || lecture.createdBy !== client.userId) {
              ws.send(JSON.stringify({
                type: "error",
                payload: { message: "Only the lecture creator can start recording" }
              }));
              break;
            }
            
            // Notify all clients in the lecture that recording has started
            broadcastToLecture(client.lectureId, {
              type: "recording_started",
              payload: { 
                lectureId: client.lectureId,
                startedBy: client.userId,
                timestamp: Date.now()
              }
            });
            break;
            
          case "stop_recording":
            if (!client.userId || !client.lectureId) {
              ws.send(JSON.stringify({
                type: "error",
                payload: { message: "Not authenticated or not in a lecture" }
              }));
              break;
            }
            
            // Check if the user is the teacher/creator of the lecture
            const lectureToStopRecording = await storage.getLecture(client.lectureId);
            if (!lectureToStopRecording || lectureToStopRecording.createdBy !== client.userId) {
              ws.send(JSON.stringify({
                type: "error",
                payload: { message: "Only the lecture creator can stop recording" }
              }));
              break;
            }
            
            // Notify all clients in the lecture that recording has stopped
            broadcastToLecture(client.lectureId, {
              type: "recording_stopped",
              payload: { 
                lectureId: client.lectureId,
                stoppedBy: client.userId,
                timestamp: Date.now()
              }
            });
            break;
            
          case "recording_data":
            if (!client.userId || !client.lectureId) {
              ws.send(JSON.stringify({
                type: "error",
                payload: { message: "Not authenticated or not in a lecture" }
              }));
              break;
            }
            
            // Handle recording data chunks
            // This data would typically be processed and saved for later assembly into a complete recording
            console.log("Received recording data chunk");
            break;
            
          case "ping":
            // Respond to ping with pong
            ws.send(JSON.stringify({
              type: "pong",
              payload: { 
                timestamp: message.payload.timestamp,
                serverTime: Date.now()
              }
            }));
            console.log("Received ping, sent pong response");
            break;
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
        ws.send(JSON.stringify({
          type: "error",
          payload: { message: "Error processing message" }
        }));
      }
    });

    ws.on("close", () => {
      console.log("WebSocket connection closed");
      
      // Notify other clients if this was in a lecture
      if (client.userId && client.lectureId) {
        broadcastToLecture(client.lectureId, {
          type: "peer_left",
          payload: { peerId: client.userId }
        }, client);
      }
      
      // Remove from connected clients
      const index = connectedClients.indexOf(client);
      if (index !== -1) {
        connectedClients.splice(index, 1);
      }
    });
  });

  function broadcastToLecture(lectureId: number, message: WebSocketMessage, exclude?: ConnectedClient) {
    connectedClients.forEach(client => {
      if (client !== exclude && 
          client.lectureId === lectureId && 
          client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }
}
