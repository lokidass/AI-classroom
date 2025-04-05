import { useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function GeminiTestPage() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTestingModels, setIsTestingModels] = useState(false);
  const [modelResponse, setModelResponse] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);
    setResponse('');

    try {
      // Using our updated model format (models/gemini-1.5-pro-latest)
      const result = await apiRequest("POST", "/api/test/gemini", {
        prompt,
        model: "models/gemini-1.5-pro-latest"
      });

      const data = await result.json();

      if (data.success) {
        setResponse(data.response);
        toast({
          title: "Success",
          description: "Gemini API responded successfully!",
        });
      } else {
        setResponse(`Error: ${data.error}`);
        toast({
          title: "Error",
          description: data.error || "Failed to get response from Gemini API",
          variant: "destructive"
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setResponse(`API Error: ${errorMessage}`);
      toast({
        title: "API Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const listModels = async () => {
    setIsTestingModels(true);
    setModelResponse('');

    try {
      // Request to list available models
      const result = await apiRequest("GET", "/api/test/gemini/models");
      const data = await result.json();

      if (data.success && data.models) {
        // Format model details nicely
        const formattedModels = data.models.map((model: any) => 
          `- ${model.name} (${model.displayName})\n  Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`
        ).join('\n\n');
        
        setModelResponse(`Available Gemini Models:\n\n${formattedModels}`);
        
        toast({
          title: "Success",
          description: `Found ${data.models.length} available models`,
        });
      } else {
        setModelResponse(`Error fetching models: ${data.error || 'Unknown error'}`);
        toast({
          title: "Error",
          description: data.error || "Failed to list models",
          variant: "destructive"
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setModelResponse(`API Error: ${errorMessage}`);
      toast({
        title: "API Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsTestingModels(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Gemini API Test Page</h1>
      <p className="mb-8">
        This page helps verify that our Gemini API integration is working correctly with the latest model format.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Test Query</CardTitle>
            <CardDescription>
              Send a query to the Gemini API using the updated model name (models/gemini-1.5-pro-latest)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter a prompt to send to the Gemini API..."
                className="min-h-[120px]"
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading || !prompt.trim()}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Send to Gemini API'
                )}
              </Button>
            </form>

            {response && (
              <div className="mt-6">
                <h3 className="font-medium mb-2">Response:</h3>
                <div className="p-4 bg-gray-50 rounded-md border whitespace-pre-wrap">
                  {response}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>List Available Models</CardTitle>
            <CardDescription>
              Fetch and display all available Gemini models from the API
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={listModels} 
              disabled={isTestingModels}
              className="mb-4"
            >
              {isTestingModels ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fetching Models...
                </>
              ) : (
                'List Available Models'
              )}
            </Button>

            {modelResponse && (
              <div className="mt-4">
                <div className="p-4 bg-gray-50 rounded-md border overflow-auto max-h-[300px] font-mono text-sm whitespace-pre-wrap">
                  {modelResponse}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}