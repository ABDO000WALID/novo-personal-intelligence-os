const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/server\.on\('error', \(err\) => \{\n\s*console\.error\('\[SERVER ERROR\]', err\);\n\s*\}\);\n\s*\/\/\n\s*console\.error\('\[SERVER ERROR\]', err\);\n\s*\}\);/, "server.on('error', (err) => {\n    console.error('[SERVER ERROR]', err);\n  });");

fs.writeFileSync('server.ts', code);
