# NOVO Async-Compatible Repository Design (Amended)

## A. Current Architecture Summary
- **Interfaces**: Domain-specific synchronous interfaces (`ITaskRepository`, `IGoalRepository`, etc.).
- **Implementations**: `LocalTaskRepository`, etc., utilizing a `storageService` wrapper around `localStorage`.
- **Methods**: Array-based bulk reads and writes (`getAllSync()`, `saveAllSync()`, `getAll()`, `saveAll()`).
- **Granularity**: Low. A single CRUD operation inside a Zustand store triggers a full `saveAll()` of the entire domain array.
- **Store Lifecycle**: Zustand stores explicitly call `initialize()` and synchronously hydrate their local arrays.
- **Error Behavior**: Caught locally during the synchronous read/write. Quota errors revert optimistic state.

## B. Problems with Current Sync Contract
- **No Document Granularity**: Bulk `saveAll` is unviable for cloud databases like Firestore. Updating a single task would require uploading all tasks.
- **Concurrency & Data Loss**: If multiple devices update the same array with `saveAll`, the last write overwrites everything.
- **Sync Assumptions**: Hydration is fully synchronous. Cloud architectures require asynchronous hydration steps and loading UI states.
- **No User Scoping**: All users share the exact same `localStorage` key. Data isolation does not exist.

## C. Proposed Async Repository Contract (Amended)
Transition to document-level generic repository interfaces, intrinsically scoped to a specific user context:

```typescript
export interface IAsyncRepository<T> {
  // Initialization & Hydration
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  
  // Document-level CRUD
  create(item: T): Promise<void>;
  update(id: string, changes: Partial<T>): Promise<void>;
  delete(id: string): Promise<void>;
}
```

## D. User Scoping Model (Amended)
Instead of forcing the UI or Zustand store to inject a `userId` into every CRUD operation, the repository instance itself is scoped to the authenticated user upon creation.
- **Auth Provider**: Establishes the authenticated user context.
- **Factory Scope**: `RepositoryFactory` yields user-scoped repository instances (e.g., `RepositoryFactory.createForUser(userId).getTasks()`).
- **Isolation Enforcement**: The Zustand store fetches the pre-scoped repository during `initialize()`. UI actions cannot arbitrarily supply a different user's UID to read or write data.
- **Server Validation**: Firestore Security Rules strictly validate that `request.auth.uid` matches the user scope of the accessed document path.

## E. Firestore Mapping & Domain References (Amended)
- **Tasks**: `users/{userId}/tasks/{taskId}`
- **Goals**: `users/{userId}/goals/{goalId}`
- **Notes**: `users/{userId}/notes/{noteId}`
- **Knowledge**: `users/{userId}/knowledge/{knowledgeId}`
- **Focus Sessions**: `users/{userId}/focus_sessions/{sessionId}`
- **Money Transactions**: `users/{userId}/transactions/{transactionId}`
- **Conversations**: `users/{userId}/conversations/{conversationId}`

**Cross-Domain References Strategy**:
We strictly use stable string IDs (foreign keys) rather than embedding full domain objects. This prevents circular repository dependencies and unbounded document growth.
- `Task` references `Goal` via `goalId: string`
- `KnowledgeItem` references `Note` via `noteId: string` and `Goal` via `goalId: string`
- `FocusSession` references `Task` via `taskId: string` and `Goal` via `goalId: string`

## F. Chat Storage Decision (Amended)
**RECOMMENDATION**: Conversation document + `messages` subcollection (`users/{userId}/conversations/{conversationId}/messages/{messageId}`).
- *Reasoning*: A single document has a strict 1MB size limit. AI context bounding limits the *number of messages sent to the model*, but users expect to retain their full chat history over time. 
- *Benefits*: Storing messages in a subcollection allows infinite history growth, safe pagination, targeted per-message writes, and avoids hitting document size limits.

## G. CRUD Strategy
Move completely from `saveAll` to document-level operations.
- **Creation**: `createItem(item)` updates local state immediately (Optimistic UI) and calls `repository.create(item)`.
- **Updates**: `updateItem(id, changes)` updates local state, calls `repository.update(id, changes)`.
- **Deletions**: `deleteItem(id)` removes local state, calls `repository.delete(id)`.

