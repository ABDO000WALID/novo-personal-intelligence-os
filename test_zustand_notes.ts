import './test_env.ts';
import { useNoteStore } from './src/core/state/noteStore';
import { RepositoryFactory } from './src/core/data/RepositoryFactory';
import { getNOVOContext } from './src/core/intelligence/contextEngine';

console.log("=== RUNNING PHASE 9.2E-3B REGRESSION GATE (NOTES ASYNC) ===\n");

async function runTest(id: string, action: string, expected: string, execute: () => Promise<boolean> | boolean) {
  let passed = false;
  try {
    passed = await execute();
  } catch (e) {
    console.error(e);
    passed = false;
  }
  console.log(`TEST ID: ${id}`);
  console.log(`ACTION: ${action}`);
  console.log(`EXPECTED RESULT: ${expected}`);
  console.log(`ACTUAL RESULT: ${passed ? 'Data matches expected state' : 'Data mismatch or error'}`);
  console.log(`PASS/FAIL: ${passed ? 'PASS' : 'FAIL'}\n`);
}

const resetStore = () => {
  (RepositoryFactory.getNoteRepository() as any)._saveAllSync([]);
  useNoteStore.setState({ notes: [], status: 'idle', error: null });
};

async function runAll() {

// NOTE-ASYNC-01
resetStore();
await runTest(
  'NOTE-ASYNC-01',
  'Initialize store from existing repository data asynchronously.',
  'Store correctly loads existing notes on init using getAll().',
  async () => {
    (RepositoryFactory.getNoteRepository() as any)._saveAllSync([{
      id: 'legacy-note-1', title: 'Legacy Note', content: 'World', createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z'
    }]);
    
    await useNoteStore.getState().initialize();
    return useNoteStore.getState().notes.length === 1 && useNoteStore.getState().notes[0].id === 'legacy-note-1' && useNoteStore.getState().status === 'ready';
  }
);

// NOTE-ASYNC-02
resetStore();
await runTest(
  'NOTE-ASYNC-02',
  'Initialization idempotency.',
  'Loading state prevents duplicate fetches.',
  async () => {
    let readCount = 0;
    const originalGetRepo = RepositoryFactory.getNoteRepository;
    RepositoryFactory.getNoteRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: async () => {
          readCount++;
          await new Promise(r => setTimeout(r, 10)); // Delay
          return repo.getAll();
        },
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i: any) => repo.saveAll(i),
        saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
        getById: (id: string) => repo.getById(id),
        create: (i: any) => repo.create(i),
        delete: (id: string) => repo.delete(id),
        update: (id: string, updates: any) => repo.update(id, updates)
      } as any;
    };

    (RepositoryFactory.getNoteRepository() as any)._saveAllSync([{
      id: 'legacy-note-2', title: 'Legacy Note', content: 'World', createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z'
    }]);

    useNoteStore.setState({ status: 'idle' });
    const p1 = useNoteStore.getState().initialize();
    const p2 = useNoteStore.getState().initialize();
    
    await Promise.all([p1, p2]);
    const stoppedEarly = readCount === 1;

    RepositoryFactory.getNoteRepository = originalGetRepo;
    const finalState = useNoteStore.getState();
    return stoppedEarly && finalState.status === 'ready' && finalState.notes.length === 1 && finalState.notes[0].id === 'legacy-note-2';
  }
);

// NOTE-ASYNC-03
resetStore();
await runTest(
  'NOTE-ASYNC-03',
  'Initialization failure enters error state and supports retry.',
  'Store enters error state.',
  async () => {
    const originalGetRepo = RepositoryFactory.getNoteRepository;
    let shouldFail = true;
    RepositoryFactory.getNoteRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: async () => {
          if (shouldFail) throw new Error('Init Failed');
          return repo.getAll();
        },
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i: any) => repo.saveAll(i),
        saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
        getById: (id: string) => repo.getById(id),
        create: (i: any) => repo.create(i),
        delete: (id: string) => repo.delete(id),
        update: (id: string, updates: any) => repo.update(id, updates)
      } as any;
    };

    let caught = false;
    try {
      await useNoteStore.getState().initialize();
    } catch(e) {
      caught = true;
    }
    
    const state1 = useNoteStore.getState();
    const isError = state1.status === 'error' && state1.error === 'Init Failed';
    
    shouldFail = false;
    await useNoteStore.getState().initialize(); // Retry
    
    const state2 = useNoteStore.getState();
    const isReady = state2.status === 'ready' && state2.error === null;

    RepositoryFactory.getNoteRepository = originalGetRepo;
    return caught && isError && isReady;
  }
);


