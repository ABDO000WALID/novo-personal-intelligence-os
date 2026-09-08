const fs = require('fs');

let useChatOrch = fs.readFileSync('src/modules/chat/hooks/useChatOrchestrator.ts', 'utf8');

useChatOrch = useChatOrch.replace(
  /if \(result\.error\) \{\n\s*setExecutionState\('error'\);\n\s*setError\(result\.error\);\n\s*return result;\n\s*\}/g,
  `if (result.error) {
      sendMessage(JSON.stringify(result.error), 'system');
      setExecutionState('idle');
      return result;
    }`
);

fs.writeFileSync('src/modules/chat/hooks/useChatOrchestrator.ts', useChatOrch);