## H. Offline / Write Semantics (Amended)
It is critical to distinguish the lifecycle of an async write:
1. **Optimistic UI**: Zustand updates immediately before the repository is called.
2. **Repository Write Requested**: `await repository.update(...)` is called.
3. **Queue Acknowledged (Resolved Promise)**: The Firebase SDK resolves the Promise *as soon as the write is accepted into the local offline queue*. This does **not** mean it has reached the server yet.
4. **Remote Persistence**: The Firebase SDK syncs the queue to the cloud in the background.
5. **Write Failure / Rollback**: If a severe validation/permission error occurs (caught either immediately or via a rejected Promise from a failed queue sync), the Zustand store must catch the error and roll back the specific document change locally.

## I. Money Precision Note
Financial amounts must not rely blindly on JavaScript floating-point arithmetic for persisted monetary values.
- *Recommendation*: Migrate to integer minor units (e.g., cents) for Firestore persistence to guarantee precision during aggregation and synchronization. The UI handles formatting/conversion.

## J. Migration Order (Amended)
1. **Goals**: Foundational. Zero dependencies on other domains. High value for early async validation.
2. **Tasks**: Dependent on Goals. Proves cross-domain reference model (`goalId`).
3. **Notes**: Independent. Medium complexity due to local draft/debounce persistence.
4. **Knowledge**: Dependent on Notes and Goals.
5. **Money**: Independent, but requires refactoring precision logic (integer cents).
6. **Chat**: Complex. Introduces subcollections and requires alignment with AI orchestrator lifecycle.
7. **Focus**: Most complex runtime model (singleton ephemeral timer + persistent sessions). Pushing this last ensures the core async foundations are rock-solid before touching timer state.

## K. Compatibility Strategy
**RECOMMENDATION**: Introduce the async canonical interface while temporarily keeping `localStorage` as an underlying implementation (`LocalAsyncRepository`).
- This decouples the massive architectural Zustand UI/Store changes from the Firebase networking integration.
- We build the document-level granular updates against `localStorage` first to ensure UI correctness, then swapping to Firebase becomes a simple factory toggle.

## L. Explicit list of things that should NOT be implemented yet
- Do NOT implement Firebase SDK.
- Do NOT rewrite Zustand stores.
- Do NOT delete existing sync repository methods.
- Do NOT build authentication logic.
- Do NOT convert `localStorage` implementations to async yet.

## M. Final Recommendation
**DESIGN APPROVED** (Pending actual implementation phase kickoff).

## V. Phase 9.2E-1 Implementation Notes
In Phase 9.2E-1, the foundational compatibility layer was introduced:
- **`IAsyncRepository<T>`**: The canonical asynchronous contract was added to `src/core/data/interfaces/index.ts`. All existing repository interfaces now extend this base contract (e.g., `ITaskRepository extends IAsyncRepository<Task>`), preserving domain-specific legacy methods alongside the new CRUD methods.
- **`LocalAsyncRepository<T>`**: Created at `src/core/data/repositories/local/LocalAsyncRepository.ts`. This adapter implements `IAsyncRepository<T>` while bridging back to the existing synchronous `localStorage` wrapper.
- **Sync Compatibility**: Legacy `getAllSync()` and `saveAllSync()` methods were preserved so that unmigrated Zustand stores remain fully functional without needing an immediate big-bang rewrite.
- **Read-Modify-Write Limitation**: Because `localStorage` does not natively support document-level updates, `LocalAsyncRepository` internally fetches the entire array synchronously, modifies the specific record, and rewrites the array. This is a local prototype limitation that avoids race conditions via synchronous locks, which is perfectly sufficient until Firestore is introduced.
- **Future Firebase Replacement**: `RepositoryFactory` continues to vend `Local...Repository` implementations. Once Firebase is authorized, the factory will be updated to vend `Firebase...Repository` implementations instead.
- **NOT Implemented Yet**:
  - Firebase SDK / Auth.
  - Granular optimistic rollbacks in Zustand stores (stores still use legacy bulk `saveAllSync`).
  - Auth lifecycle integration (`store.initialize(userId)`).
