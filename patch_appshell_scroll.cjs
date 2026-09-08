const fs = require('fs');
let code = fs.readFileSync('src/components/layout/AppShell.tsx', 'utf8');

code = code.replace(
  /className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto"/,
  'className={`flex-1 p-4 md:p-6 lg:p-8 ${activeRoute === \'chat\' ? \'overflow-hidden flex flex-col\' : \'overflow-y-auto\'}`}'
);

fs.writeFileSync('src/components/layout/AppShell.tsx', code);
