import { WebSocketMessage } from "@shared/schema";

// Define WebSocket constants for state checking
const READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

export class WebSocketClient {
  socket: WebSocket | null = null;
  userId: number | null = null;
  lectureId: number | null = null;
  eventListeners: Map<string, ((data: any) => void)[]> = new Map();
  reconnectAttempts = 0;
  maxReconnectAttempts = 5;
  reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  connect() {
    if (this.socket?.readyState === READY_STATE.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log("WebSocket connection established");
      this.reconnectAttempts = 0;
      this.emit("connection", { status: "connected" });
      
      // Authenticate if userId is set
      if (this.userId) {
        this.authenticate(this.userId);
      }
      
      // Rejoin lecture if lectureId is set
      if (this.lectureId) {
        this.joinLecture(this.lectureId);
      }
    };

    this.socket.onmessage = (event) => {
      try {
        console.log("Raw WebSocket message received:", event.data);
        const message = JSON.parse(event.data) as WebSocketMessage;
        console.log("Parsed WebSocket message:", message);
        
        if (message && message.type) {
          console.log(`Emitting event: ${message.type}`);
          this.emit(message.type, message.payload);
        } else {
          console.error("Received WebSocket message with invalid format:", message);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    this.socket.onclose = () => {
      console.log("WebSocket connection closed");
      this.emit("disconnection", { status: "disconnected" });
      
      // Try to reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
        console.log(`Attempting to reconnect in ${delay}ms...`);
        
        this.reconnectTimeout = setTimeout(() => {
          this.connect();
        }, delay);
      }
    };

    this.socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.emit("error", { error });
    };
  }

  authenticate(userId: number) {
    this.userId = userId;
    if (this.socket?.readyState === READY_STATE.OPEN) {
      this.sendMessage({
        type: "auth",
        payload: { userId }
      });
      console.log(`Authentication request sent for user ${userId}`);
    } else {
      console.error("WebSocket not open when trying to authenticate, current state:", this.socket?.readyState);
      // Queue authentication to happen when connection is established
      this.once("connection", () => {
        console.log("Connection established, now authenticating with queued user ID:", userId);
        this.sendMessage({
          type: "auth",
          payload: { userId }
        });
      });
    }
  }

  joinLecture(lectureId: number) {
    this.lectureId = lectureId;
    if (this.socket?.readyState === READY_STATE.OPEN) {
      if (this.userId) {
        this.sendMessage({
          type: "join_lecture",
          payload: { lectureId }
        });
        console.log(`Join lecture request sent for lecture ${lectureId}`);
      } else {
        console.error("Cannot join lecture: User is not authenticated");
        this.emit("error", { 
          message: "Authentication required before joining a lecture" 
        });
      }
    } else {
      console.error("WebSocket not open when trying to join lecture, current state:", this.socket?.readyState);
      // Queue lecture join to happen after connection and authentication
      this.once("auth_response", (data) => {
        if (data.success) {
          console.log("Authentication successful, now joining lecture with queued ID:", lectureId);
          this.sendMessage({
            type: "join_lecture",
            payload: { lectureId }
          });
        }
      });
    }
  }

  leaveLecture() {
    if (this.socket?.readyState === READY_STATE.OPEN && this.lectureId) {
      this.sendMessage({
        type: "leave_lecture",
        payload: { lectureId: this.lectureId }
      });
      this.lectureId = null;
    }
  }

  joinVideo() {
    if (this.socket?.readyState === READY_STATE.OPEN && this.lectureId) {
      this.sendMessage({
        type: "join_video",
        payload: { lectureId: this.lectureId }
      });
    }
  }

  leaveVideo() {
    if (this.socket?.readyState === READY_STATE.OPEN && this.lectureId) {
      this.sendMessage({
        type: "leave_video",
        payload: { lectureId: this.lectureId }
      });
    }
  }

  sendMessage(message: WebSocketMessage) {
    if (this.socket?.readyState === READY_STATE.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.error("WebSocket not connected, message not sent");
    }
  }

  sendSignal(targetUserId: number, data: any) {
    this.sendMessage({
      type: "signal",
      payload: {
        target: targetUserId,
        data
      }
    });
  }

  sendChatMessage(content: string) {
    this.sendMessage({
      type: "chat_message",
      payload: { content }
    });
  }

  sendTranscription(text: string) {
    this.sendMessage({
      type: "transcription",
      payload: { text }
    });
  }

  sendLectureNote(content: string) {
    this.sendMessage({
      type: "lecture_note",
      payload: { content }
    });
  }

  startRecording() {
    this.sendMessage({
      type: "start_recording",
      payload: { timestamp: Date.now() }
    });
  }

  stopRecording() {
    this.sendMessage({
      type: "stop_recording",
      payload: { timestamp: Date.now() }
    });
  }

  sendRecordingData(data: any) {
    this.sendMessage({
      type: "recording_data",
      payload: { data, timestamp: Date.now() }
    });
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)?.push(callback);
  }

  // Listen for an event only once, then automatically remove the listener
  once(event: string, callback: (data: any) => void) {
    const onceCallback = (data: any) => {
      // Remove this listener after it's called
      this.off(event, onceCallback);
      // Call the original callback
      callback(data);
    };
    
    this.on(event, onceCallback);
  }

  off(event: string, callback: (data: any) => void) {
    if (!this.eventListeners.has(event)) return;
    
    const listeners = this.eventListeners.get(event) || [];
    const index = listeners.indexOf(callback);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  private emit(event: string, data: any) {
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in ${event} listener:`, error);
      }
    });
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    
    this.userId = null;
    this.lectureId = null;
    this.reconnectAttempts = 0;
  }
}

export const webSocketClient = new WebSocketClient();
