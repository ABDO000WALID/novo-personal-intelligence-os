import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

async function audit() {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.list();
  const available = [];
  
  for await (const model of response) {
     if (model.supportedActions && model.supportedActions.includes('generateContent')) {
         const name = model.name.replace('models/', '');
         if (
             !name.includes('vision') && 
             !name.includes('embedding') && 
             !name.includes('tts') &&
             !name.includes('8b') && // ignoring smaller ones for NOVO if not explicitly needed, but let's keep it simple
             (name.includes('flash') || name.includes('pro'))
         ) {
             available.push(name);
         }
     }
  }
  
  console.log("Eligible models:", available);
  
  console.log("\n--- SMOKE TEST ---");
  for (const m of available) {
      const start = Date.now();
      try {
          const res = await ai.models.generateContent({
              model: m,
              contents: 'Reply with exactly: OK',
              config: {
                temperature: 0.1
              }
          });
          console.log(`[${m}] HTTP 200 - Latency: ${Date.now() - start}ms - Response: ${res.text?.trim()}`);
      } catch (err) {
          const status = err.status || 'UNKNOWN';
          console.log(`[${m}] HTTP ${status} - Latency: ${Date.now() - start}ms - Error: ${err.message.split('\n')[0]}`);
      }
  }
}
audit().catch(console.error);
