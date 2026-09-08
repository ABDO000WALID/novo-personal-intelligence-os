const fs = require('fs');
let code = fs.readFileSync('src/modules/chat/ChatView.tsx', 'utf8');
code = code.replace(/h-\[calc\(100vh-8\.5rem\)\]/g, 'h-[calc(100dvh-8.5rem)]');
fs.writeFileSync('src/modules/chat/ChatView.tsx', code);
