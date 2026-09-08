import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

async function audit() {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.list();
  const available = [];
  let count = 0;
  for await (const model of response) {
     if (count++ < 3) {
         console.log(model);
     }
     available.push(model.name);
  }
  
  console.log('Total models:', available.length);
}
audit().catch(console.error);
