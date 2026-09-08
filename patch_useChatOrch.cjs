const fs = require('fs');
let code = fs.readFileSync('src/modules/chat/hooks/useChatOrchestrator.ts', 'utf8');

code = code.replace(/setTimeout\(\(\) => \{\n\s*onCommandNavigate\(target\);\n\s*\}, 150\);/g, "onCommandNavigate(target);");
fs.writeFileSync('src/modules/chat/hooks/useChatOrchestrator.ts', code);
