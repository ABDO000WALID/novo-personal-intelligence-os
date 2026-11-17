import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const surfacePath = path.join(
  root,
  "src/modules/home/components/ProactiveOSSurface.tsx"
);

const homePath = path.join(
  root,
  "src/modules/home/HomeView.tsx"
);

function readRequiredFile(filePath: string): string {
  assert.ok(
    fs.existsSync(filePath),
    "Required file is missing: " + path.relative(root, filePath)
  );
  return fs.readFileSync(filePath, "utf8");
}

let passed = 0;

function check(description: string, condition: boolean): void {
  assert.ok(condition, "FAIL: " + description);
  passed += 1;
  console.log("PASS: " + description);
}

const surface = readRequiredFile(surfacePath);
const home = readRequiredFile(homePath);

// 1. Component contract
check("ProactiveOSSurface exists and is exported", /export\s+default\s+function\s+ProactiveOSSurface/.test(surface));
check("Surface consumes useIntelligence", /useIntelligence/.test(surface));
check("Surface reads canonical context through getContext", /getContext\s*\(\s*\)/.test(surface));

// 2. Canonical intelligence fields
for (const field of ["briefing", "attentionRadar", "nextAction", "goalPacing", "insights"]) {
  check("Surface consumes canonical field: " + field, new RegExp("context\\." + field + "\\b").test(surface));
}

// 3. Read-only intelligence boundary
check("Surface does not directly import an intelligence engine", !/from\s+["'][^"']*(?:Engine|engine)["']/.test(surface));
check("Surface does not evaluate workspace intelligence directly", !/\bevaluateWorkspaceIntelligence\s*\(/.test(surface));
check("Surface does not calculate next action directly", !/\bdetermineNextAction\s*\(/.test(surface));
check("Surface does not evaluate attention radar directly", !/\bevaluateAttentionRadar\s*\(/.test(surface));
check("Surface does not calculate goal pacing directly", !/\bcalculateGoalPacing\s*\(/.test(surface));

// 4. No Phase 4 mutations
check("Surface does not write to Firebase", !/\b(?:addDoc|setDoc|updateDoc|deleteDoc|writeBatch)\s*\(/.test(surface));
check("Surface does not contain obvious Zustand/store mutations", !/\b(?:setState|setTasks|setGoals|updateTask|updateGoal|addTask|addGoal|deleteTask|deleteGoal)\s*\(/.test(surface));

// 5. UI contract (Fixed to match actual prop names)
check("Surface has a stable root test id", /data-testid="proactive-os-surface"/.test(surface));
check("Briefing section exists", /testId="briefing-section"/.test(surface));
check("Attention Radar section exists", /testId="attention-radar-section"/.test(surface));
check("Next Action section exists", /testId="next-action-section"/.test(surface));
check("Goal Pacing section exists", /testId="goal-pacing-section"/.test(surface));
check("Insights section exists", /testId="insights-section"/.test(surface));
check("Surface explicitly supports RTL", /dir="rtl"/.test(surface));

// 6. Home integration
check("HomeView imports ProactiveOSSurface", /import\s+ProactiveOSSurface\s+from\s+["']\.\/components\/ProactiveOSSurface["']/.test(home));
check("HomeView renders ProactiveOSSurface", /<ProactiveOSSurface\s*\/>/.test(home));

console.log("\nGATE 22 PHASE 3: " + passed + "/" + passed + " assertions passed.");