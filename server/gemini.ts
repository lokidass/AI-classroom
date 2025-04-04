import { GoogleGenerativeAI } from "@google/generative-ai";

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

// Function to generate notes from transcription
export async function generateNotesFromTranscription(transcription: string) {
  if (!API_KEY) {
    console.error("No Gemini API key provided. Please set the GEMINI_API_KEY environment variable.");
    return "Error: No Gemini API key provided. Please set the GEMINI_API_KEY environment variable.";
  }

  try {
    // Get the gemini-pro model
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

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
    // Get the gemini-pro model
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

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

    // Get the gemini-pro model
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

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