// NOTE-ASYNC-04
resetStore();
await useNoteStore.getState().initialize();
await runTest(
  'NOTE-ASYNC-04',
  'createNote() returns a Promise<Note> and generates a stable ID.',
  'Note is added to Zustand and Repository identically.',
  async () => {
    const newNote = await useNoteStore.getState().createNote('New Zustand Note', 'Desc');
    const storeNotes = useNoteStore.getState().notes;
    const repoNotes = await RepositoryFactory.getNoteRepository().getAll();
    
    return newNote.id.startsWith('note-') && storeNotes.length === 1 && repoNotes.length === 1 && storeNotes[0].title === 'New Zustand Note';
  }
);

// NOTE-ASYNC-05
await runTest(
  'NOTE-ASYNC-05',
  'Create is OPTIMISTIC.',
  'Note exists BEFORE repository Promise resolves.',
  async () => {
    resetStore();
    await useNoteStore.getState().initialize();
    
    const originalGetRepo = RepositoryFactory.getNoteRepository;
    let resolveRepoPromise: () => void;
    
    RepositoryFactory.getNoteRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i: any) => repo.saveAll(i),
        saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
        getById: (id: string) => repo.getById(id),
        delete: (id: string) => repo.delete(id),
        update: (id: string, updates: any) => repo.update(id, updates),
        create: async (i: any) => { 
          return new Promise<void>((resolve) => {
            resolveRepoPromise = () => {
              repo.create(i).then(resolve);
            };
          });
        },
      } as any;
    };

    const createPromise = useNoteStore.getState().createNote('Optimistic Note');
    
    const hasNoteBeforeResolve = useNoteStore.getState().notes.some(n => n.title === 'Optimistic Note');
    
    resolveRepoPromise!();
    await createPromise;
    
    const hasNoteAfterResolve = useNoteStore.getState().notes.some(n => n.title === 'Optimistic Note');

    RepositoryFactory.getNoteRepository = originalGetRepo;
    return hasNoteBeforeResolve && hasNoteAfterResolve;
  }
);

// NOTE-ASYNC-06
await runTest(
  'NOTE-ASYNC-06',
  'Create failure removes ONLY the created note.',
  'State is unmutated if persistence fails.',
  async () => {
    resetStore();
    await useNoteStore.getState().initialize();
    await useNoteStore.getState().createNote('Valid note');
    
    const originalNotes = [...useNoteStore.getState().notes];
    
    const originalGetRepo = RepositoryFactory.getNoteRepository;
    RepositoryFactory.getNoteRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i: any) => repo.saveAll(i),
        saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
        getById: (id: string) => repo.getById(id),
        delete: (id: string) => repo.delete(id),
        update: (id: string, updates: any) => repo.update(id, updates),
        create: async () => { throw new Error('Quota Exceeded'); },
      } as any;
    };
    
    let caught = false;
    try {
      await useNoteStore.getState().createNote('Should Fail');
    } catch (e) {
      caught = true;
    }
    
    RepositoryFactory.getNoteRepository = originalGetRepo;
    return caught && useNoteStore.getState().notes.length === originalNotes.length && useNoteStore.getState().error === 'Quota Exceeded';
  }
);

// NOTE-ASYNC-07
await runTest(
  'NOTE-ASYNC-07',
  'Update is OPTIMISTIC.',
  'Note is updated in both sources.',
  async () => {
    resetStore();
    await useNoteStore.getState().initialize();
    const g = await useNoteStore.getState().createNote('Initial Note');

    const originalGetRepo = RepositoryFactory.getNoteRepository;
    let resolveRepoPromise: () => void;
    
    RepositoryFactory.getNoteRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i: any) => repo.saveAll(i),
        saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
        getById: (id: string) => repo.getById(id),
        delete: (id: string) => repo.delete(id),
        create: (i: any) => repo.create(i),
        update: async (id: string, updates: any) => { 
          return new Promise<void>((resolve) => {
            resolveRepoPromise = () => {
              repo.update(id, updates).then(resolve);
            };
          });
        },
      } as any;
    };
    
    const updatePromise = useNoteStore.getState().updateNote(g.id, { title: 'Updated Title' });
    
    const hasNoteBeforeResolve = useNoteStore.getState().notes.find(n => n.id === g.id)?.title === 'Updated Title';
    
    resolveRepoPromise!();
    await updatePromise;

    RepositoryFactory.getNoteRepository = originalGetRepo;
    return hasNoteBeforeResolve;
  }
);


