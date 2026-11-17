import { useFocusStore } from './src/core/state/focusStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';

async function run() {
  console.log("=== RUNNING FOCUS IDENTITY TESTS ===");
  
  // FOCUS-ID-01 & FOCUS-ID-02 & FOCUS-ID-03
  // Check if identical active states produce identical IDs, and different produce different
  const t1 = '2026-09-08T10:00:00Z';
  const t2 = '2026-09-08T11:00:00Z';
  
  const originalGetRepo = RepositoryFactory.getFocusRepository;
  let createdSession: any = null;
  RepositoryFactory.getFocusRepository = () => ({
    ...originalGetRepo(),
    create: async (session) => { createdSession = session; },
    removeActiveState: async () => {},
    saveActiveState: async () => {},
  });

  // Session 1
  useFocusStore.setState({ 
    activeState: {
      mode: 'preset',
      status: 'running',
      startedAt: t1,
      durationSeconds: 1500,
      totalPausedMs: 0,
      lastPauseTimestamp: null
    },
    sessions: [],
    displaySeconds: 1500,
    status: 'ready'
  });
  await useFocusStore.getState().finishSession();
  const id1 = createdSession.id;

  // Session 2 (same start time)
  useFocusStore.setState({ 
    activeState: {
      mode: 'preset',
      status: 'running',
      startedAt: t1,
      durationSeconds: 1500,
      totalPausedMs: 0,
      lastPauseTimestamp: null
    },
    sessions: [],
    displaySeconds: 1500,
    status: 'ready'
  });
  await useFocusStore.getState().finishSession();
  const id2 = createdSession.id;

  if (id1 !== id2) {
    throw new Error(`FOCUS-ID-01 FAILED: Expected identical IDs for identical startedAt. Got ${id1} and ${id2}`);
  } else {
    console.log(`✅ [PASS] FOCUS-ID-01 & FOCUS-ID-03: Identical sessions produce identical deterministic ID (${id1}). No random component.`);
  }

  // Session 3 (different start time)
  useFocusStore.setState({ 
    activeState: {
      mode: 'preset',
      status: 'running',
      startedAt: t2,
      durationSeconds: 1500,
      totalPausedMs: 0,
      lastPauseTimestamp: null
    },
    sessions: [],
    displaySeconds: 1500,
    status: 'ready'
  });
  await useFocusStore.getState().finishSession();
  const id3 = createdSession.id;

  if (id1 === id3) {
    throw new Error(`FOCUS-ID-02 FAILED: Expected different IDs for different startedAt. Got ${id1} and ${id3}`);
  } else {
    console.log(`✅ [PASS] FOCUS-ID-02: Different sessions produce different IDs (${id1} vs ${id3}).`);
  }

  // FOCUS-ID-04 & FOCUS-ID-05
  // Check if legacy sessions can be read
  let readCount = 0;
  RepositoryFactory.getFocusRepository = () => ({
    ...originalGetRepo(),
    getSessions: async () => {
      readCount++;
      return [{
        id: 'focus-legacy-1234-xyz',
        duration: 25,
        completedAt: '2026-09-07T00:00:00Z',
      }];
    },
    getActiveState: async () => null,
  });

  useFocusStore.setState({ status: 'idle', sessions: [] });
  await useFocusStore.getState().initialize();
  
  const sessions = useFocusStore.getState().sessions;
  if (sessions.length === 1 && sessions[0].id === 'focus-legacy-1234-xyz') {
    console.log(`✅ [PASS] FOCUS-ID-04 & FOCUS-ID-05: Legacy persistence remains readable. Legacy IDs preserved.`);
  } else {
    throw new Error(`FOCUS-ID-04 FAILED: Expected to read legacy session.`);
  }

  console.log("ALL FOCUS ID TESTS PASSED");
}

run().catch(console.error);
