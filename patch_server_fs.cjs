const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

if (!code.includes("import fs from 'fs'")) {
  code = code.replace(
    /import express from 'express';/,
    "import express from 'express';\nimport fs from 'fs';"
  );
  fs.writeFileSync('server.ts', code);
}
