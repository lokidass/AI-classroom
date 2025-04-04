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
            client.userId = userId;
            
            // Send confirmation
            ws.send(JSON.stringify({
              type: "auth_response",
              payload: { success: true }
            }));
            break;
          
          case "join_lecture":
            // Join a lecture room
            const { lectureId } = message.payload;
            client.lectureId = lectureId;
            
            // Send confirmation
            ws.send(JSON.stringify({
              type: "join_lecture_response",
              payload: { success: true, lectureId }
            }));
            
            // Send existing messages
            if (lectureId) {
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
