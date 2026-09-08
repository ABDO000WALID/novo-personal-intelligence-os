const fs = require('fs');
let code = fs.readFileSync('src/core/ai/aiOrchestrator.ts', 'utf8');
code = code.replace(/public async dispatch\(/g, 'public async orchestrate(');
fs.writeFileSync('src/core/ai/aiOrchestrator.ts', code);
