const fs = require('fs');
let code = fs.readFileSync('src/core/ai/geminiServerProvider.ts', 'utf8');

code = code.replace("const maxAttempts = 3;", 
`const requestId = crypto.randomUUID();
    const maxAttempts = 3;`);

code = code.replace("'Content-Type': 'application/json',",
`'Content-Type': 'application/json',
            'x-request-id': requestId,
            'x-attempt': String(attempt),`);

fs.writeFileSync('src/core/ai/geminiServerProvider.ts', code);
