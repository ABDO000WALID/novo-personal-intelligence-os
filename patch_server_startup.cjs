const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /const distPath = path\.join\(process\.cwd\(\), 'dist'\);/,
  `const distPath = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      console.error('[SERVER ERROR] Production build not found. Missing dist/index.html. Did you run npm run build?');
      process.exit(1);
    }`
);

fs.writeFileSync('server.ts', code);
