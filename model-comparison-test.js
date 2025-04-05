// Script to list all available models and test different model formats
import { GoogleGenerativeAI } from '@google/generative-ai';

// API key
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("No Gemini API key found. Please set GEMINI_API_KEY");
  process.exit(1);
}

console.log("API key found, running model diagnostics...");

// First list all available models
async function listAvailableModels() {
  try {
    console.log("\n=== Listing All Available Models ===\n");
    
    // Since listModels() isn't directly available, we'll make a raw fetch request
    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models";
    const response = await fetch(`${apiUrl}?key=${API_KEY}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log("Available models:");
    
    if (data.models && Array.isArray(data.models)) {
      data.models.forEach(model => {
        console.log(`- ${model.name} (${model.displayName})`);
        if (model.supportedGenerationMethods && model.supportedGenerationMethods.length > 0) {
          console.log(`  Supported methods: ${model.supportedGenerationMethods.join(', ')}`);
        }
      });
    } else {
      console.log("No models data found in response");
    }
    
    return data.models || [];
  } catch (error) {
    console.error("Error listing models:", error);
    return [];
  }
}

// Test models with different formats
async function testModels(availableModels) {
  const modelsToTest = [
    "gemini-pro",                 // Without 'models/' prefix
    "gemini-1.5-pro",             // New model name format
    "models/gemini-pro"           // With 'models/' prefix
  ];
  
  // Add any available models that include "gemini" in their name
  if (availableModels && availableModels.length > 0) {
    availableModels.forEach(model => {
      if (model.name && !modelsToTest.includes(model.name) && 
         (model.name.includes('gemini') || model.displayName.toLowerCase().includes('gemini'))) {
        console.log(`Adding detected model: ${model.name}`);
        modelsToTest.push(model.name);
      }
    });
  }
  
  const prompt = "Hello! Please tell me what capabilities you have.";
  
  for (const modelName of modelsToTest) {
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

async function main() {
  const availableModels = await listAvailableModels();
  await testModels(availableModels);
}

main().catch(console.error);