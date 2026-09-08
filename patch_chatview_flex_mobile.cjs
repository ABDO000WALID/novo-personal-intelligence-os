const fs = require('fs');
let chatView = fs.readFileSync('src/modules/chat/ChatView.tsx', 'utf8');

chatView = chatView.replace(
  /<div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 min-h-0">/,
  '<div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">'
);

chatView = chatView.replace(
  /<div className="md:col-span-4 lg:col-span-3 flex flex-col gap-2 border-b md:border-b-0 md:border-e border-zinc-800\/80 pe-0 md:pe-3 overflow-y-auto max-h-\[160px\] md:max-h-full">/,
  '<div className="w-full md:w-64 lg:w-72 flex flex-col gap-2 border-b md:border-b-0 md:border-e border-zinc-800/80 pe-0 md:pe-3 overflow-y-auto shrink-0 max-h-[140px] md:max-h-full">'
);

chatView = chatView.replace(
  /<div className="md:col-span-8 lg:col-span-9 flex flex-col min-h-0">/,
  '<div className="flex-1 flex flex-col min-h-0 min-w-0">'
);

fs.writeFileSync('src/modules/chat/ChatView.tsx', chatView);
