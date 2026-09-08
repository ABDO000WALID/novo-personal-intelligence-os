export const NOVO_STORAGE_VERSION = 'v1';

export const STORAGE_KEYS = {
  NOTES: `novo_${NOVO_STORAGE_VERSION}_notes`,
  GOALS: `novo_${NOVO_STORAGE_VERSION}_goals`,
  TASKS: `novo_${NOVO_STORAGE_VERSION}_tasks`,
  FOCUS_SESSIONS: `novo_${NOVO_STORAGE_VERSION}_focus_sessions`,
  MONEY_ENTRIES: `novo_${NOVO_STORAGE_VERSION}_money_entries`,
  CONVERSATIONS: `novo_${NOVO_STORAGE_VERSION}_conversations`,
  ACTIVE_CHAT_ID: `novo_${NOVO_STORAGE_VERSION}_active_chat_id`,
  KNOWLEDGE: 'novo_knowledge_v1',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
