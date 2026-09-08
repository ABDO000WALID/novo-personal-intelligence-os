import { useState, FormEvent } from 'react';
import { useApp } from '../../core/providers/AppContext';
import { NAVIGATION_ITEMS } from '../../core/navigation/navigationConfig';
import {
  Menu,
  PanelRight,
  Languages,
  Search,
  Command,
  User,
} from 'lucide-react';

export function Header() {
  const {
    activeRoute,
    language,
    setLanguage,
    setIsMobileMenuOpen,
    isRightPanelOpen,
    setIsRightPanelOpen,
    setActiveRoute,
  } = useApp();

  const [searchFocused, setSearchFocused] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const isAr = language === 'ar';
  const currentNav = NAVIGATION_ITEMS.find((item) => item.id === activeRoute);

  const toggleLanguage = () => {
    setLanguage(language === 'ar' ? 'en' : 'ar');
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      setActiveRoute('chat');
      setSearchValue('');
    }
  };

  return (
    <header className="h-14 px-4 md:px-6 border-b border-zinc-800/50 bg-[#07080f]/75 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between gap-4">
      {/* Left Area: Mobile Menu Trigger + Current View Name */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          id="mobile-menu-toggle-btn"
          type="button"
          onClick={() => setIsMobileMenuOpen(true)}
          className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-zinc-100 tracking-tight">
            {currentNav ? (isAr ? currentNav.labelAr : currentNav.labelEn) : 'NOVO'}
          </h1>
          <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-zinc-700" />
          <span className="hidden sm:inline-block text-xs text-zinc-400 font-normal">
            {currentNav ? (isAr ? currentNav.descriptionAr : currentNav.descriptionEn) : ''}
          </span>
        </div>
      </div>

      {/* Center Area: Universal Command / Search Bar (Clean & Lightweight) */}
      <div className="hidden md:flex flex-1 max-w-sm mx-auto">
        <form
          onSubmit={handleSearchSubmit}
          className={`w-full relative flex items-center rounded-xl bg-zinc-900/40 border transition-all duration-150 ${
            searchFocused
              ? 'border-violet-500/50 bg-zinc-900/80 ring-1 ring-violet-500/20'
              : 'border-zinc-800/60 hover:border-zinc-700/60'
          }`}
        >
          <Search className="w-3.5 h-3.5 text-zinc-500 ms-3 shrink-0" />
          <input
            id="global-search-input"
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={
              isAr
                ? 'ابحث في NOVO أو اسأل المساعد الذكي...'
                : 'Search NOVO or ask AI assistant...'
            }
            className="w-full bg-transparent px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
          />
          <div className="me-2 flex items-center gap-0.5 text-[10px] font-mono text-zinc-500 bg-zinc-950/60 border border-zinc-800 px-1.5 py-0.5 rounded">
            <Command className="w-2.5 h-2.5" />
            <span>K</span>
          </div>
        </form>
      </div>

      {/* Right Area: Profile status + Language Switch + Context Panel Toggle */}
      <div className="flex items-center gap-2 shrink-0">
        {/* User Pill (Subtle & Compact) */}
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-zinc-900/50 border border-zinc-800/60 text-xs text-zinc-300">
          <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white text-[9px] font-semibold">
            <User className="w-2.5 h-2.5" />
          </div>
          <span className="font-medium text-[11px] text-zinc-300">
            {isAr ? 'مستخدم NOVO' : 'NOVO User'}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        </div>

        {/* Language Switch Button */}
        <button
          id="header-lang-btn"
          type="button"
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/50 border border-zinc-800/60 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-all cursor-pointer active:scale-[0.98]"
          title={isAr ? 'تبديل اللغة' : 'Switch Language'}
        >
          <Languages className="w-3.5 h-3.5 text-zinc-400" />
          <span className="font-mono text-[11px]">
            {language === 'ar' ? 'English' : 'العربية'}
          </span>
        </button>

        {/* Right Context Panel Toggle Button */}
        <button
          id="header-toggle-right-panel-btn"
          type="button"
          onClick={() => setIsRightPanelOpen((prev) => !prev)}
          className={`p-1.5 rounded-lg border transition-all cursor-pointer active:scale-[0.98] ${
            isRightPanelOpen
              ? 'bg-violet-950/40 border-violet-700/50 text-violet-200'
              : 'bg-zinc-900/50 border-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
          title={isAr ? 'لوحة المعلومات الجانبية' : 'Toggle Context Panel'}
          aria-label="Toggle context panel"
        >
          <PanelRight className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}

