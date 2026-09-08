export type RouteId =
  | 'home'
  | 'chat'
  | 'planner'
  | 'goals'
  | 'focus'
  | 'notes'
  | 'knowledge'
  | 'money'
  | 'settings';

export type Language = 'ar' | 'en';

export interface NavigationItem {
  id: RouteId;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  descriptionEn: string;
  iconName: string;
  badge?: string;
  category?: 'primary' | 'productivity' | 'knowledge' | 'system';
}

export interface AppState {
  activeRoute: RouteId;
  language: Language;
  isSidebarCollapsed: boolean;
  isRightPanelOpen: boolean;
  isMobileMenuOpen: boolean;
}
