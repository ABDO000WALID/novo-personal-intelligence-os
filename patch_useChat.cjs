const fs = require('fs');
let code = fs.readFileSync('src/modules/chat/hooks/useChat.ts', 'utf8');

code = code.replace(
  /const syncConversations = useCallback\(\(newConversations: Conversation\[\]\) => \{[\s\S]*?\}, \[\]\);/,
  `const syncConversations = useCallback((updater: Conversation[] | ((prev: Conversation[]) => Conversation[])) => {
    setConversations(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      storageService.setItem(STORAGE_KEYS.CONVERSATIONS, next);
      return next;
    });
  }, []);`
);

fs.writeFileSync('src/modules/chat/hooks/useChat.ts', code);
