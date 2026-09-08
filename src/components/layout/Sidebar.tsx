import { ElementType } from 'react';
import { useApp } from '../../core/providers/AppContext';
import { NAVIGATION_ITEMS } from '../../core/navigation/navigationConfig';
import { RouteId } from '../../types/navigation';
import {
  LayoutDashboard,
  Bot,
  CalendarDays,
  Target,
  Flame,
  FileText,
  Database,
  Wallet,
  Settings,
  Plus,
  X,
  Languages,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Radio,
  User,
  Mic,
} from 'lucide-react';

const ICON_MAP: Record<string, ElementType> = {
  LayoutDashboard,
  Bot,
  CalendarDays,
  Target,
  Flame,
  FileText,
  Database,
  Wallet,
  Settings,
};

export function Sidebar() {
  const {
    activeRoute,
    setActiveRoute,
    language,
    setLanguage,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    createNewChat,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
  } = useApp();

  const isAr = language === 'ar';
  const CollapseIcon = isAr
    ? isSidebarCollapsed ? ChevronLeft : ChevronRight
    : isSidebarCollapsed ? ChevronRight : ChevronLeft;

  const toggleLanguage = () => {
    setLanguage(language === 'ar' ? 'en' : 'ar');
  };

  const recentChats = [
    {
      id: 'rc-1',
      titleAr: 'مساعدتي في التخطيط اليومي',
      titleEn: 'Daily planning assistance',
      time: '10:45 AM',
    },
    {
      id: 'rc-2',
      titleAr: 'صياغة ودراسة موضوع جديد',
      titleEn: 'Study & knowledge synthesis',
      time: 'أمس',
    },
    {
      id: 'rc-3',
      titleAr: 'أفكار لمشروع تقني ذكي',
      titleEn: 'AI project ideation',
      time: '3 سبت',
    },
    {
      id: 'rc-4',
      titleAr: 'تطوير العادات والإنتاجية',
      titleEn: 'Habit & focus tracking',
      time: '28 آب',
    },
  ];

  const renderNavGroup = (category: string, titleAr: string, titleEn: string) => {
    const items = NAVIGATION_ITEMS.filter((item) => item.category === category);
    if (items.length === 0) return null;

    return (
      <div key={category} className="space-y-0.5 py-1">
        {!isSidebarCollapsed && (
          <div className="px-3 py-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase select-none">
            {isAr ? titleAr : titleEn}
          </div>
        )}
        {items.map((item) => {
          const IconComponent = ICON_MAP[item.iconName] || LayoutDashboard;
          const isActive = activeRoute === item.id;

          return (
            <button
              key={item.id}
              id={`nav-link-${item.id}`}
              type="button"
              onClick={() => {
                setActiveRoute(item.id as RouteId);
                setIsMobileMenuOpen(false);
              }}
              title={isAr ? item.labelAr : item.labelEn}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-150 cursor-pointer select-none relative ${
                isActive
                  ? 'bg-violet-950/35 text-violet-200 border border-violet-800/40 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 border border-transparent font-normal'
              } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
            >
              {isActive && (
                <span
                  className={`absolute top-1.5 bottom-1.5 w-0.5 rounded-full bg-violet-400 ${
                    isAr ? 'right-0' : 'left-0'
                  }`}
                />
              )}

              <IconComponent
                className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                  isActive ? 'text-violet-300' : 'text-zinc-500 group-hover:text-zinc-400'
                }`}
              />

              {!isSidebarCollapsed && (
                <span className="truncate flex-1 text-start">
                  {isAr ? item.labelAr : item.labelEn}
                </span>
              )}

              {!isSidebarCollapsed && item.badge && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-violet-950/50 text-violet-300 border border-violet-800/40 font-mono">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          id="sidebar-mobile-backdrop"
          className="fixed inset-0 z-40 bg-black/75 backdrop-blur-xs md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        id="app-sidebar"
        className={`fixed md:sticky top-0 z-50 h-screen bg-[#07080f]/95 border-e border-zinc-800/60 flex flex-col transition-all duration-200 ease-in-out ${
          isSidebarCollapsed ? 'w-16' : 'w-60'
        } ${
          isMobileMenuOpen
            ? 'translate-x-0'
            : isAr
            ? 'translate-x-full md:translate-x-0'
            : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Logo & Header */}
        <div className="h-14 px-3.5 flex items-center justify-between border-b border-zinc-800/60 shrink-0">
          <div
            onClick={() => setActiveRoute('home')}
            className="flex items-center gap-2.5 cursor-pointer select-none group"
          >
            {/* Luminous Emblem */}
            <div className="relative">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-violet-950/60 border border-violet-400/30 group-hover:scale-105 transition-transform duration-200">
                <Sparkles className="w-3.5 h-3.5 text-violet-100" />
              </div>
            </div>

            {!isSidebarCollapsed && (
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold tracking-tight text-white group-hover:text-violet-200 transition-colors">
                    NOVO
                  </span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-violet-950/60 text-violet-300 border border-violet-800/40 font-mono">
                    AI
                  </span>
                </div>
                <span className="text-[9px] text-zinc-500 -mt-0.5">
                  {isAr ? 'مساعدك الشخصي الذكي' : 'Personal AI Workspace'}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop Collapse Toggle */}
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className="hidden md:flex p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60 transition-colors cursor-pointer"
              title={isAr ? 'طي القائمة' : 'Toggle Sidebar'}
            >
              <CollapseIcon className="w-3.5 h-3.5" />
            </button>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Button: New Chat */}
        <div className="p-2.5 shrink-0">
          <button
            id="sidebar-new-chat-btn"
            type="button"
            onClick={() => {
              createNewChat();
              setIsMobileMenuOpen(false);
            }}
            className={`w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-700 hover:from-violet-500 hover:to-indigo-500 active:scale-[0.98] border border-violet-400/30 text-white text-xs font-medium shadow-sm shadow-violet-950/50 transition-all cursor-pointer ${
              isSidebarCollapsed ? 'px-2' : ''
            }`}
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            {!isSidebarCollapsed && (
              <span className="truncate">
                {isAr ? 'محادثة جديدة' : 'New Chat'}
              </span>
            )}
          </button>
        </div>

        {/* Navigation Destination Links */}
        <nav className="flex-1 overflow-y-auto px-2 space-y-1.5 py-1 scrollbar-thin">
          {renderNavGroup('primary', 'الرئيسية والذكاء', 'Core & AI')}
          {renderNavGroup('productivity', 'الإنتاجية', 'Productivity')}
          {renderNavGroup('knowledge', 'المعرفة والمالية', 'Knowledge & Wealth')}
          {renderNavGroup('system', 'النظام', 'System')}

          {/* Recent Chats / Workspace History */}
          {!isSidebarCollapsed && (
            <div className="pt-2.5 pb-1 border-t border-zinc-800/50 mt-2 space-y-0.5">
              <div className="px-2.5 py-1 flex items-center justify-between text-[10px] font-medium tracking-wider text-zinc-500 uppercase select-none">
                <span>{isAr ? 'المحادثات الأخيرة' : 'Recent Sessions'}</span>
              </div>

              {recentChats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => {
                    setActiveRoute('chat');
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.2 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 transition-colors text-start cursor-pointer group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <MessageSquare className="w-3 h-3 text-zinc-600 group-hover:text-violet-400 shrink-0" />
                    <span className="truncate">
                      {isAr ? chat.titleAr : chat.titleEn}
                    </span>
                  </div>
                  <span className="text-[9px] text-zinc-600 font-mono shrink-0">
                    {chat.time}
                  </span>
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* NOVO Live Card (Calm, supporting indicator) */}
        {!isSidebarCollapsed && (
          <div className="mx-2.5 mb-2 rounded-xl bg-zinc-900/40 border border-zinc-800/60 p-2.5 shrink-0 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500" />
                </span>
                <span className="text-[11px] font-medium text-zinc-300">
                  NOVO Live
                </span>
              </div>
              <span className="text-[9px] text-zinc-500 font-mono">Audio</span>
            </div>

            <p className="text-[10px] text-zinc-400 leading-tight">
              {isAr
                ? 'استمع وتحدث مع NOVO بالصوت المباشر'
                : 'Interactive voice intelligence workspace'}
            </p>

            <button
              type="button"
              onClick={() => setActiveRoute('chat')}
              className="w-full py-1 px-2 rounded-lg bg-zinc-800/60 hover:bg-violet-950/50 border border-zinc-700/50 hover:border-violet-700/50 text-zinc-300 hover:text-violet-200 text-[10px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Mic className="w-3 h-3 text-violet-400" />
              <span>{isAr ? 'بدء المحادثة الصوتية' : 'Start Voice Mode'}</span>
            </button>
          </div>
        )}

        {/* Bottom Profile & Status Footer */}
        <div className="p-2.5 border-t border-zinc-800/60 bg-[#07080f] shrink-0 space-y-2">
          {/* User Profile Bar */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 truncate">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white font-semibold text-[10px] shrink-0 shadow-xs border border-violet-400/30">
                <User className="w-3.5 h-3.5" />
              </div>

              {!isSidebarCollapsed && (
                <div className="flex flex-col truncate">
                  <span className="text-xs font-medium text-zinc-200 truncate">
                    {isAr ? 'مستخدم NOVO' : 'Personal Workspace'}
                  </span>
                  <span className="text-[9px] text-zinc-500 truncate">
                    {isAr ? 'النسخة الاحترافية' : 'Pro Tier Active'}
                  </span>
                </div>
              )}
            </div>

            {!isSidebarCollapsed && (
              <button
                id="sidebar-lang-toggle-btn"
                type="button"
                onClick={toggleLanguage}
                className="p-1 rounded-lg bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-mono transition-colors cursor-pointer"
                title={isAr ? 'تبديل اللغة' : 'Switch Language'}
              >
                {language === 'ar' ? 'EN' : 'عربي'}
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

