// Script to test both model formats (with/without 'models/' prefix)
import { GoogleGenerativeAI } from '@google/generative-ai';

// API key
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("No Gemini API key found. Please set GEMINI_API_KEY");
  process.exit(1);
}

console.log("API key found, running comparative tests...");

// Test models with different formats
async function testModels() {
  const models = [
    "gemini-pro",                  // Without 'models/' prefix
    "models/gemini-1.5-pro-latest" // With 'models/' prefix
  ];
  
  const prompt = "Hello! Please tell me what capabilities you have.";
  
  for (const modelName of models) {
    try {
      console.log(`\n=== Testing model: ${modelName} ===`);
      
      const genAI = new GoogleGenerativeAI(API_KEY);
      const model = genAI.getGenerativeModel({ model: modelName });
      
      console.log(`Sending prompt to ${modelName}...`);
      const result = await model.generateContent(prompt);
      const response = result.response;
      
      console.log(`✅ SUCCESS: ${modelName} responded correctly`);
      console.log("First 100 characters of response:");
      console.log(response.text().substring(0, 100) + "...");
    } catch (error) {
      console.error(`❌ ERROR with ${modelName}:`, error.message);
    }
  }
}

testModels().catch(console.error);