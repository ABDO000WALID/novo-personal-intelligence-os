const fs = require('fs');
let code = fs.readFileSync('src/components/layout/AppShell.tsx', 'utf8');

code = code.replace(
  /className="min-h-dvh bg-\[#06070c\]\/95 text-zinc-100 flex flex-row overflow-x-hidden selection:bg-violet-600\/30 selection:text-violet-200 antialiased"/,
  'className="h-[100dvh] w-full bg-[#06070c]/95 text-zinc-100 flex flex-row overflow-hidden selection:bg-violet-600/30 selection:text-violet-200 antialiased"'
);

code = code.replace(
  /className="flex-1 flex flex-col min-w-0 min-h-dvh"/,
  'className="flex-1 flex flex-col min-w-0 h-full overflow-hidden"'
);

code = code.replace(
  /className={\`flex-1 p-4 md:p-6 lg:p-8 \$\{activeRoute === 'chat' \? 'overflow-hidden flex flex-col' : 'overflow-y-auto'\}\`}/,
  'className={`flex-1 p-4 md:p-6 lg:p-8 ${activeRoute === \'chat\' ? \'overflow-hidden flex flex-col min-h-0\' : \'overflow-y-auto min-h-0\'}`}'
);

fs.writeFileSync('src/components/layout/AppShell.tsx', code);
