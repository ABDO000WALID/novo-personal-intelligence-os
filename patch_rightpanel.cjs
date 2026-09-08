const fs = require('fs');
let code = fs.readFileSync('src/components/layout/RightPanel.tsx', 'utf8');

code = code.replace(
  /const \{ timeLeft, isActive, startTimer, pauseTimer, sessions \} = useFocus\(25\);/,
  `const { activeState, displaySeconds, startSession, pauseTimer, resumeTimer, sessions } = useFocus();`
);

code = code.replace(
  /const minutes = Math.floor\(timeLeft \/ 60\);\n\s*const seconds = timeLeft \% 60;\n\s*const formattedTimer = \`\$\{String\(minutes\)\.padStart\(2, '0'\)\}:\$\{String\(seconds\)\.padStart\(2, '0'\)\}\`;/,
  `const hours = Math.floor(displaySeconds / 3600);
  const minutes = Math.floor((displaySeconds % 3600) / 60);
  const seconds = displaySeconds % 60;
  const formattedTimer = hours > 0 
    ? \`\${String(hours).padStart(2, '0')}:\${String(minutes).padStart(2, '0')}:\${String(seconds).padStart(2, '0')}\`
    : \`\${String(minutes).padStart(2, '0')}:\${String(seconds).padStart(2, '0')}\`;`
);

code = code.replace(
  /\{formattedTimer\}\n\s*<\/span>\n\s*<button\n\s*type="button"\n\s*onClick=\{isActive \? pauseTimer : startTimer\}\n\s*className=\{\`w-7 h-7 rounded-full text-white flex items-center justify-center transition-all cursor-pointer \$\{\n\s*isActive\n\s*\? 'bg-amber-600 hover:bg-amber-500'\n\s*: 'bg-violet-600 hover:bg-violet-500'\n\s*\}\`\}\n\s*title=\{isActive \? 'إيقاف' : 'بدء التركيز'\}\n\s*>\n\s*\{isActive \? \(\n\s*<Pause className="w-3 h-3 fill-white" \/>\n\s*\) : \(\n\s*<Play className="w-3 h-3 fill-white translate-x-0\.5" \/>\n\s*\)\}\n\s*<\/button>/,
  `{formattedTimer}
            </span>
            <button
              type="button"
              onClick={() => {
                if (!activeState) {
                  startSession('stopwatch');
                } else if (activeState.status === 'running') {
                  pauseTimer();
                } else {
                  resumeTimer();
                }
              }}
              className={\`w-7 h-7 rounded-full text-white flex items-center justify-center transition-all cursor-pointer \${
                activeState?.status === 'running'
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-violet-600 hover:bg-violet-500'
              }\`}
              title={activeState?.status === 'running' ? 'إيقاف' : 'بدء التركيز'}
            >
              {activeState?.status === 'running' ? (
                <Pause className="w-3 h-3 fill-white" />
              ) : (
                <Play className="w-3 h-3 fill-white translate-x-0.5" />
              )}
            </button>`
);

fs.writeFileSync('src/components/layout/RightPanel.tsx', code);
