import { useEffect, useState, useRef } from "react";
import { webSocketClient } from "@/lib/websocket";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";

export default function WebSocketTestPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState("Disconnected");
  const [messages, setMessages] = useState<string[]>([]);
  const [testText, setTestText] = useState("This is a test of the note generation system. The human brain processes visual information faster than text. Colors can influence emotions and decision-making. Learning styles vary among individuals. Memory retention improves with repeated exposure to information over time.");
  const [userAuthStatus, setUserAuthStatus] = useState(false);
  const [fakeLectureId, setFakeLectureId] = useState<number>(1);
  
  // Direct Gemini API testing state
  const [directTestPrompt, setDirectTestPrompt] = useState("Summarize the following in bullet points: The sky is blue because of the way atmosphere scatters light.");
  const [selectedModel, setSelectedModel] = useState("models/gemini-1.5-pro-latest");
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

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
    
    // Listen for authentication response
    webSocketClient.on("auth_response", (data) => {
      addMessage(`Authentication response: ${JSON.stringify(data)}`);
      if (data.success) {
        setUserAuthStatus(true);
      } else {
        setUserAuthStatus(false);
      }
    });
    
    // Listen for join lecture response
    webSocketClient.on("join_lecture_response", (data) => {
      addMessage(`Join lecture response: ${JSON.stringify(data)}`);
    });
    
    // Listen for note generation results
    webSocketClient.on("lecture_note", (data) => {
      addMessage(`Lecture note received: ID ${data.id}`);
      
      // Show the note in a more readable format
      const noteContent = data.content;
      const truncatedContent = noteContent.length > 200 
        ? noteContent.substring(0, 200) + "..."
        : noteContent;
      
      addMessage(`Note content: ${truncatedContent}`);
      
      toast({
        title: "Note Generated",
        description: "AI successfully generated a lecture note.",
      });
    });
    
    // Listen for note generation errors
    webSocketClient.on("note_generation_error", (data) => {
      addMessage(`Note generation error: ${JSON.stringify(data)}`);
      
      toast({
        title: "Note Generation Error",
        description: data.details || data.message,
        variant: "destructive",
      });
    });

    // Connect to the WebSocket server
    webSocketClient.connect();

    // Cleanup when component unmounts
    return () => {
      webSocketClient.disconnect();
    };
  }, [toast]);

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

  // New handlers for authentication and testing
  const handleAuthenticate = () => {
    if (!user) {
      toast({
        title: "Authentication Error",
        description: "You need to be logged in to authenticate with WebSocket server",
        variant: "destructive"
      });
      return;
    }
    
    webSocketClient.authenticate(user.id);
    addMessage(`Authentication request sent for user ${user.id}`);
  };
  
  const handleJoinLecture = () => {
    if (!userAuthStatus) {
      toast({
        title: "Not Authenticated",
        description: "You need to authenticate first before joining a lecture",
        variant: "destructive"
      });
      return;
    }
    
    webSocketClient.joinLecture(fakeLectureId);
    addMessage(`Join lecture request sent for lecture ${fakeLectureId}`);
  };
  
  const handleTestTranscription = () => {
    if (!webSocketClient.lectureId) {
      toast({
        title: "Not in a lecture",
        description: "You need to join a lecture first",
        variant: "destructive"
      });
      return;
    }
    
    addMessage(`Sending test transcription: "${testText.substring(0, 50)}..."`);
    webSocketClient.sendTranscription(testText, true);
    
    toast({
      title: "Test Transcription Sent",
      description: "A test transcription has been sent to generate notes.",
    });
  };
  
  // Handler to list available models
  const handleListModels = async () => {
    try {
      setIsLoadingModels(true);
      addMessage("Fetching available Gemini models...");
      
      const response = await apiRequest("GET", "/api/test/gemini/models");
      const result = await response.json();
      
      if (result.success && result.models) {
        // Extract model names and display them
        const modelNames = result.models.map((model: any) => model.name);
        setAvailableModels(modelNames);
        addMessage(`Available models: ${modelNames.join(", ")}`);
        
        toast({
          title: "Models Fetched",
          description: `Found ${modelNames.length} available models`,
        });
      } else {
        addMessage(`Error fetching models: ${result.error || 'Unknown error'}`);
        toast({
          title: "Error Fetching Models",
          description: result.error || "Failed to fetch available models",
          variant: "destructive"
        });
      }
    } catch (error) {
      addMessage(`Error fetching models: ${error instanceof Error ? error.message : String(error)}`);
      toast({
        title: "Error Fetching Models",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoadingModels(false);
    }
  };
  
  // Handler for direct Gemini API testing
  const handleDirectApiTest = async () => {
    if (!directTestPrompt.trim()) {
      toast({
        title: "Empty prompt",
        description: "Please enter a prompt to test",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsTestingApi(true);
      addMessage(`Testing Gemini API directly with model: ${selectedModel}`);
      addMessage(`Prompt: "${directTestPrompt.substring(0, 50)}..."`);
      
      const response = await apiRequest("POST", "/api/test/gemini", {
        prompt: directTestPrompt,
        model: selectedModel
      });
      
      const result = await response.json();
      
      if (result.success) {
        addMessage(`API TEST SUCCESS with model ${result.model}`);
        addMessage(`Response:\n${result.response}`);
      } else {
        addMessage(`API TEST FAILED with model ${result.model}`);
        addMessage(`Error: ${result.error}`);
      }
    } catch (error) {
      addMessage(`Error testing API: ${error instanceof Error ? error.message : String(error)}`);
      toast({
        title: "API Test Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsTestingApi(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">WebSocket Test</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>WebSocket Connection</CardTitle>
          </CardHeader>
          <CardContent>
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
                Ping
              </Button>
            </div>
            
            <div className="flex items-center gap-2 mt-4">
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
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Authentication & Session</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex items-center">
                <div 
                  className={`w-3 h-3 rounded-full mr-2 ${
                    userAuthStatus ? "bg-green-500" : "bg-red-500"
                  }`} 
                />
                <span>Authenticated: {userAuthStatus ? "Yes" : "No"}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button 
                  onClick={handleAuthenticate} 
                  variant="outline"
                  disabled={!user}
                >
                  Authenticate
                </Button>
                
                <div className="text-sm text-muted-foreground">
                  {user ? `Logged in as: ${user.username} (ID: ${user.id})` : 'Not logged in'}
                </div>
              </div>
              
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={fakeLectureId}
                    onChange={(e) => setFakeLectureId(parseInt(e.target.value) || 1)}
                    className="w-20"
                    min="1"
                  />
                  <Button 
                    onClick={handleJoinLecture} 
                    variant="outline"
                    disabled={!userAuthStatus}
                  >
                    Join Lecture
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  Current Lecture ID: {webSocketClient.lectureId || "None"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>WebSocket Gemini AI Test</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <Textarea 
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="Enter test transcription text"
                className="min-h-[100px]"
              />
              <div>
                <Button 
                  onClick={handleTestTranscription}
                  disabled={!webSocketClient.lectureId || testText.trim().length < 10}
                  className="w-full"
                >
                  Send Test Transcription for Note Generation
                </Button>
                <p className="text-sm text-muted-foreground mt-2">
                  This will send the text above to the server, which will process it through Gemini API
                  and return generated lecture notes. Make sure you've authenticated and joined a lecture first.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Direct Gemini API Test</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Test Model:</label>
                  <Button 
                    onClick={handleListModels}
                    disabled={isLoadingModels}
                    variant="outline"
                    size="sm"
                  >
                    {isLoadingModels ? "Loading..." : "List Available Models"}
                  </Button>
                </div>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger>
                    <SelectValue>{selectedModel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.length > 0 ? (
                      availableModels.map((model) => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="models/gemini-1.5-pro-latest">models/gemini-1.5-pro-latest</SelectItem>
                        <SelectItem value="models/gemini-1.5-flash-latest">models/gemini-1.5-flash-latest</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <Textarea 
                value={directTestPrompt}
                onChange={(e) => setDirectTestPrompt(e.target.value)}
                placeholder="Enter prompt to test Gemini API directly"
                className="min-h-[100px]"
              />
              
              <Button 
                onClick={handleDirectApiTest}
                disabled={isTestingApi || directTestPrompt.trim().length < 5}
                className="w-full"
              >
                {isTestingApi ? "Testing..." : "Test Gemini API Directly"}
              </Button>
              
              <p className="text-sm text-muted-foreground mt-2">
                This bypasses the WebSocket and directly tests the Gemini API with different model configurations.
                Use this to diagnose API connectivity issues.
              </p>
            </div>
          </CardContent>
        </Card>
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
                  <li key={index} className="font-mono text-sm whitespace-pre-wrap">
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