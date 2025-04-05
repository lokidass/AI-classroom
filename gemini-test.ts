import 'dotenv/config';
import { testGeminiApi } from './server/gemini';

async function runTests() {
  console.log('== GEMINI API TEST ==');
  console.log('Testing environment variables:');
  console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'Set' : 'Not set');
  console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? 'Set' : 'Not set');
  
  // Try a simple generation
  console.log('\nTesting content generation:');
  const testPrompt = 'Write a short paragraph about education technology.';
  const generationResult = await testGeminiApi(testPrompt);
  console.log('Generation result:', JSON.stringify(generationResult, null, 2));
  
  console.log('\n== TEST COMPLETE ==');
}

runTests().catch(error => {
  console.error('Test failed with error:', error);
});