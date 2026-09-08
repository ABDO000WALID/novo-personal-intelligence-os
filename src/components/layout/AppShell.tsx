import { useApp } from '../../core/providers/AppContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { RightPanel } from './RightPanel';

// Module View Components
import { HomeView } from '../../modules/home/HomeView';
import { ChatView } from '../../modules/chat/ChatView';
import { PlannerView } from '../../modules/planner/PlannerView';
import { GoalsView } from '../../modules/goals/GoalsView';
import { FocusView } from '../../modules/focus/FocusView';
import { NotesView } from '../../modules/notes/NotesView';
import { KnowledgeView } from '../../modules/knowledge/KnowledgeView';
import { MoneyView } from '../../modules/money/MoneyView';
import { SettingsView } from '../../modules/settings/SettingsView';
import { ErrorBoundary } from '../ErrorBoundary';

export function AppShell() {
  const { activeRoute, language } = useApp();
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  const renderActiveView = () => {
    switch (activeRoute) {
      case 'home':
        return <HomeView />;
      case 'chat':
        return <ChatView />;
      case 'planner':
        return <PlannerView />;
      case 'goals':
        return <GoalsView />;
      case 'focus':
        return <FocusView />;
      case 'notes':
        return <NotesView />;
      case 'knowledge':
        return <KnowledgeView />;
      case 'money':
        return <MoneyView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <HomeView />;
    }
  };

  return (
    <div
      dir={dir}
      lang={language}
      className="h-[100dvh] w-full bg-[#06070c]/95 text-zinc-100 flex flex-row overflow-hidden selection:bg-violet-600/30 selection:text-violet-200 antialiased"
    >
      {/* Primary Navigation Sidebar */}
      <Sidebar />

      {/* Center Main Stage + Header */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header />

        <main
          id="main-content-stage"
          className={`flex-1 p-4 md:p-6 lg:p-8 pb-[max(1rem,env(safe-area-inset-bottom))] ${activeRoute === 'chat' ? 'overflow-hidden flex flex-col min-h-0' : 'overflow-y-auto min-h-0'}`}
        >
          <ErrorBoundary key={activeRoute}>
            {renderActiveView()}
          </ErrorBoundary>
        </main>
      </div>

      {/* Right Context Panel (Desktop) */}
      <RightPanel />
    </div>
  );
}
