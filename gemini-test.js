// Simple script to test the Gemini API and list available models
import { GoogleGenerativeAI } from '@google/generative-ai';

// API key
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("No Gemini API key found. Please set GEMINI_API_KEY");
  process.exit(1);
}

console.log("API key found, testing API...");

// Function to list models
async function listModels() {
  try {
    console.log("Fetching available models...");
    
    // Direct fetch to the API
    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models";
    const response = await fetch(`${apiUrl}?key=${API_KEY}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log("Successfully fetched models");
    console.log(JSON.stringify(data, null, 2));
    
    return data.models;
  } catch (error) {
    console.error("Error listing models:", error);
    return null;
  }
}

// Function to test a model
async function testModel(modelName) {
  try {
    console.log(`Testing model: ${modelName}`);
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    const prompt = "Hello, can you tell me what models are available for the Gemini API?";
    const result = await model.generateContent(prompt);
    const response = result.response;
    console.log(`Response from ${modelName}:`);
    console.log(response.text());
    return true;
  } catch (error) {
    console.error(`Error testing model ${modelName}:`, error);
    return false;
  }
}

async function main() {
  // List available models
  const models = await listModels();
  
  if (models && models.length > 0) {
    console.log("Found models:");
    for (const model of models) {
      console.log(`- ${model.name} (${model.displayName})`);
    }
    
    // Test first model
    if (models[0]) {
      console.log(`\nTesting first model: ${models[0].name}`);
      await testModel(models[0].name);
    }
  } else {
    console.log("No models found or error occurred");
  }
}

main().catch(console.error);