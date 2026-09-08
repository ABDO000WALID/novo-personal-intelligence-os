const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(/new Promise\(resolve => \{/g, "new Promise<void>(resolve => {");
fs.writeFileSync('server.ts', code);
