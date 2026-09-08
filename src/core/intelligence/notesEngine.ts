import { Note, KnowledgeItem } from '../../types/data';
import { KnowledgeSummary } from './intelligenceTypes';
import { isWithinDays } from './dateUtils';

/**
 * Deterministic Notes & Knowledge Analysis Engine
 * Tracks user knowledge curation cadence, recent updates, and personal memory volume.
 */
export function analyzeNotesAndKnowledge(
  notes: Note[],
  knowledgeItems: KnowledgeItem[] = [],
  now: Date = new Date()
): KnowledgeSummary {
  const totalNotes = notes.length;

  let recentlyCreatedNotes = 0;
  let recentlyUpdatedNotes = 0;
  let notesCreatedThisWeek = 0;
  let latestActivityTime = 0;

  for (const n of notes) {
    if (isWithinDays(n.createdAt, 7, now)) {
      recentlyCreatedNotes++;
      notesCreatedThisWeek++;
    }
    if (isWithinDays(n.updatedAt, 7, now)) {
      recentlyUpdatedNotes++;
    }

    const updatedMs = new Date(n.updatedAt || n.createdAt).getTime();
    if (!isNaN(updatedMs) && updatedMs > latestActivityTime) {
      latestActivityTime = updatedMs;
    }
  }

  // Also factor in knowledge repository items if present
  for (const k of knowledgeItems) {
    const itemMs = new Date(k.updatedAt || k.createdAt).getTime();
    if (!isNaN(itemMs) && itemMs > latestActivityTime) {
      latestActivityTime = itemMs;
    }
  }

  const latestActivity = latestActivityTime > 0 ? new Date(latestActivityTime).toISOString() : null;
  const totalKnowledgeItems = knowledgeItems.length;
  const pinnedKnowledgeCount = knowledgeItems.filter((k) => k.pinned).length;

  return {
    totalNotes,
    recentlyCreatedNotes,
    recentlyUpdatedNotes,
    notesCreatedThisWeek,
    latestActivity,
    totalKnowledgeItems,
    pinnedKnowledgeCount,
  };
}
