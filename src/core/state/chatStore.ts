import { AuthLifecycle } from '../auth/authLifecycle';
import { create } from 'zustand';
import { Conversation, ChatMessage } from '../../types/data';
import { RepositoryFactory } from '../data/RepositoryFactory';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  lastSentMessageId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  lastUpdated: string | null;
  initialize: () => Promise<void>;
  createConversation: (title?: string, initialMessageContent?: string) => Promise<Conversation>;
  selectConversation: (id: string | null) => Promise<void>;
  sendMessage: (content: string, role?: 'user' | 'assistant' | 'system', explicitConvId?: string, replyToMessageId?: string) => Promise<string>;
  renameConversation: (id: string, newTitle: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  clearState: () => void;
}

const attemptPersistence = async (
  operation: () => Promise<void>,
  get: () => ChatState,
  set: (state: Partial<ChatState>) => void
): Promise<void> => {
  try {
    await operation();
    set({ lastUpdated: new Date().toISOString() });
  } catch (err: any) {
    if (err?.name !== 'QuotaExceededError' && err?.name !== 'NS_ERROR_DOM_QUOTA_REACHED' && err?.code !== 22) {
      throw err;
    }

    console.warn('Storage quota exceeded, attempting to prune old conversations...');
    const repo = RepositoryFactory.getChatRepository();
    let pruned = [...get().conversations];
    const activeId = get().activeConversationId;
    
    while (pruned.length > 1) {
      let oldestIdx = -1;
      let oldestTime = Infinity;
      for (let i = 0; i < pruned.length; i++) {
        if (pruned[i].id !== activeId) {
          const time = new Date(pruned[i].updatedAt).getTime();
          if (time < oldestTime) {
            oldestTime = time;
            oldestIdx = i;
          }
        }
      }
      if (oldestIdx !== -1) {
        const deletedId = pruned[oldestIdx].id;
        pruned.splice(oldestIdx, 1);
        try {
          await repo.delete(deletedId);
          set({ conversations: pruned, lastUpdated: new Date().toISOString() });
          await operation();
          return;
        } catch (e: any) {
           if (e?.name !== 'QuotaExceededError' && e?.name !== 'NS_ERROR_DOM_QUOTA_REACHED' && e?.code !== 22) {
              throw e;
           }
        }
      } else {
        break;
      }
    }

    let activeConv = pruned.find((c) => c.id === activeId);
    if (activeConv && activeConv.messages.length > 50) {
      const truncatedMessages = activeConv.messages.slice(-50);
      const updatedActive = { ...activeConv, messages: truncatedMessages };
      pruned = pruned.map((c) => (c.id === activeId ? updatedActive : c));
      try {
        await repo.update(activeId!, { messages: truncatedMessages });
        set({ conversations: pruned, lastUpdated: new Date().toISOString() });
        await operation();
        return;
      } catch (e: any) {
         if (e?.name !== 'QuotaExceededError' && e?.name !== 'NS_ERROR_DOM_QUOTA_REACHED' && e?.code !== 22) {
           throw e;
         }
      }
    }

    console.error('Failed to save after all pruning strategies. Rolling back.');
    if (typeof window !== 'undefined') {
      alert(
        'مساحة التخزين المحلية ممتلئة. يرجى مسح بعض البيانات للمتابعة.\nLocal storage is full. Please clear some data.'
      );
    }
    throw err;
  }
};

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  lastSentMessageId: null,
  status: 'idle',
  error: null,
  lastUpdated: null,
  clearState: () => {
    set({
      conversations: [],
      activeConversationId: null,
      lastSentMessageId: null,
      status: 'idle',
      error: null,
      lastUpdated: null
    });
  },

  initialize: async () => {
    const authGuard = AuthLifecycle.createGuard();
    if (get().status === 'ready' || get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const repo = RepositoryFactory.getChatRepository();
      const conversations = await repo.getAll();
      const activeConversationId = (await repo.getActiveChatId()) || null;
      if (authGuard.isStale()) return;
      set({
        conversations,
        activeConversationId,
        status: 'ready',
        error: null,
        lastUpdated: new Date().toISOString(),
      });
    } catch (err) {
      if (authGuard.isStale()) return;
        set({ error: (err as Error).message, status: 'error' });
    }
  },

  selectConversation: async (id: string | null) => {
    const authGuard = AuthLifecycle.createGuard();
    const previousId = get().activeConversationId;
    if (previousId === id) return;
    
    set({ activeConversationId: id });
    
    try {
      const repo = RepositoryFactory.getChatRepository();
      await repo.saveActiveChatId(id || '');
    } catch (err) {
      if (authGuard.isStale()) return;
      set({ activeConversationId: previousId });
      throw err;
    }
  },

  createConversation: async (title?: string, initialMessageContent?: string) => {
    const authGuard = AuthLifecycle.createGuard();
    const now = new Date().toISOString();
    const initialMessages: ChatMessage[] = [];
        
    if (initialMessageContent && initialMessageContent.trim()) {
      initialMessages.push({
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        role: 'user',
        content: initialMessageContent.trim(),
        createdAt: now,
      });
    }
        
    const newConv: Conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: title?.trim() || (initialMessageContent ? initialMessageContent.slice(0, 30) + '...' : 'محادثة جديدة'),
      messages: initialMessages,
      createdAt: now,
      updatedAt: now,
    };
    
    const current = get().conversations;
    set({ conversations: [newConv, ...current] });
    const previousActiveId = get().activeConversationId;
    get().selectConversation(newConv.id); // optimistic fire-and-forget
    
    try {
      await attemptPersistence(
        () => RepositoryFactory.getChatRepository().create(newConv),
        get, set
      );
      return newConv;
    } catch (err) {
      if (authGuard.isStale()) return;
      set({ conversations: get().conversations.filter(c => c.id !== newConv.id) });
      if (get().activeConversationId === newConv.id) {
         get().selectConversation(previousActiveId);
      }
      throw err;
    }
  },

  sendMessage: async (
    content: string, 
    role: 'user' | 'assistant' | 'system' = 'user', 
    explicitConvId?: string,
    replyToMessageId?: string
  ) => {
    const authGuard = AuthLifecycle.createGuard();
    if (!content.trim()) return '';
    const now = new Date().toISOString();
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      role,
      content: content.trim(),
      createdAt: now,
      ...(replyToMessageId ? { replyToMessageId } : {}),
    };
    
    set({ lastSentMessageId: newMessage.id });
    
    const state = get();
    const targetConvId = explicitConvId || state.activeConversationId;
    const current = state.conversations;
    
    if (!targetConvId || !current.some((c) => c.id === targetConvId)) {
      if (explicitConvId) {
        console.warn(`[ChatStore] Conversation ${explicitConvId} not found. Dropping message.`);
        return '';
      }
      
      const newConv: Conversation = {
        id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: content.trim().slice(0, 30) + (content.length > 30 ? '...' : ''),
        messages: [newMessage],
        createdAt: now,
        updatedAt: now,
      };
      
      const updated = [newConv, ...current];
      set({ conversations: updated });
      const previousActiveId = get().activeConversationId;
      get().selectConversation(newConv.id);
      
      try {
        await attemptPersistence(
          () => RepositoryFactory.getChatRepository().create(newConv),
          get, set
        );
      } catch (err) {
        if (authGuard.isStale()) return;
        set({ conversations: get().conversations.filter(c => c.id !== newConv.id) });
        if (get().activeConversationId === newConv.id) {
           get().selectConversation(previousActiveId);
        }
        throw err;
      }
      return newConv.id;
    }
    
    const targetConv = current.find((c) => c.id === targetConvId)!;
    const updatedTitle =
      targetConv.messages.length === 0 && targetConv.title.includes('محادثة جديدة')
        ? content.trim().slice(0, 30)
        : targetConv.title;
    
    const nextMessages = [...targetConv.messages, newMessage];
    
    set({
      conversations: get().conversations.map((conv) => {
        if (conv.id === targetConvId) {
          return {
            ...conv,
            title: updatedTitle,
            messages: nextMessages,
            updatedAt: now,
          };
        }
        return conv;
      })
    });
    
    try {
      await attemptPersistence(
        async () => {
          const currentConvState = get().conversations.find(c => c.id === targetConvId);
          if (currentConvState) {
             await RepositoryFactory.getChatRepository().update(targetConvId, { 
               title: currentConvState.title, 
               messages: currentConvState.messages,
               updatedAt: currentConvState.updatedAt
             });
          }
        },
        get, set
      );
    } catch (err) {
      if (authGuard.isStale()) return;
      set({
        conversations: get().conversations.map((conv) => {
          if (conv.id === targetConvId) {
            return {
              ...conv,
              messages: conv.messages.filter((m) => m.id !== newMessage.id),
            };
          }
          return conv;
        })
      });
      throw err;
    }
    return targetConvId;
  },

  renameConversation: async (id: string, newTitle: string) => {
    const authGuard = AuthLifecycle.createGuard();
    if (!newTitle.trim()) return;
    const now = new Date().toISOString();
    
    const targetConv = get().conversations.find((c) => c.id === id);
    if (!targetConv) return;
    
    const previousTitle = targetConv.title;
    const previousUpdatedAt = targetConv.updatedAt;
    
    set({
      conversations: get().conversations.map((conv) => {
        if (conv.id === id) {
          return {
            ...conv,
            title: newTitle.trim(),
            updatedAt: now,
          };
        }
        return conv;
      })
    });
    
    try {
      await attemptPersistence(
        () => RepositoryFactory.getChatRepository().update(id, { title: newTitle.trim(), updatedAt: now }),
        get, set
      );
    } catch (err) {
      if (authGuard.isStale()) return;
      set({
        conversations: get().conversations.map((conv) => {
          if (conv.id === id) {
            return {
              ...conv,
              title: previousTitle,
              updatedAt: previousUpdatedAt,
            };
          }
          return conv;
        })
      });
      throw err;
    }
  },

  deleteConversation: async (id: string) => {
    const authGuard = AuthLifecycle.createGuard();
    const currentConvs = get().conversations;
    const targetIdx = currentConvs.findIndex((c) => c.id === id);
    if (targetIdx === -1) return;
    
    const targetConv = currentConvs[targetIdx];
    const previousActiveId = get().activeConversationId;
    
    const updated = currentConvs.filter((c) => c.id !== id);
    set({ conversations: updated });
    
    let nextId = previousActiveId;
    if (previousActiveId === id) {
      nextId = updated.length > 0 ? updated[0].id : null;
      get().selectConversation(nextId);
    }
    
    try {
      await attemptPersistence(
        () => RepositoryFactory.getChatRepository().delete(id),
        get, set
      );
    } catch (err) {
      if (authGuard.isStale()) return;
      const rollbackConvs = [...get().conversations];
      rollbackConvs.splice(targetIdx, 0, targetConv);
      set({ conversations: rollbackConvs });
      if (previousActiveId === id) {
        get().selectConversation(id);
      }
      throw err;
    }
  },
}));
