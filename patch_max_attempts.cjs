const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Replace the maxAttempts calculation
code = code.replace(
  /const maxAttempts = Math\.min\(3, modelsToTry\.length\);/,
  "const maxAttempts = Math.min(6, modelsToTry.length);"
);

fs.writeFileSync('server.ts', code);
