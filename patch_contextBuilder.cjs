const fs = require('fs');
let code = fs.readFileSync('src/core/intelligence/contextBuilder.ts', 'utf8');

code = code.replace(
  /: '  \* No tasks scheduled for today';/,
  `: '  * INSUFFICIENT DATA: No tasks exist in the database.';`
);
code = code.replace(
  /: '  \* No active goals';/,
  `: '  * INSUFFICIENT DATA: No goals exist in the database.';`
);
code = code.replace(
  /: '  \* No notes recorded';/,
  `: '  * INSUFFICIENT DATA: No notes exist in the database.';`
);

code = code.replace(
  /return \`You are NOVO[\s\S]*?Workspace State:\$\{groundedContext\}\`;/,
  `return \`You are NOVO, an executive personal intelligence operating system.
You provide thoughtful, concise, and structured guidance in Arabic or English based on the user's current state.

CRITICAL INSTRUCTION:
- You must ONLY use the data provided in the "Current User Workspace State" section below.
- Do NOT fabricate, assume, or make up placeholder statistics (e.g. do not invent numbers for tasks, balances, or goals).
- If a section says "INSUFFICIENT DATA" or has 0 items, you MUST explicitly tell the user that there is no data available for that metric, and encourage them to add some.

Current User Workspace State:
\${groundedContext}\`;`
);

fs.writeFileSync('src/core/intelligence/contextBuilder.ts', code);
