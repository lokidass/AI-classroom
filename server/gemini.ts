import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Note on Gemini API versions:
 * The Google Generative AI package defaults to using v1beta API version.
 * With this version, we need to use the correct model name format
 * compatible with the v1beta API.
 * 
 * Important: Model names must include the 'models/' prefix. For example:
 * - "models/gemini-1.5-pro-latest" (recommended)
 * - "models/gemini-1.5-flash-latest" (faster, less powerful)
 * 
 * Based on our testing, "models/gemini-1.5-pro-latest" works correctly with the v1beta API.
 */

// Initialize the Generative AI API with the API key
const API_KEY = process.env.GEMINI_API_KEY || "";
if (!API_KEY) {
  console.error("=== GEMINI API KEY MISSING ===");
  console.error("Please set the GEMINI_API_KEY environment variable");
  console.error("This is required for note generation functionality");
  console.error("=====================================");
} else {
  console.log("Gemini API key is available");
}

const genAI = new GoogleGenerativeAI(API_KEY);

// The correct model name to use with the v1beta API version - must include 'models/' prefix
const MODEL_NAME = "models/gemini-1.5-pro-latest";

// Function to generate notes from transcription
export async function generateNotesFromTranscription(transcription: string) {
  if (!API_KEY) {
    console.error("No Gemini API key provided. Please set the GEMINI_API_KEY environment variable.");
    return "Error: No Gemini API key provided. Please set the GEMINI_API_KEY environment variable.";
  }

  try {
    // Get the appropriate gemini model
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Prepare the prompt for note generation
    const prompt = `
    Please summarize the following lecture transcription into clear, organized lecture notes. 
    
    Format the notes with:
    - A clear title based on the content
    - Main topics with bold headings
    - Bullet points for key facts
    - Numbered lists for sequential information
    - Include important definitions, concepts and examples
    
    Here is the transcription:
    "${transcription}"
    
    Generate concise, well-structured notes that would be helpful for studying.
    `;

    // Generate the response
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  } catch (error) {
    console.error("Error generating notes with Gemini API:", error);
    // More detailed error information for debugging
    const errorMessage = error instanceof Error 
      ? `Error: ${error.name}: ${error.message}` 
      : "Unknown error occurred";
    console.error("Detailed error:", errorMessage);
    
    return "Error generating notes. Please try again later.";
  }
}

// Function to answer a question using AI
export async function answerQuestion(question: string, lectureContext?: string) {
  if (!API_KEY) {
    console.error("No Gemini API key provided. Please set the GEMINI_API_KEY environment variable.");
    return "Error: No Gemini API key provided. Please set the GEMINI_API_KEY environment variable.";
  }

  try {
    // Get the appropriate gemini model
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Prepare the prompt based on whether lecture context is provided
    let prompt = "";
    if (lectureContext) {
      prompt = `
      You are an AI learning assistant for a virtual classroom. A student has asked a question related to the lecture. Please provide a clear, educational answer.
      
      The lecture content is:
      "${lectureContext}"
      
      The student's question is:
      "${question}"
      
      Please provide a helpful answer based on the lecture content. If the question isn't directly addressed in the lecture, provide general educational information on the topic. If you can't answer the question, please say so politely.
      `;
    } else {
      prompt = `
      You are an AI learning assistant for a virtual classroom. A student has asked a question. Please provide a clear, educational answer.
      
      Question: "${question}"
      
      Please provide a helpful, educational response. If you can't answer the question, please say so politely.
      `;
    }

    // Generate the response
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  } catch (error) {
    console.error("Error answering question with Gemini API:", error);
    // More detailed error information for debugging
    const errorMessage = error instanceof Error 
      ? `Error: ${error.name}: ${error.message}` 
      : "Unknown error occurred";
    console.error("Detailed error:", errorMessage);
    
    return "I'm sorry, I'm having trouble processing your question right now. Please try again later.";
  }
}