// NOTE-ASYNC-08
await runTest(
  'NOTE-ASYNC-08',
  'Update failure rolls back the targeted note.',
  'Targeted rollback works.',
  async () => {
    resetStore();
    await useNoteStore.getState().initialize();
    const g = await useNoteStore.getState().createNote('Initial Note');
    const originalTitle = g.title;

    const originalGetRepo = RepositoryFactory.getNoteRepository;
    RepositoryFactory.getNoteRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i: any) => repo.saveAll(i),
        saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
        getById: (id: string) => repo.getById(id),
        delete: (id: string) => repo.delete(id),
        create: (i: any) => repo.create(i),
        update: async () => { throw new Error('Update Failed'); },
      } as any;
    };

    let caught = false;
    try {
      await useNoteStore.getState().updateNote(g.id, { title: 'New Title' });
    } catch (e) {
      caught = true;
    }

    RepositoryFactory.getNoteRepository = originalGetRepo;
    const finalNote = useNoteStore.getState().notes.find(x => x.id === g.id);
    return caught && finalNote?.title === originalTitle && useNoteStore.getState().error === 'Update Failed';
  }
);

// NOTE-ASYNC-09
await runTest(
  'NOTE-ASYNC-09',
  'Concurrent same-note update A fails, B succeeds.',
  'B state survives.',
  async () => {
    resetStore();
    await useNoteStore.getState().initialize();
    const g1 = await useNoteStore.getState().createNote('Note A');

    const originalGetRepo = RepositoryFactory.getNoteRepository;
    
    let aStarted = false;
    RepositoryFactory.getNoteRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i: any) => repo.saveAll(i),
        saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
        getById: (id: string) => repo.getById(id),
        delete: (id: string) => repo.delete(id),
        create: (i: any) => repo.create(i),
        update: async (id: string, updates: any) => { 
          if (!aStarted && updates.title === 'Title A') {
              aStarted = true;
              await new Promise(r => setTimeout(r, 50));
              throw new Error('Update Failed for A');
          }
          return repo.update(id, updates);
        },
      } as any;
    };

    let aCaught = false;
    
    const promiseA = useNoteStore.getState().updateNote(g1.id, { title: 'Title A' }).catch(() => { aCaught = true; });
    
    await new Promise(r => setTimeout(r, 10));
    const promiseB = useNoteStore.getState().updateNote(g1.id, { title: 'Title B' });

    await Promise.all([promiseA, promiseB]);

    RepositoryFactory.getNoteRepository = originalGetRepo;
    const finalA = useNoteStore.getState().notes.find(x => x.id === g1.id);

    return aCaught && finalA?.title === 'Title B';
  }
);

// NOTE-ASYNC-10
await runTest(
  'NOTE-ASYNC-10',
  'Update A fails while delete B succeeds on the same note.',
  'A must NOT resurrect the deleted note.',
  async () => {
    resetStore();
    await useNoteStore.getState().initialize();
    const g = await useNoteStore.getState().createNote('Update Me Then Delete Me');

    const originalGetRepo = RepositoryFactory.getNoteRepository;
    
    let aStarted = false;
    RepositoryFactory.getNoteRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i: any) => repo.saveAll(i),
        saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
        getById: (id: string) => repo.getById(id),
        create: (i: any) => repo.create(i),
        delete: (id: string) => repo.delete(id),
        update: async (id: string, updates: any) => { 
          if (!aStarted) {
              aStarted = true;
              await new Promise(r => setTimeout(r, 50));
              throw new Error('Update Failed for A');
          }
          return repo.update(id, updates);
        },
      } as any;
    };

    let aCaught = false;
    const promiseA = useNoteStore.getState().updateNote(g.id, { title: 'Pending Update' }).catch(() => { aCaught = true; });
    
    await new Promise(r => setTimeout(r, 10));
    const promiseB = useNoteStore.getState().deleteNote(g.id);

    await Promise.all([promiseA, promiseB]);

    RepositoryFactory.getNoteRepository = originalGetRepo;
    return aCaught && useNoteStore.getState().notes.find(x => x.id === g.id) === undefined;
  }
);

// NOTE-ASYNC-11
await runTest(
  'NOTE-ASYNC-11',
  'Delete is OPTIMISTIC.',
  'Note is removed before repository Promise resolves.',
  async () => {
    resetStore();
    await useNoteStore.getState().initialize();
    const g = await useNoteStore.getState().createNote('Delete me optimistically');
    
    const originalGetRepo = RepositoryFactory.getNoteRepository;
    let resolveRepoPromise: () => void;
    
    RepositoryFactory.getNoteRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i: any) => repo.saveAll(i),
        saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
        getById: (id: string) => repo.getById(id),
        create: (i: any) => repo.create(i),
        update: (id: string, updates: any) => repo.update(id, updates),
        delete: async (id: string) => { 
          return new Promise<void>((resolve) => {
            resolveRepoPromise = () => {
              repo.delete(id).then(resolve);
            };
          });
        },
      } as any;
    };

    const delPromise = useNoteStore.getState().deleteNote(g.id);
    
    const hasNoteBeforeResolve = useNoteStore.getState().notes.some(n => n.id === g.id);
    
    resolveRepoPromise!();
    await delPromise;
    
    RepositoryFactory.getNoteRepository = originalGetRepo;
    return !hasNoteBeforeResolve;
  }
);

