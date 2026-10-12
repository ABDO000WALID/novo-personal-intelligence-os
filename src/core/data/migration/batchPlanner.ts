/**
 * Novo Gate 19.3B - Pure Batch Planning Utility
 *
 * Partitions items into deterministic write chunks respecting both
 * operation-count limits and serialized byte-payload limits.
 */

import { canonicalStringify } from './canonical';

export class OversizedItemError extends Error {
  readonly itemId: string;
  readonly collection: string;
  readonly byteSize: number;
  readonly maxAllowedBytes: number;

  constructor(itemId: string, collection: string, byteSize: number, maxAllowedBytes: number) {
    super(
      `Item "${itemId}" in collection "${collection}" exceeds maximum allowed document size: ` +
      `${byteSize} bytes > ${maxAllowedBytes} bytes limit.`
    );
    this.name = 'OversizedItemError';
    this.itemId = itemId;
    this.collection = collection;
    this.byteSize = byteSize;
    this.maxAllowedBytes = maxAllowedBytes;
  }
}

export interface BatchItemInput<T = unknown> {
  id: string;
  collection: string;
  data: T;
  /**
   * Optional pre-calculated byte size. If not provided, it will be calculated using canonical UTF-8 size.
   */
  estimatedByteSize?: number;
}

export interface PlannedBatchItem<T = unknown> {
  id: string;
  collection: string;
  data: T;
  byteSize: number;
}

export interface BatchChunk<T = unknown> {
  chunkIndex: number;
  items: PlannedBatchItem<T>[];
  totalBytes: number;
  opCount: number;
}

export interface BatchPlanOptions {
  /**
   * Maximum operations allowed per batch chunk.
   * Default: 400 (Firestore hard limit is 500).
   */
  maxOpsPerBatch?: number;

  /**
   * Maximum total serialized byte size allowed per batch chunk.
   * Default: 2MB (2,097,152 bytes; Firestore hard limit is 10MB).
   */
  maxBytesPerBatch?: number;

  /**
   * Maximum serialized byte size allowed for a single item/document.
   * Default: 900KB (921,600 bytes; Firestore document limit is 1MB).
   */
  maxSingleItemBytes?: number;

  /**
   * If true, splits chunks when transitioning between distinct collections (e.g. tasks, goals).
   * Default: false.
   */
  groupByCollection?: boolean;
}

const DEFAULT_MAX_OPS = 400;
const DEFAULT_MAX_BATCH_BYTES = 2 * 1024 * 1024; // 2MB
const DEFAULT_MAX_SINGLE_ITEM_BYTES = 900 * 1024; // 900KB

const utf8Encoder = new TextEncoder();

/**
 * Calculates the exact UTF-8 byte size of an item's canonical JSON string.
 */
export function estimateItemByteSize(data: unknown): number {
  const json = canonicalStringify(data);
  return utf8Encoder.encode(json).byteLength;
}

/**
 * Plans migration items into batch chunks conforming to operation count and payload size limits.
 *
 * @throws {OversizedItemError} if any single item exceeds maxSingleItemBytes.
 */
export function planMigrationBatches<T = unknown>(
  items: ReadonlyArray<BatchItemInput<T>>,
  options?: BatchPlanOptions
): BatchChunk<T>[] {
  const maxOps = options?.maxOpsPerBatch ?? DEFAULT_MAX_OPS;
  const maxBatchBytes = options?.maxBytesPerBatch ?? DEFAULT_MAX_BATCH_BYTES;
  const maxSingleBytes = options?.maxSingleItemBytes ?? DEFAULT_MAX_SINGLE_ITEM_BYTES;

  if (maxOps <= 0) {
    throw new Error(`maxOpsPerBatch must be greater than 0, received ${maxOps}`);
  }
  if (maxBatchBytes <= 0) {
    throw new Error(`maxBytesPerBatch must be greater than 0, received ${maxBatchBytes}`);
  }
  if (maxSingleBytes <= 0) {
    throw new Error(`maxSingleItemBytes must be greater than 0, received ${maxSingleBytes}`);
  }

  // First pass: validate each item and determine exact byte size
  const plannedItems: PlannedBatchItem<T>[] = items.map((item) => {
    const byteSize = item.estimatedByteSize !== undefined
      ? item.estimatedByteSize
      : estimateItemByteSize(item.data);

    if (byteSize > maxSingleBytes) {
      throw new OversizedItemError(item.id, item.collection, byteSize, maxSingleBytes);
    }

    return {
      id: item.id,
      collection: item.collection,
      data: item.data,
      byteSize,
    };
  });

  const chunks: BatchChunk<T>[] = [];
  if (plannedItems.length === 0) {
    return chunks;
  }

  let currentChunkItems: PlannedBatchItem<T>[] = [];
  let currentChunkBytes = 0;

  for (const item of plannedItems) {
    const wouldExceedOps = currentChunkItems.length + 1 > maxOps;
    const wouldExceedBytes = currentChunkBytes + item.byteSize > maxBatchBytes;
    const isDifferentCollection =
      options?.groupByCollection &&
      currentChunkItems.length > 0 &&
      currentChunkItems[0].collection !== item.collection;

    if (currentChunkItems.length > 0 && (wouldExceedOps || wouldExceedBytes || isDifferentCollection)) {
      chunks.push({
        chunkIndex: chunks.length,
        items: currentChunkItems,
        totalBytes: currentChunkBytes,
        opCount: currentChunkItems.length,
      });
      currentChunkItems = [];
      currentChunkBytes = 0;
    }

    currentChunkItems.push(item);
    currentChunkBytes += item.byteSize;
  }

  if (currentChunkItems.length > 0) {
    chunks.push({
      chunkIndex: chunks.length,
      items: currentChunkItems,
      totalBytes: currentChunkBytes,
      opCount: currentChunkItems.length,
    });
  }

  return chunks;
}

/**
 * Returns the canonical document path for a planned batch item.
 */
export function getBatchItemDocPath(uid: string, item: { collection: string; id: string }): string {
  return `users/${uid}/${item.collection}/${item.id}`;
}
