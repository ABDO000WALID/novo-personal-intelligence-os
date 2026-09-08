const fs = require('fs');
let code = fs.readFileSync('src/index.css', 'utf8');
code = code.replace(/@import "tailwindcss";/, '@import "tailwindcss";\n@plugin "@tailwindcss/typography";');
fs.writeFileSync('src/index.css', code);
