import { useEffect, useState } from "react";
import { webSocketClient } from "@/lib/websocket";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";

export default function WebSocketTestPage() {
  const [status, setStatus] = useState("Disconnected");
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    // Listen for connection events
    webSocketClient.on("connection", () => {
      setStatus("Connected");
      addMessage("Connected to WebSocket server");
    });

    webSocketClient.on("disconnection", () => {
      setStatus("Disconnected");
      addMessage("Disconnected from WebSocket server");
    });

    webSocketClient.on("error", (data) => {
      addMessage(`Error: ${JSON.stringify(data)}`);
    });
    
    webSocketClient.on("pong", (data) => {
      const pingTime = data.serverTime - data.timestamp;
      addMessage(`Received pong! Round-trip time: ${pingTime}ms`);
    });

    // Connect to the WebSocket server
    webSocketClient.connect();

    // Cleanup when component unmounts
    return () => {
      webSocketClient.disconnect();
    };
  }, []);

  const addMessage = (message: string) => {
    setMessages((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const handleConnect = () => {
    webSocketClient.connect();
  };

  const handleDisconnect = () => {
    webSocketClient.disconnect();
    setStatus("Disconnected");
  };

  const handlePing = () => {
    if (webSocketClient.socket?.readyState === 1) { // Using 1 directly as READY_STATE constant is not accessible here
      webSocketClient.sendMessage({
        type: "ping",
        payload: { timestamp: Date.now() }
      });
      addMessage("Sent ping message");
    } else {
      addMessage("Cannot send ping: WebSocket not connected");
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">WebSocket Test</h1>
      
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center">
            <div 
              className={`w-3 h-3 rounded-full mr-2 ${
                status === "Connected" ? "bg-green-500" : "bg-red-500"
              }`} 
            />
            <span>Status: {status}</span>
          </div>
          
          <Button onClick={handleConnect} variant="outline" size="sm">
            Connect
          </Button>
          
          <Button onClick={handleDisconnect} variant="outline" size="sm">
            Disconnect
          </Button>
          
          <Button onClick={handlePing} variant="outline" size="sm">
            Send Ping
          </Button>
        </div>
        
        <div className="flex items-center gap-2 mt-4">
          <p className="text-sm text-muted-foreground">Test Options:</p>
          <Button
            onClick={() => {
              const socket = webSocketClient.socket;
              if (socket) {
                const state = socket.readyState;
                let stateText = "Unknown";
                switch (state) {
                  case 0: stateText = "CONNECTING"; break;
                  case 1: stateText = "OPEN"; break;
                  case 2: stateText = "CLOSING"; break;
                  case 3: stateText = "CLOSED"; break;
                }
                addMessage(`WebSocket state: ${stateText} (${state})`);
              } else {
                addMessage("No WebSocket instance available");
              }
            }}
            variant="outline"
            size="sm"
          >
            Check Socket State
          </Button>
          
          <Button
            onClick={() => {
              try {
                const allData = JSON.stringify({
                  socket: webSocketClient.socket ? "exists" : "null",
                  userId: webSocketClient.userId,
                  lectureId: webSocketClient.lectureId,
                  eventListeners: Array.from(webSocketClient.eventListeners.keys()),
                  reconnectAttempts: webSocketClient.reconnectAttempts
                });
                addMessage(`WebSocketClient state: ${allData}`);
              } catch (err) {
                addMessage(`Error retrieving WebSocketClient state: ${err}`);
              }
            }}
            variant="outline"
            size="sm"
          >
            Check Client State
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] overflow-y-auto border rounded p-4">
            {messages.length === 0 ? (
              <p className="text-muted-foreground">No messages yet</p>
            ) : (
              <ul className="space-y-1">
                {messages.map((msg, index) => (
                  <li key={index} className="font-mono text-sm">
                    {msg}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button
            onClick={() => setMessages([])}
            variant="outline"
            size="sm"
          >
            Clear Messages
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}