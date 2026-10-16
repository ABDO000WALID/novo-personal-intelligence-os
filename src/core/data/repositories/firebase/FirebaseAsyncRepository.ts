import { IAsyncRepository } from '../../interfaces';
import { AuthLifecycle } from '../../../auth/authLifecycle';
import { app } from '../../../auth/firebase';
import { fs } from './firestoreProvider';

/**
 * Removes properties whose value is strictly undefined, preventing Firestore SDK write rejections.
 * Preserves null, false, 0, "", empty arrays, and empty objects.
 */
export function sanitizeUndefined<V>(val: V): V {
  if (val === null || typeof val !== 'object') {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map(item => sanitizeUndefined(item)) as unknown as V;
  }

  const cleanObj: Record<string, any> = {};
  for (const [k, v] of Object.entries(val as Record<string, any>)) {
    if (v !== undefined) {
      cleanObj[k] = sanitizeUndefined(v);
    }
  }
  return cleanObj as V;
}

export class FirebaseAsyncRepository<T extends { id: string }> implements IAsyncRepository<T> {
  constructor(
    protected collectionName: string,
    protected initialSeed?: () => T[]
  ) {}

  protected sanitizePayload<V>(data: V): V {
    return sanitizeUndefined(data);
  }

  protected get db() {
    if (!app) throw new Error("Firebase app not initialized");
    return fs.getFirestore(app);
  }

  protected getUid(): string | null {
    return AuthLifecycle.getUid();
  }

  protected getCollectionPath(): string | null {
    const uid = this.getUid();
    if (!uid) return null;
    return `users/${uid}/${this.collectionName}`;
  }

  protected getDocPath(id: string): string | null {
    const col = this.getCollectionPath();
    if (!col) return null;
    return `${col}/${id}`;
  }

  async getAll(): Promise<T[]> {
    const uid = this.getUid();
    if (!uid) {
      console.warn(`[FirebaseAsyncRepository] Attempted to read from ${this.collectionName} without an authenticated user.`);
      return this.initialSeed ? this.initialSeed() : [];
    }
    const guard = AuthLifecycle.createGuard();
    const colRef = fs.collection(this.db, this.getCollectionPath()!);
    const snapshot = await fs.getDocs(colRef);
    if (guard.isStale()) {
      throw new Error(`Repository operation aborted: Identity changed during getAll.`);
    }
    return snapshot.docs.map(doc => doc.data() as T);
  }

  async getById(id: string): Promise<T | null> {
    const uid = this.getUid();
    if (!uid) {
      return null;
    }
    const guard = AuthLifecycle.createGuard();
    const docRef = fs.doc(this.db, this.getDocPath(id)!);
    const snapshot = await fs.getDoc(docRef);
    if (guard.isStale()) {
      throw new Error(`Repository operation aborted: Identity changed during getById.`);
    }
    return snapshot.exists() ? (snapshot.data() as T) : null;
  }

  async create(item: T): Promise<void> {
    const uid = this.getUid();
    if (!uid) {
      console.warn(`[FirebaseAsyncRepository] Attempted to create in ${this.collectionName} without an authenticated user.`);
      return;
    }
    const guard = AuthLifecycle.createGuard();
    const docPath = this.getDocPath(item.id)!;
    
    const docRef = fs.doc(this.db, docPath);
    const existing = await fs.getDoc(docRef);
    if (existing.exists()) {
      throw new Error(`Item with id ${item.id} already exists`);
    }

    if (guard.isStale()) {
      throw new Error(`Repository operation aborted: Identity changed during create.`);
    }

    await fs.setDoc(docRef, this.sanitizePayload(item));
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    const uid = this.getUid();
    if (!uid) {
      console.warn(`[FirebaseAsyncRepository] Attempted to update in ${this.collectionName} without an authenticated user.`);
      return;
    }
    const guard = AuthLifecycle.createGuard();
    const docRef = fs.doc(this.db, this.getDocPath(id)!);
    
    const existing = await fs.getDoc(docRef);
    if (!existing.exists()) {
      throw new Error(`Item with id ${id} not found`);
    }

    if (guard.isStale()) {
      throw new Error(`Repository operation aborted: Identity changed during update.`);
    }

    await fs.setDoc(docRef, this.sanitizePayload(changes), { merge: true });
  }

  async delete(id: string): Promise<void> {
    const uid = this.getUid();
    if (!uid) {
      console.warn(`[FirebaseAsyncRepository] Attempted to delete in ${this.collectionName} without an authenticated user.`);
      return;
    }
    const guard = AuthLifecycle.createGuard();
    const docRef = fs.doc(this.db, this.getDocPath(id)!);

    const existing = await fs.getDoc(docRef);
    if (!existing.exists()) {
      throw new Error(`Item with id ${id} not found`);
    }

    if (guard.isStale()) {
      throw new Error(`Repository operation aborted: Identity changed during delete.`);
    }

    await fs.deleteDoc(docRef);
  }

  async saveAll(items: T[]): Promise<void> {
    const uid = this.getUid();
    if (!uid) {
      console.warn(`[FirebaseAsyncRepository] Attempted to saveAll to ${this.collectionName} without an authenticated user.`);
      return;
    }
    
    const guard = AuthLifecycle.createGuard();
    const colPath = this.getCollectionPath()!;
    
    const CHUNK_SIZE = 450; 
    const importedIds = new Set(items.map(item => item.id));

    // PHASE A: Upsert
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const batch = fs.writeBatch(this.db);
      for (const item of chunk) {
        const docRef = fs.doc(this.db, `${colPath}/${item.id}`);
        batch.set(docRef, this.sanitizePayload(item)); 
      }
      
      if (guard.isStale()) throw new Error(`Repository operation aborted: Identity changed during saveAll upsert.`);
      await batch.commit();
    }

    // PHASE C: Query
    if (guard.isStale()) throw new Error(`Repository operation aborted: Identity changed during saveAll read.`);
    const colRef = fs.collection(this.db, colPath);
    const snapshot = await fs.getDocs(colRef);
    
    const docsToDelete: string[] = [];
    for (const d of snapshot.docs) {
      if (!importedIds.has(d.id)) {
        docsToDelete.push(d.id);
      }
    }

    // PHASE D: Delete unmatched
    for (let i = 0; i < docsToDelete.length; i += CHUNK_SIZE) {
      const chunk = docsToDelete.slice(i, i + CHUNK_SIZE);
      const batch = fs.writeBatch(this.db);
      for (const id of chunk) {
        const docRef = fs.doc(this.db, `${colPath}/${id}`);
        batch.delete(docRef);
      }
      
      if (guard.isStale()) throw new Error(`Repository operation aborted: Identity changed during saveAll cleanup.`);
      await batch.commit();
    }
  }

  subscribe(onData: (items: T[]) => void): () => void {
    const uid = this.getUid();
    if (!uid) {
      return () => {};
    }
    
    const colRef = fs.collection(this.db, this.getCollectionPath()!);
    const unsubscribe = fs.onSnapshot(colRef, (snapshot) => {
      if (this.getUid() !== uid) {
         return; 
      }
      const items = snapshot.docs.map(doc => doc.data() as T);
      onData(items);
    }, (error) => {
      console.error(`[FirebaseAsyncRepository] subscribe error for ${this.collectionName}:`, error);
    });

    return unsubscribe;
  }
}
