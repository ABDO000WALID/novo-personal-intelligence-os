const fs = require('fs');
let code = fs.readFileSync('src/modules/chat/hooks/useChatOrchestrator.ts', 'utf8');

code = code.replace(/options:\s*\{\s*onRetry:\s*\(\)\s*=>\s*setIsRetrying\(true\),\s*\},/g, "");

fs.writeFileSync('src/modules/chat/hooks/useChatOrchestrator.ts', code);
