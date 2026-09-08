const fs = require('fs');
let code = fs.readFileSync('src/components/layout/AppShell.tsx', 'utf8');

code = code.replace(
  /className=\{\`flex-1 p-4 md:p-6 lg:p-8 \$\{activeRoute === 'chat' \? 'overflow-hidden flex flex-col min-h-0' : 'overflow-y-auto min-h-0'\}\`\}/,
  'className={`flex-1 p-4 md:p-6 lg:p-8 pb-[max(1rem,env(safe-area-inset-bottom))] ${activeRoute === \'chat\' ? \'overflow-hidden flex flex-col min-h-0\' : \'overflow-y-auto min-h-0\'}`}'
);

fs.writeFileSync('src/components/layout/AppShell.tsx', code);
