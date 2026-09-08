import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Conversation, ChatMessage } from '../../../types/data';
import { STORAGE_KEYS } from '../../../core/storage/storageKeys';
import { storageService, INITIAL_SEEDS, NOVO_STORAGE_EVENT } from '../../../core/storage/storageService';

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    return storageService.getItem<Conversation[]>(
      STORAGE_KEYS.CONVERSATIONS,
      INITIAL_SEEDS.conversations()
    );
  });
  
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    const savedActive = storageService.getItem<string | null>(STORAGE_KEYS.ACTIVE_CHAT_ID, null);
    if (savedActive) {
      return savedActive;
    }
    return null;
  });

  const convsRef = useRef(conversations);
  const activeIdRef = useRef(activeConversationId);

  useEffect(() => {
    convsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const syncConversations = useCallback((newConversations: Conversation[]) => {
    const previous = convsRef.current;
    convsRef.current = newConversations;
    setConversations(newConversations);
    try {
      storageService.setItem(STORAGE_KEYS.CONVERSATIONS, newConversations);
    } catch (err) {
      console.warn('Storage quota exceeded, attempting to prune old conversations...');
      
      // Intentional Retention Policy: Keep pruning the oldest conversation until it fits, 
      // but don't delete the active one.
      let pruned = [...newConversations];
      let success = false;
      const activeId = activeIdRef.current;
      
      while (pruned.length > 1) {
        // Find oldest index that is not the active one
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
          pruned.splice(oldestIdx, 1);
          try {
            storageService.setItem(STORAGE_KEYS.CONVERSATIONS, pruned);
            success = true;
            convsRef.current = pruned;
            setConversations(pruned);
            break;
          } catch (e) {
            // still failing, continue pruning
          }
        } else {
          break; // only active conversation is left
        }
      }
      
      // If we couldn't save even after pruning (or if it was just 1 huge active conversation)
      if (!success) {
        // Trim messages from the active conversation itself
        let activeConv = pruned.find(c => c.id === activeId);
        if (activeConv && activeConv.messages.length > 50) {
          activeConv = {
            ...activeConv,
            messages: activeConv.messages.slice(-50) // keep last 50
          };
          pruned = pruned.map(c => c.id === activeId ? activeConv! : c);
          try {
             storageService.setItem(STORAGE_KEYS.CONVERSATIONS, pruned);
             success = true;
             convsRef.current = pruned;
             setConversations(pruned);
          } catch (e) {
            // absolute failure
          }
        }
      }

      if (!success) {
        console.error('Failed to save after all pruning strategies. Rolling back.');
        convsRef.current = previous;
        setConversations(previous);
        alert('مساحة التخزين المحلية ممتلئة. يرجى مسح بعض البيانات للمتابعة.\nLocal storage is full. Please clear some data.');
      }
    }
  }, []);

  const selectConversation = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveConversationId(id);
    if (id) {
      storageService.setItem(STORAGE_KEYS.ACTIVE_CHAT_ID, id);
    }
  }, []);

  useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>;
      if (customEvent.detail?.key === STORAGE_KEYS.CONVERSATIONS) {
        const updated = storageService.getItem<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
        setConversations(updated);
        convsRef.current = updated;
      }
    };
    window.addEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
    return () => {
      window.removeEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
    };
  }, []);

  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  const createConversation = useCallback((title?: string, initialMessageContent?: string) => {
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

    const updated = [newConv, ...convsRef.current];
    syncConversations(updated);
    selectConversation(newConv.id);
    return newConv;
  }, [syncConversations, selectConversation]);

  const sendMessage = useCallback((content: string, role: 'user' | 'assistant' = 'user') => {
    if (!content.trim()) return;
    const now = new Date().toISOString();
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      role,
      content: content.trim(),
      createdAt: now,
    };

    let targetConvId = activeIdRef.current;
    if (!targetConvId || !convsRef.current.some((c) => c.id === targetConvId)) {
      // Create new conversation
      const newConv: Conversation = {
        id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: content.trim().slice(0, 30) + (content.length > 30 ? '...' : ''),
        messages: [newMessage],
        createdAt: now,
        updatedAt: now,
      };
      const updated = [newConv, ...convsRef.current];
      syncConversations(updated);
      selectConversation(newConv.id);
      return;
    }

    const updated = convsRef.current.map((conv) => {
      if (conv.id === targetConvId) {
        // Auto-title if it was generic and had no messages
        const updatedTitle =
          conv.messages.length === 0 && conv.title.includes('محادثة جديدة')
            ? content.trim().slice(0, 30)
            : conv.title;

        return {
          ...conv,
          title: updatedTitle,
          messages: [...conv.messages, newMessage],
          updatedAt: now,
        };
      }
      return conv;
    });

    syncConversations(updated);
  }, [syncConversations, selectConversation]);

  const renameConversation = useCallback((id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    const now = new Date().toISOString();
    const updated = convsRef.current.map((conv) => {
      if (conv.id === id) {
        return {
          ...conv,
          title: newTitle.trim(),
          updatedAt: now,
        };
      }
      return conv;
    });
    syncConversations(updated);
  }, [syncConversations]);

  const deleteConversation = useCallback((id: string) => {
    const updated = convsRef.current.filter((c) => c.id !== id);
    syncConversations(updated);
    if (activeIdRef.current === id) {
      const nextId = updated.length > 0 ? updated[0].id : null;
      selectConversation(nextId);
    }
  }, [syncConversations, selectConversation]);

  return {
    conversations,
    activeConversation,
    activeConversationId,
    selectConversation,
    createConversation,
    sendMessage,
    renameConversation,
    deleteConversation,
  };
}
