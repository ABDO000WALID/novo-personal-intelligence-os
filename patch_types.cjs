const fs = require('fs');
let code = fs.readFileSync('src/types/data.ts', 'utf8');

code = code.replace(
  /export interface FocusSession \{\n\s*id: string;\n\s*duration: number; \/\/ duration in minutes\n\s*taskId\?: string; \/\/ Optional relationship to a Task\n\s*goalId\?: string; \/\/ Optional relationship to a Goal\n\s*completedAt: string;\n\}/m,
  `export interface FocusSession {
  id: string;
  duration: number; // duration in minutes (legacy/preset)
  taskId?: string; // Optional relationship to a Task
  goalId?: string; // Optional relationship to a Goal
  completedAt: string;
  // New fields for Phase 8 Analytics
  mode?: 'preset' | 'custom' | 'stopwatch';
  actualDurationSeconds?: number;
  startedAt?: string;
  pausedDurationSeconds?: number;
}`
);

fs.writeFileSync('src/types/data.ts', code);
