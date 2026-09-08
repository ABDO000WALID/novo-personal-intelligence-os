import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

async function audit() {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.list();
  const available = [];
  
  for await (const model of response) {
     if (model.supportedGenerationMethods && model.supportedGenerationMethods.includes('generateContent')) {
         if (!model.name.includes('vision') && !model.name.includes('embedding') && !model.name.includes('tts')) {
             available.push({
                 name: model.name.replace('models/', ''),
                 methods: model.supportedGenerationMethods
             });
         }
     }
  }
  
  console.log(JSON.stringify(available, null, 2));
  
  console.log("\n--- SMOKE TEST ---");
  for (const m of available) {
      if (!m.name.includes('flash') && !m.name.includes('pro')) continue; // limit smoke test
      const start = Date.now();
      try {
          const res = await ai.models.generateContent({
              model: m.name,
              contents: 'Reply with exactly: OK'
          });
          console.log(`[${m.name}] HTTP 200 - Latency: ${Date.now() - start}ms - Response: ${res.text?.trim()}`);
      } catch (err) {
          const status = err.status || 'UNKNOWN';
          console.log(`[${m.name}] HTTP ${status} - Latency: ${Date.now() - start}ms - Error: ${err.message.split('\n')[0]}`);
      }
  }
}
audit().catch(console.error);
