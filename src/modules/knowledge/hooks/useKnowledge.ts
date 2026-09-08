import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  KnowledgeItem,
  KnowledgeCategory,
  KnowledgeImportance,
} from '../../../types/data';
import { STORAGE_KEYS } from '../../../core/storage/storageKeys';
import {
  storageService,
  INITIAL_SEEDS,
  NOVO_STORAGE_EVENT,
} from '../../../core/storage/storageService';

export function useKnowledge() {
  const [items, setItems] = useState<KnowledgeItem[]>(() => {
    return storageService.getItem<KnowledgeItem[]>(
      STORAGE_KEYS.KNOWLEDGE,
      INITIAL_SEEDS.knowledge()
    );
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<KnowledgeCategory | 'all'>('all');
  const [selectedImportance, setSelectedImportance] = useState<KnowledgeImportance | 'all'>('all');

  const syncItems = useCallback((newItems: KnowledgeItem[]) => {
    setItems(newItems);
    storageService.setItem(STORAGE_KEYS.KNOWLEDGE, newItems);
  }, []);

  // Listen to external / cross-tab updates
  useEffect(() => {
    const handleStorageUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string }>;
      if (customEvent.detail?.key === STORAGE_KEYS.KNOWLEDGE) {
        const updated = storageService.getItem<KnowledgeItem[]>(STORAGE_KEYS.KNOWLEDGE, []);
        setItems(updated);
      }
    };

    const handleWindowStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.KNOWLEDGE) {
        const updated = storageService.getItem<KnowledgeItem[]>(STORAGE_KEYS.KNOWLEDGE, []);
        setItems(updated);
      }
    };

    window.addEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
    window.addEventListener('storage', handleWindowStorage);
    return () => {
      window.removeEventListener(NOVO_STORAGE_EVENT, handleStorageUpdate);
      window.removeEventListener('storage', handleWindowStorage);
    };
  }, []);

  const createKnowledge = useCallback(
    (params: {
      title: string;
      content: string;
      category?: KnowledgeCategory;
      tags?: string[];
      importance?: KnowledgeImportance;
      pinned?: boolean;
      source?: 'manual' | 'note';
    }) => {
      const now = new Date().toISOString();
      // Clean tags: trim, lowercase, filter out empty & duplicates
      const cleanTags = Array.from(
        new Set(
          (params.tags || [])
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0)
        )
      );

      const newItem: KnowledgeItem = {
        id: `know-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: params.title.trim(),
        content: params.content.trim(),
        category: params.category || 'general',
        tags: cleanTags,
        importance: params.importance || 'medium',
        pinned: params.pinned || false,
        source: params.source || 'manual',
        createdAt: now,
        updatedAt: now,
      };

      const updated = [newItem, ...items];
      syncItems(updated);
      return newItem;
    },
    [items, syncItems]
  );

  const updateKnowledge = useCallback(
    (id: string, updates: Partial<Omit<KnowledgeItem, 'id' | 'createdAt'>>) => {
      const updated = items.map((item) => {
        if (item.id !== id) return item;

        let cleanTags = item.tags;
        if (updates.tags) {
          cleanTags = Array.from(
            new Set(
              updates.tags
                .map((t) => t.trim().toLowerCase())
                .filter((t) => t.length > 0)
            )
          );
        }

        return {
          ...item,
          ...updates,
          tags: cleanTags,
          updatedAt: new Date().toISOString(),
        };
      });

      syncItems(updated);
    },
    [items, syncItems]
  );

  const deleteKnowledge = useCallback(
    (id: string) => {
      const updated = items.filter((item) => item.id !== id);
      syncItems(updated);
    },
    [items, syncItems]
  );

  const togglePinned = useCallback(
    (id: string) => {
      const target = items.find((i) => i.id === id);
      if (!target) return;
      updateKnowledge(id, { pinned: !target.pinned });
    },
    [items, updateKnowledge]
  );

  // Sorting & Filtering logic:
  // 1. Filter by category
  // 2. Filter by importance
  // 3. Filter by search query (title, content, or any tag)
  // 4. Sort: pinned first, then by updatedAt descending
  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        if (selectedCategory !== 'all' && item.category !== selectedCategory) {
          return false;
        }
        if (selectedImportance !== 'all' && item.importance !== selectedImportance) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchesTitle = item.title.toLowerCase().includes(q);
          const matchesContent = item.content.toLowerCase().includes(q);
          const matchesTags = item.tags.some((tag) => tag.toLowerCase().includes(q));
          if (!matchesTitle && !matchesContent && !matchesTags) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [items, selectedCategory, selectedImportance, searchQuery]);

  const pinnedItems = useMemo(() => filteredItems.filter((i) => i.pinned), [filteredItems]);
  const unpinnedItems = useMemo(() => filteredItems.filter((i) => !i.pinned), [filteredItems]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      pinned: items.filter((i) => i.pinned).length,
      highImportance: items.filter((i) => i.importance === 'high').length,
    };
  }, [items]);

  return {
    items,
    filteredItems,
    pinnedItems,
    unpinnedItems,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedImportance,
    setSelectedImportance,
    createKnowledge,
    updateKnowledge,
    deleteKnowledge,
    togglePinned,
    stats,
  };
}
