const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace("app.post('/api/ai/chat', async (req, res) => {", 
`app.post('/api/ai/chat', async (req, res) => {
    const requestId = req.headers['x-request-id'] || 'unknown';
    const attempt = req.headers['x-attempt'] || '1';
    console.log(\`[AI REQUEST \${requestId}] Server received Attempt \${attempt}\`);
`);

code = code.replace("const response = await ai.models.generateContent({",
`console.log(\`[AI REQUEST \${requestId}] Calling Gemini API...\`);
      const response = await ai.models.generateContent({`);

code = code.replace("if (!response || !response.text) {",
`console.log(\`[AI REQUEST \${requestId}] Gemini API succeeded.\`);
      if (!response || !response.text) {`);

code = code.replace("console.error('AI Provider Error:', err);",
`console.error(\`[AI REQUEST \${requestId}] Gemini SDK Error:\`, err);`);

fs.writeFileSync('server.ts', code);