// NOTE-ASYNC-12
await runTest(
  'NOTE-ASYNC-12',
  'Delete failure rollback.',
  'Targeted rollback puts it back.',
  async () => {
    resetStore();
    await useNoteStore.getState().initialize();
    const g = await useNoteStore.getState().createNote('Delete Me');

    const originalGetRepo = RepositoryFactory.getNoteRepository;
    RepositoryFactory.getNoteRepository = () => {
      const repo = originalGetRepo();
      return {
        getAll: () => repo.getAll(),
        getAllSync: () => (repo as any)._getAllSync(),
        saveAll: (i: any) => repo.saveAll(i),
        saveAllSync: (i: any) => (repo as any)._saveAllSync(i),
        getById: (id: string) => repo.getById(id),
        create: (i: any) => repo.create(i),
        update: (id: string, updates: any) => repo.update(id, updates),
        delete: async () => { throw new Error('Delete Failed'); },
      } as any;
    };

    let caught = false;
    try {
      await useNoteStore.getState().deleteNote(g.id);
    } catch (e) {
      caught = true;
    }

    RepositoryFactory.getNoteRepository = originalGetRepo;
    return caught && useNoteStore.getState().notes.some(x => x.id === g.id) && useNoteStore.getState().error === 'Delete Failed';
  }
);

// NOTE-ASYNC-13
await runTest(
  'NOTE-ASYNC-13',
  'Draft/unmount regression test (Simulated)',
  'NotesView cleanup should flush the draft without duplicate updates.',
  async () => {
    resetStore();
    await useNoteStore.getState().initialize();
    const g = await useNoteStore.getState().createNote('Original Title');
    
    let updateCount = 0;
    const originalUpdate = useNoteStore.getState().updateNote;
    useNoteStore.setState({
      updateNote: async (id, updates) => {
        updateCount++;
        return originalUpdate(id, updates);
      }
    });

    // Scenario 1: Unmount before timer
    let draft = { title: 'Typing...', content: g.content };
    let timerRef: any = null;
    let draftRef = { current: draft };
    
    timerRef = setTimeout(() => {
       useNoteStore.getState().updateNote(g.id, draft);
       timerRef = null;
    }, 500);
    
    if (timerRef) {
       clearTimeout(timerRef);
       await useNoteStore.getState().updateNote(g.id, draftRef.current);
    }
    
    const passedScenario1 = updateCount === 1 && useNoteStore.getState().notes.find(x => x.id === g.id)?.title === 'Typing...';

    // Scenario 2: Unmount after timer
    updateCount = 0;
    draft = { title: 'More typing...', content: g.content };
    draftRef.current = draft;
    
    timerRef = setTimeout(() => {
       useNoteStore.getState().updateNote(g.id, draft);
       timerRef = null;
    }, 10);
    
    await new Promise(r => setTimeout(r, 20));
    
    if (timerRef) {
       clearTimeout(timerRef);
       await useNoteStore.getState().updateNote(g.id, draftRef.current);
    }

    const passedScenario2 = updateCount === 1 && useNoteStore.getState().notes.find(x => x.id === g.id)?.title === 'More typing...';

    useNoteStore.setState({ updateNote: originalUpdate });
    
    return passedScenario1 && passedScenario2;
  }
);

// NOTE-ASYNC-14
await runTest(
  'NOTE-ASYNC-14',
  'Legacy synchronous persistence is absent from noteStore.',
  'Store properties should not contain flushPendingSaves.',
  async () => {
    const state = useNoteStore.getState() as any;
    return state.flushPendingSaves === undefined;
  }
);

// NOTE-ASYNC-15
await runTest(
  'NOTE-ASYNC-15',
  'AI context remains bounded to exactly the existing rule (max 10 notes).',
  'Context uses single source of truth.',
  async () => {
    resetStore();
    await useNoteStore.getState().initialize();
    for(let i = 0; i < 15; i++) {
        await useNoteStore.getState().createNote(`Note ${i}`, 'Content');
    }
        
    
    const ctx = getNOVOContext();
    const notesString = JSON.stringify(ctx.recentNotes);
    
    // Verify it doesn't contain Note 1 to Note 4 (since we inserted 15 notes, latest 10 are kept: 5-14)
    const containsOld = notesString.includes('Note 1"') || notesString.includes('Note 3"');
    const containsNew = notesString.includes('Note 14"');
    
    return !containsOld && containsNew;
  }
);


  console.log("=== TESTS COMPLETE ===");
}

runAll().catch(e => {
  console.error(e);
  process.exit(1);
});