// Function to process transcription segments and extract meaningful content
// Function to list available models
export async function listAvailableModels() {
  if (!API_KEY) {
    console.error("No Gemini API key provided. Please set the GEMINI_API_KEY environment variable.");
    return "Error: No Gemini API key provided. Please set the GEMINI_API_KEY environment variable.";
  }

  try {
    console.log("Fetching available models...");
    
    // Since listModels() isn't directly available, we'll make a raw fetch request
    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models";
    const response = await fetch(`${apiUrl}?key=${API_KEY}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log("Successfully fetched models");
    
    return {
      success: true,
      models: data.models
    };
  } catch (error) {
    console.error("Error listing models:", error);
    const errorMessage = error instanceof Error 
      ? `Error: ${error.name}: ${error.message}` 
      : "Unknown error occurred";
    console.error("Detailed error:", errorMessage);
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

// Test function to diagnose API issues with different model configurations
export async function testGeminiApi(prompt: string, modelName?: string) {
  if (!API_KEY) {
    console.error("No Gemini API key provided. Please set the GEMINI_API_KEY environment variable.");
    return "Error: No Gemini API key provided. Please set the GEMINI_API_KEY environment variable.";
  }

  try {
    // Use provided model name or default to our model name constant
    const modelToUse = modelName || MODEL_NAME;
    console.log(`Testing Gemini API with model: ${modelToUse}`);
    
    const model = genAI.getGenerativeModel({ model: modelToUse });
    
    // Generate the response
    console.log(`Sending test prompt: "${prompt.substring(0, 50)}..."`);
    const result = await model.generateContent(prompt);
    const response = result.response;
    console.log("Successfully received response from Gemini API");
    return {
      success: true,
      model: modelToUse,
      response: response.text()
    };
  } catch (error) {
    console.error(`Error testing Gemini API with model ${modelName || MODEL_NAME}:`, error);
    // More detailed error information for debugging
    const errorMessage = error instanceof Error 
      ? `Error: ${error.name}: ${error.message}` 
      : "Unknown error occurred";
    console.error("Detailed error:", errorMessage);
    
    return {
      success: false,
      model: modelName || MODEL_NAME,
      error: errorMessage
    };
  }
}

export async function processTranscription(transcriptionSegments: string[], previousNotes?: string) {
  if (!API_KEY) {
    console.error("No Gemini API key provided. Please set the GEMINI_API_KEY environment variable.");
    return "Error: No Gemini API key provided. Please set the GEMINI_API_KEY environment variable.";
  }

  try {
    // Combine segments into a single transcription
    const transcription = transcriptionSegments.join(" ");
    if (transcription.trim().length < 10) {
      return previousNotes || "Waiting for more content to generate notes...";
    }

    // Get the appropriate gemini model
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Prepare the prompt based on whether previous notes exist
    let prompt = "";
    if (previousNotes) {
      prompt = `
      You are an AI note-taking assistant for a virtual classroom. You have previously generated these notes:
      
      ${previousNotes}
      
      Now, I have new transcription segments from the ongoing lecture:
      "${transcription}"
      
      Please update and enhance the notes with this new information. Maintain the same organized structure, but add new sections or bullet points as needed. Don't repeat information that's already in the notes.
      `;
    } else {
      prompt = `
      Please create organized lecture notes from this transcription segment:
      "${transcription}"
      
      Format the notes with:
      - A clear title based on the content
      - Main topics with bold headings
      - Bullet points for key facts
      - Include important definitions and concepts
      
      The notes should be well-structured and educational.
      `;
    }

    // Generate the response
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  } catch (error) {
    console.error("Error processing transcription with Gemini API:", error);
    // More detailed error information for debugging
    const errorMessage = error instanceof Error 
      ? `Error: ${error.name}: ${error.message}` 
      : "Unknown error occurred";
    console.error("Detailed error:", errorMessage);
    
    // Return the previous notes if they exist, otherwise return an error message
    return previousNotes || "Error generating notes. Please try again later.";
  }
}

// Function to generate a multiple-choice quiz from educational content
export async function generateQuizFromContent(content: string, numQuestions: number = 10) {
  if (!API_KEY) {
    console.error("No Gemini API key provided. Please set the GEMINI_API_KEY environment variable.");
    return {
      success: false,
      error: "Error: No Gemini API key provided. Please set the GEMINI_API_KEY environment variable."
    };
  }

  try {
    // Get the appropriate Gemini model
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Prepare the prompt for quiz generation
    const prompt = `
    You are an educational quiz creator. Create a multiple-choice quiz based on the following content.
    
    Content:
    "${content}"
    
    Please generate exactly ${numQuestions} multiple-choice questions with 4 options each.
    
    For each question:
    1. Include a clear question that tests understanding of a key concept
    2. Provide 4 possible answers labeled 0, 1, 2, and 3 (NOT A, B, C, D)
    3. In the correctOption field, put the INDEX (0, 1, 2, or 3) of the correct answer
    4. Include a brief explanation of why the answer is correct
    
    Format your response as a valid JSON array with the following structure:
    [
      {
        "question": "What is the capital of France?",
        "options": ["New York", "London", "Paris", "Berlin"],
        "correctOption": 2,
        "explanation": "Paris is the capital city of France."
      },
      {
        "question": "...",
        "options": ["...", "...", "...", "..."],
        "correctOption": 0,
        "explanation": "..."
      }
    ]
    
    Ensure that:
    - All questions are relevant to the provided content
    - Questions test different aspects of the content
    - Questions vary in difficulty
    - All JSON formatting is correct
    - Exactly 4 options are provided for each question
    - The correctOption is the INDEX (0-3) of the correct answer in the options array
    
    Don't include any additional text before or after the JSON array.
    `;

    // Generate the response
    console.log("Sending quiz generation prompt to Gemini API...");
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    try {
      // Parse the JSON response
      const jsonStart = responseText.indexOf('[');
      const jsonEnd = responseText.lastIndexOf(']') + 1;
      
      if (jsonStart === -1 || jsonEnd === 0) {
        throw new Error("No valid JSON array found in the response");
      }
      
      const jsonString = responseText.substring(jsonStart, jsonEnd);
      let quizQuestions = JSON.parse(jsonString);
      
      // Validate the structure
      if (!Array.isArray(quizQuestions) || quizQuestions.length === 0) {
        throw new Error("Invalid quiz questions format");
      }
      
      // Normalize the questions to match our schema and ensure correctOption is a number
      quizQuestions = quizQuestions.map(q => {
        // Check for questionText vs question property
        const question = q.question || q.questionText;
        
        // Ensure correctOption is a number between 0-3
        let correctOption = q.correctOption;
        
        // Handle cases where correctOption might be a string with the correct answer
        if (typeof correctOption === 'string') {
          // Try to parse as number first
          const parsedOption = parseInt(correctOption);
          if (!isNaN(parsedOption) && parsedOption >= 0 && parsedOption <= 3) {
            correctOption = parsedOption;
          } else {
            // If it's not a valid number, find the index of the correct answer in options
            const optionIndex = q.options.findIndex(
              (opt: string) => opt.toLowerCase() === correctOption.toLowerCase()
            );
            correctOption = optionIndex >= 0 ? optionIndex : 0;
          }
        }
        
        // Ensure options is an array with exactly 4 items
        const options = Array.isArray(q.options) && q.options.length === 4 
          ? q.options 
          : ["Option 1", "Option 2", "Option 3", "Option 4"];
        
        return {
          question,
          options,
          correctOption: Number(correctOption),
          explanation: q.explanation || null
        };
      });
      
      console.log(`Successfully generated ${quizQuestions.length} quiz questions`);
      return {
        success: true,
        questions: quizQuestions
      };
    } catch (parseError) {
      console.error("Error parsing quiz questions:", parseError);
      return {
        success: false,
        error: "Failed to parse the generated quiz. The AI response was not in the expected format.",
        rawResponse: responseText
      };
    }
  } catch (error) {
    console.error("Error generating quiz with Gemini API:", error);
    // More detailed error information for debugging
    const errorMessage = error instanceof Error 
      ? `Error: ${error.name}: ${error.message}` 
      : "Unknown error occurred";
    console.error("Detailed error:", errorMessage);
    
    return {
      success: false,
      error: "Error generating quiz. Please try again later."
    };
  }
}
