const fs = require('fs');
let code = fs.readFileSync('src/modules/chat/ChatView.tsx', 'utf8');

code = code.replace(
  /className="max-w-5xl mx-auto flex flex-col h-\[calc\(100dvh-8\.5rem\)\] pb-2"/,
  'className="max-w-5xl mx-auto flex flex-col flex-1 h-full min-h-0 w-full pb-2"'
);

fs.writeFileSync('src/modules/chat/ChatView.tsx', code);
