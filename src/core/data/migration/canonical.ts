/**
 * Novo Gate 19.3B - Deterministic Canonicalization & Equality Helpers
 *
 * Provides pure utilities to canonicalize JavaScript objects representing
 * persisted entity structures, enabling deterministic comparison and deep equality.
 */

/**
 * Recursively canonicalizes a value:
 * 1. Primitives (strings, numbers, booleans, null) are returned as-is.
 * 2. Undefined is returned as undefined (will be omitted when inside plain objects).
 * 3. Arrays preserve their sequence order, with each element canonicalized.
 * 4. Plain objects have their keys sorted alphabetically, omitting keys whose value is undefined.
 * 5. Date objects are normalized to ISO string representation.
 */
export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  // Handle plain objects
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const canonicalObj: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    const val = obj[key];
    if (val !== undefined) {
      canonicalObj[key] = canonicalize(val);
    }
  }

  return canonicalObj;
}

/**
 * Returns a deterministic JSON string representation of a value.
 * Keys in plain objects are sorted alphabetically, and undefined keys are omitted.
 */
export function canonicalStringify(value: unknown): string {
  const canonical = canonicalize(value);
  return JSON.stringify(canonical);
}

/**
 * Performs a deterministic equality check between two values,
 * ignoring object key order and treating absent vs undefined object properties as equivalent.
 */
export function areCanonicallyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return canonicalStringify(a) === canonicalStringify(b);
}

export interface DiffResult {
  equal: boolean;
  path?: string;
  reason?: string;
  leftValue?: unknown;
  rightValue?: unknown;
}

/**
 * Identifies the first meaningful difference between two entity representations.
 * Returns equal: true if canonically identical, or the specific property path where they diverge.
 */
export function diffCanonical(a: unknown, b: unknown, currentPath = ''): DiffResult {
  const normA = canonicalize(a);
  const normB = canonicalize(b);

  if (normA === normB) {
    return { equal: true };
  }

  if (normA === null || normB === null || typeof normA !== 'object' || typeof normB !== 'object') {
    return {
      equal: false,
      path: currentPath || 'root',
      reason: `Primitive or null mismatch: ${JSON.stringify(normA)} !== ${JSON.stringify(normB)}`,
      leftValue: normA,
      rightValue: normB,
    };
  }

  const isArrA = Array.isArray(normA);
  const isArrB = Array.isArray(normB);

  if (isArrA !== isArrB) {
    return {
      equal: false,
      path: currentPath || 'root',
      reason: `Type mismatch: Array vs Object`,
      leftValue: normA,
      rightValue: normB,
    };
  }

  if (isArrA && isArrB) {
    const arrA = normA as unknown[];
    const arrB = normB as unknown[];
    if (arrA.length !== arrB.length) {
      return {
        equal: false,
        path: currentPath || 'root',
        reason: `Array length mismatch: ${arrA.length} !== ${arrB.length}`,
        leftValue: arrA.length,
        rightValue: arrB.length,
      };
    }
    for (let i = 0; i < arrA.length; i++) {
      const itemPath = currentPath ? `${currentPath}[${i}]` : `[${i}]`;
      const diff = diffCanonical(arrA[i], arrB[i], itemPath);
      if (!diff.equal) {
        return diff;
      }
    }
    return { equal: true };
  }

  // Both are plain objects with sorted keys
  const objA = normA as Record<string, unknown>;
  const objB = normB as Record<string, unknown>;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  // Check for keys present in objA but missing in objB
  for (const key of keysA) {
    const keyPath = currentPath ? `${currentPath}.${key}` : key;
    if (!(key in objB)) {
      return {
        equal: false,
        path: keyPath,
        reason: `Key "${key}" missing in target`,
        leftValue: objA[key],
        rightValue: undefined,
      };
    }
    const diff = diffCanonical(objA[key], objB[key], keyPath);
    if (!diff.equal) {
      return diff;
    }
  }

  // Check for keys present in objB but missing in objA
  for (const key of keysB) {
    const keyPath = currentPath ? `${currentPath}.${key}` : key;
    if (!(key in objA)) {
      return {
        equal: false,
        path: keyPath,
        reason: `Key "${key}" unexpected in target`,
        leftValue: undefined,
        rightValue: objB[key],
      };
    }
  }

  return { equal: true };
}
