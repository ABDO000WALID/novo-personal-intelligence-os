import { IAsyncRepository } from '../../interfaces';
import { storageService, NOVO_STORAGE_EVENT } from '../../../storage/storageService';
import { AuthLifecycle } from '../../../auth/authLifecycle';

export class LocalAsyncRepository<T extends { id: string }> implements IAsyncRepository<T> {
  constructor(
    protected storageKey: string,
    protected initialSeed: () => T[]
  ) {}

  protected getScopedKey(): string | null {
    const uid = AuthLifecycle.getUid();
    if (!uid) return null;
    return `novo:${uid}:${this.storageKey}`;
  }

  async getAll(): Promise<T[]> {
    return this._getAllSync(this.getScopedKey());
  }

  async getById(id: string): Promise<T | null> {
    const key = this.getScopedKey();
    const all = this._getAllSync(key);
    return all.find(item => item.id === id) || null;
  }

  async create(item: T): Promise<void> {
    const guard = AuthLifecycle.createGuard();
    const key = this.getScopedKey();
    if (!key) {
      throw new Error('Repository operation requires an authenticated user.');
    }
    const all = this._getAllSync(key);

    if (all.some(i => i.id === item.id)) {
      throw new Error(`Item with id ${item.id} already exists`);
    }
    all.push(item);

    await Promise.resolve(); // Async microtask boundary
    if (guard.isStale()) {
      throw new Error(`Repository operation aborted: Identity changed during create.`);
    }
    this._saveAllSync(all, key);
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    const guard = AuthLifecycle.createGuard();
    const key = this.getScopedKey();
    if (!key) {
      throw new Error('Repository operation requires an authenticated user.');
    }
    const all = this._getAllSync(key);

    const index = all.findIndex(item => item.id === id);
    if (index === -1) {
      throw new Error(`Item with id ${id} not found`);
    }
    all[index] = { ...all[index], ...changes };

    await Promise.resolve(); // Async microtask boundary
    if (guard.isStale()) {
      throw new Error(`Repository operation aborted: Identity changed during update.`);
    }
    this._saveAllSync(all, key);
  }

  async delete(id: string): Promise<void> {
    const guard = AuthLifecycle.createGuard();
    const key = this.getScopedKey();
    if (!key) {
      throw new Error('Repository operation requires an authenticated user.');
    }
    const all = this._getAllSync(key);

    const index = all.findIndex(item => item.id === id);
    if (index === -1) {
      throw new Error(`Item with id ${id} not found`);
    }
    all.splice(index, 1);

    await Promise.resolve(); // Async microtask boundary
    if (guard.isStale()) {
      throw new Error(`Repository operation aborted: Identity changed during delete.`);
    }
    this._saveAllSync(all, key);
  }

  subscribe(onData: (items: T[]) => void): () => void {
    const handleUpdate = (e: Event) => {
      const key = this.getScopedKey();
      if (!key) return;

      // Handle same-window updates
      if (e instanceof CustomEvent && e.detail) {
        if (e.detail.key === key || e.detail.key === '__ALL__') {
          onData(this._getAllSync(key));
        }
      }
      // Handle cross-tab updates
      else if (e instanceof StorageEvent) {
        if (e.key === key || e.key === null) {
          onData(this._getAllSync(key));
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(NOVO_STORAGE_EVENT, handleUpdate);
      window.addEventListener('storage', handleUpdate);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(NOVO_STORAGE_EVENT, handleUpdate);
        window.removeEventListener('storage', handleUpdate);
      }
    };
  }

  // --- Sync internal helpers ---

  protected _getAllSync(key: string | null = this.getScopedKey()): T[] {
    if (!key) return [];
    return storageService.getItem<T[]>(key, this.initialSeed());
  }

  async saveAll(items: T[]): Promise<void> {
    const guard = AuthLifecycle.createGuard();
    const key = this.getScopedKey();
    if (!key) {
      throw new Error('Repository operation requires an authenticated user.');
    }
    
    await Promise.resolve(); // Async microtask boundary
    if (guard.isStale()) {
      throw new Error(`Repository operation aborted: Identity changed during saveAll.`);
    }
    this._saveAllSync(items, key);
  }

  protected _saveAllSync(items: T[], key: string | null = this.getScopedKey()): void {
    if (!key) {
      throw new Error('Repository operation requires an authenticated user.');
    }
    storageService.setItem(key, items);
  }
}
