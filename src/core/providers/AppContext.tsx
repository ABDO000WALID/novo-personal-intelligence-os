import { createContext, useContext, useState, ReactNode } from 'react';
import { RouteId, Language } from '../../types/navigation';

interface AppContextValue {
  activeRoute: RouteId;
  setActiveRoute: (route: RouteId) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (val: boolean | ((prev: boolean) => boolean)) => void;
  isRightPanelOpen: boolean;
  setIsRightPanelOpen: (val: boolean | ((prev: boolean) => boolean)) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (val: boolean | ((prev: boolean) => boolean)) => void;
  createNewChat: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeRoute, setActiveRouteState] = useState<RouteId>('home');
  const [language, setLanguage] = useState<Language>('ar');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const setActiveRoute = (route: RouteId) => {
    setActiveRouteState(route);
    setIsMobileMenuOpen(false);
  };

  const createNewChat = () => {
    setActiveRoute('chat');
    setIsMobileMenuOpen(false);
  };

  return (
    <AppContext.Provider
      value={{
        activeRoute,
        setActiveRoute,
        language,
        setLanguage,
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        isRightPanelOpen,
        setIsRightPanelOpen,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        createNewChat,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
