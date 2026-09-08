const fs = require('fs');

const code = `import { useState } from 'react';
import { useApp } from '../../core/providers/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useFocus } from './hooks/useFocus';
import {
  Flame,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Clock,
  Trash2,
  Square
} from 'lucide-react';

export function FocusView() {
  const { language } = useApp();
  const isAr = language === 'ar';
  
  const {
    activeState,
    displaySeconds,
    sessions,
    startSession,
    pauseTimer,
    resumeTimer,
    finishSession,
    cancelSession,
    clearSessions,
  } = useFocus();

  const [customHours, setCustomHours] = useState('0');
  const [customMinutes, setCustomMinutes] = useState('30');

  // Format Display Time
  const hours = Math.floor(displaySeconds / 3600);
  const minutes = Math.floor((displaySeconds % 3600) / 60);
  const seconds = displaySeconds % 60;

  const formattedTime = hours > 0 
    ? \`\${String(hours).padStart(2, '0')}:\${String(minutes).padStart(2, '0')}:\${String(seconds).padStart(2, '0')}\`
    : \`\${String(minutes).padStart(2, '0')}:\${String(seconds).padStart(2, '0')}\`;

  let progressPercent = 0;
  if (activeState && activeState.mode !== 'stopwatch' && activeState.durationSeconds > 0) {
    progressPercent = Math.min(100, Math.max(0, ((activeState.durationSeconds - displaySeconds) / activeState.durationSeconds) * 100));
  } else if (activeState && activeState.mode === 'stopwatch') {
    progressPercent = 100; // Solid bar or pulse
  }

  const handleStartCustom = () => {
    const h = parseInt(customHours, 10) || 0;
    const m = parseInt(customMinutes, 10) || 0;
    const totalSeconds = (h * 3600) + (m * 60);
    if (totalSeconds > 0) {
      startSession('custom', totalSeconds);
    }
  };

  // Active Session View
  if (activeState) {
    return (
      <div className="max-w-2xl mx-auto h-full flex flex-col justify-center items-center p-6 space-y-12 min-h-[70vh]">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-950/30 border border-violet-800/40 text-violet-300 text-xs font-medium">
            <span className={\`w-2 h-2 rounded-full \${activeState.status === 'running' ? 'bg-violet-400 animate-pulse' : 'bg-amber-400'}\`} />
            <span>
              {isAr 
                ? (activeState.status === 'running' ? 'جلسة نشطة' : 'متوقفة مؤقتاً') 
                : (activeState.status === 'running' ? 'Active Session' : 'Paused')}
            </span>
          </div>
          
          <div className="relative">
            <h1 className="text-7xl md:text-8xl font-mono font-light text-zinc-100 tracking-tighter">
              {formattedTime}
            </h1>
          </div>
          
          <div className="text-zinc-500 font-medium text-sm">
            {activeState.mode === 'stopwatch' 
              ? (isAr ? 'وضع التركيز المفتوح' : 'Open Focus Mode')
              : (isAr ? 'عد تنازلي' : 'Countdown Timer')}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {activeState.status === 'running' ? (
            <Button onClick={pauseTimer} size="lg" variant="outline" className="w-24 h-16 rounded-2xl flex flex-col gap-1 items-center justify-center bg-zinc-900 border-zinc-700 text-zinc-300 hover:text-white">
              <Pause className="w-5 h-5" />
            </Button>
          ) : (
            <Button onClick={resumeTimer} size="lg" className="w-24 h-16 rounded-2xl flex flex-col gap-1 items-center justify-center bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/50">
              <Play className="w-5 h-5" />
            </Button>
          )}

          <Button onClick={finishSession} size="lg" variant="outline" className="w-24 h-16 rounded-2xl flex flex-col gap-1 items-center justify-center bg-rose-950/40 border-rose-900/50 text-rose-400 hover:bg-rose-900/60 hover:text-rose-200">
            <Square className="w-5 h-5" />
          </Button>
        </div>
        
        <button onClick={cancelSession} className="text-xs text-zinc-600 hover:text-zinc-400 underline decoration-zinc-800 underline-offset-4">
          {isAr ? 'إلغاء الجلسة دون حفظ' : 'Cancel without saving'}
        </button>
      </div>
    );
  }

  // Setup View
  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-zinc-100">
          {isAr ? 'التركيز' : 'Focus'}
        </h1>
        <p className="text-sm text-zinc-400">
          {isAr ? 'اختر وضع التركيز المناسب لمهمتك.' : 'Choose a focus mode for your task.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-7 space-y-6">
          {/* Mode 3: Open Focus */}
          <Card className="p-6 bg-gradient-to-br from-violet-900/20 to-zinc-900/50 border-violet-900/30">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-lg font-medium text-violet-100 flex items-center gap-2">
                  <Flame className="w-5 h-5 text-violet-400" />
                  {isAr ? 'التركيز المفتوح' : 'Open Focus'}
                </h3>
                <p className="text-sm text-zinc-400">
                  {isAr ? 'ابدأ مؤقت تصاعدي دون وقت محدد للانتهاء.' : 'Start an upward stopwatch with no end time.'}
                </p>
              </div>
              <Button onClick={() => startSession('stopwatch')} className="w-full sm:w-auto bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/50">
                <Play className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
                {isAr ? 'ابدأ التركيز الآن' : 'Start Focus Now'}
              </Button>
            </div>
          </Card>

          {/* Mode 1: Quick Presets */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-300 px-1">{isAr ? 'أوقات سريعة' : 'Quick Presets'}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[15, 25, 50, 90].map((mins) => (
                <button
                  key={mins}
                  onClick={() => startSession('preset', mins * 60)}
                  className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800/80 hover:border-violet-500/50 transition-all text-center group flex flex-col items-center justify-center gap-1"
                >
                  <span className="text-xl font-mono text-zinc-200 group-hover:text-violet-300">{mins}</span>
                  <span className="text-xs text-zinc-500">{isAr ? 'دقيقة' : 'min'}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mode 2: Custom Timer */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-300 px-1">{isAr ? 'مؤقت مخصص' : 'Custom Timer'}</h3>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5 flex-1">
                <label className="text-xs text-zinc-500 px-1">{isAr ? 'ساعات' : 'Hours'}</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={customHours}
                  onChange={(e) => setCustomHours(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 font-mono"
                />
              </div>
              <div className="text-xl font-mono text-zinc-600 mb-2">:</div>
              <div className="space-y-1.5 flex-1">
                <label className="text-xs text-zinc-500 px-1">{isAr ? 'دقائق' : 'Minutes'}</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 font-mono"
                />
              </div>
              <Button onClick={handleStartCustom} variant="secondary" className="h-11 px-6 bg-zinc-800 hover:bg-zinc-700 text-zinc-200">
                {isAr ? 'ابدأ' : 'Start'}
              </Button>
            </div>
          </div>
        </div>

        {/* Analytics / History Sidebar */}
        <div className="md:col-span-5 flex flex-col h-[500px]">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-sm font-medium text-zinc-300">
              {isAr ? 'جلسات اليوم' : "Today's Sessions"}
            </h3>
            {sessions.length > 0 && (
              <button
                onClick={clearSessions}
                className="text-xs text-rose-500/80 hover:text-rose-400 flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isAr ? 'مسح' : 'Clear'}</span>
              </button>
            )}
          </div>

          <Card className="flex-1 overflow-hidden flex flex-col bg-zinc-900/30 border-zinc-800/60">
            {sessions.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-3">
                <div className="w-12 h-12 rounded-full bg-zinc-800/50 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-zinc-600" />
                </div>
                <div className="text-sm">
                  {isAr ? 'لا توجد جلسات مكتملة اليوم.' : 'No completed sessions today.'}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-zinc-200">
                          {session.mode === 'stopwatch' 
                            ? (isAr ? 'تركيز مفتوح' : 'Open Focus')
                            : (isAr ? 'مؤقت' : 'Timer')}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          {new Date(session.completedAt).toLocaleTimeString(isAr ? 'ar-SA' : 'en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-mono text-zinc-300">
                      {session.actualDurationSeconds 
                        ? \`\${Math.floor(session.actualDurationSeconds / 60)}m\`
                        : \`\${session.duration}m\`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
`;
fs.writeFileSync('src/modules/focus/FocusView.tsx', code);
