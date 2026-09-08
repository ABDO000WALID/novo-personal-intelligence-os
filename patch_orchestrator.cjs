const fs = require('fs');
let code = fs.readFileSync('src/modules/chat/hooks/useChatOrchestrator.ts', 'utf8');

code = code.replace("  isRetrying: boolean;\n", "");
code = code.replace("  const [isRetrying, setIsRetrying] = useState<boolean>(false);\n", "");
code = code.replace(/    setIsRetrying\(false\);\n/g, "");
code = code.replace(/        options: \{\n          onRetry: \(\) => setIsRetrying\(true\),\n        \},\n/g, "");
code = code.replace("    isRetrying,\n", "");

fs.writeFileSync('src/modules/chat/hooks/useChatOrchestrator.ts', code);
