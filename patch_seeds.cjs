const fs = require('fs');
let code = fs.readFileSync('src/core/storage/storageService.ts', 'utf8');

code = code.replace(
  /export const INITIAL_SEEDS = \{[\s\S]*?\};/,
  `export const INITIAL_SEEDS = {
  notes: (): Note[] => [],
  goals: (): Goal[] => [],
  tasks: (): Task[] => [],
  focusSessions: (): FocusSession[] => [],
  transactions: (): Transaction[] => [],
  conversations: (): Conversation[] => [],
  knowledge: (): KnowledgeItem[] => []
};`
);

fs.writeFileSync('src/core/storage/storageService.ts', code);
