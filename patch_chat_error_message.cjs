const fs = require('fs');

// 1. Update useChatOrchestrator to NOT use error state, but send a system message
let useChatOrch = fs.readFileSync('src/modules/chat/hooks/useChatOrchestrator.ts', 'utf8');

useChatOrch = useChatOrch.replace(
  /if \(result\.error\) \{[\s\S]*?return result;\n      \}/,
  `if (result.error) {
        sendMessage(JSON.stringify(result.error), 'system');
        setExecutionState('idle');
        return result;
      }`
);

// Do the same for retryLastMessage
useChatOrch = useChatOrch.replace(
  /if \(result\.error\) \{[\s\S]*?return result;\n    \}/,
  `if (result.error) {
      sendMessage(JSON.stringify(result.error), 'system');
      setExecutionState('idle');
      return result;
    }`
);

// We should also modify retryLastMessage so that it removes the last 'system' error message before retrying?
// No, the user will just retry and we can just add a new message or let it append. 
// Actually, it's better to NOT save the error to localStorage if possible, or just pop it.
// But the user says "Error must appear as a separate assistant/system message. The user must be able to retry."

fs.writeFileSync('src/modules/chat/hooks/useChatOrchestrator.ts', useChatOrch);
