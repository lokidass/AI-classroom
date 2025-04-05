// Simple test script for the Gemini API
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("No Gemini API key found. Please set GEMINI_API_KEY");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

// Test a simple question with the updated model name
async function testSimpleQuery() {
  try {
    console.log("Testing a simple query with models/gemini-1.5-pro-latest...");
    
    const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-pro-latest" });
    const prompt = "What are three key benefits of virtual learning environments?";
    
    console.log(`Sending prompt: "${prompt}"`);
    const result = await model.generateContent(prompt);
    const response = result.response;
    
    console.log("\n=== RESPONSE ===");
    console.log(response.text());
    console.log("\n=== SUCCESS ===");
    return true;
  } catch (error) {
    console.error("ERROR with simple query:", error.message);
    return false;
  }
}

// Test the quiz generation functionality
async function testQuizGeneration() {
  try {
    console.log("\nTesting quiz generation with models/gemini-1.5-pro-latest...");
    
    const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-pro-latest" });
    const content = "Virtual learning environments enable students to access educational materials remotely, participate in interactive activities, and collaborate with peers and instructors in real-time. Features often include video conferencing, chat functionality, file sharing, and assessment tools. Benefits include flexibility in scheduling, reduced commuting time, and the ability to review recorded sessions.";
    
    // Simplified quiz generation prompt
    const prompt = `
    Create a multiple-choice quiz based on this content: "${content}"
    
    Generate 2 multiple-choice questions with 4 options each.
    For each question, include:
    1. The question
    2. 4 possible answers (labeled as options array with indices 0-3)
    3. The index of the correct answer (as correctOption)
    4. A brief explanation
    
    Format as a JSON array like:
    [
      {
        "question": "What is the question?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctOption": 2,
        "explanation": "Explanation here"
      }
    ]
    
    Return only the JSON array, nothing else.
    `;
    
    console.log("Sending quiz generation prompt...");
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    console.log("\n=== QUIZ RESPONSE ===");
    console.log(responseText);
    
    // Try to parse the JSON
    try {
      const jsonStart = responseText.indexOf('[');
      const jsonEnd = responseText.lastIndexOf(']') + 1;
      
      if (jsonStart === -1 || jsonEnd === 0) {
        throw new Error("No valid JSON array found in the response");
      }
      
      const jsonString = responseText.substring(jsonStart, jsonEnd);
      const quizQuestions = JSON.parse(jsonString);
      
      console.log("\n=== PARSED QUIZ QUESTIONS ===");
      console.log(JSON.stringify(quizQuestions, null, 2));
      console.log("\n=== QUIZ GENERATION SUCCESS ===");
      return true;
    } catch (parseError) {
      console.error("Error parsing quiz response:", parseError);
      return false;
    }
  } catch (error) {
    console.error("ERROR with quiz generation:", error.message);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log("=== GEMINI API TEST SUITE ===\n");
  
  const simpleQuerySuccess = await testSimpleQuery();
  const quizGenerationSuccess = await testQuizGeneration();
  
  console.log("\n=== TEST RESULTS ===");
  console.log(`Simple Query: ${simpleQuerySuccess ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Quiz Generation: ${quizGenerationSuccess ? '✅ PASS' : '❌ FAIL'}`);
  
  if (simpleQuerySuccess && quizGenerationSuccess) {
    console.log("\n🎉 ALL TESTS PASSED! The Gemini API is working correctly with the updated model name.");
  } else {
    console.log("\n❌ SOME TESTS FAILED. Check the error messages above for details.");
  }
}

runAllTests().catch(console.error);