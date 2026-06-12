import { openDB, type IDBPDatabase } from "idb";

// v1: original schema
// v2: added retryCount, permanentlyFailed, lastError to mutation-queue
// v3: added nextRetryAt, offlineId to mutation-queue
const DB_NAME    = "pos-offline-v1";
const DB_VERSION = 3;

export const SYNC_CHANNEL_NAME = "pos-sync";

// IDB api-cache keys are prefixed with the current user's ID so that cached
// data from User A can never be served to User B, even if network fails.
const LAST_USER_LS_KEY = "pos-last-uid";
let _currentUserId: string | null = null;

function cacheKey(url: string): string {
  return _currentUserId ? `${_currentUserId}:${url}` : url;
}

/**
 * Call once when the authenticated user is known (before any data fetching).
 * If the userId changed since the last session, wipes the entire api-cache so
 * no stale data from the previous account can leak through via IDB fallback.
 */
export async function initUserSession(userId: string): Promise<void> {
  const lastId = localStorage.getItem(LAST_USER_LS_KEY);
  if (lastId && lastId !== userId) {
    await clearAllCache();
  }
  localStorage.setItem(LAST_USER_LS_KEY, userId);
  _currentUserId = userId;
}

interface PosOfflineDB {
  "api-cache": {
    key: string;
    value: { url: string; data: unknown; timestamp: number };
  };
  "mutation-queue": {
    key: number;
    value: QueuedMutation & { id: number };
    indexes: {
      "by-timestamp": number;
      "by-category": string;
      "by-failed": number;
    };
  };
}

let _db: IDBPDatabase<PosOfflineDB> | null = null;

async function getDB(): Promise<IDBPDatabase<PosOfflineDB>> {
  if (_db) return _db;
  _db = await openDB<PosOfflineDB>(DB_NAME, DB_VERSION, {
    // The upgrade callback receives (db, oldVersion, newVersion, transaction).
    // We MUST use the `transaction` parameter to access existing object stores —
    // calling db.createObjectStore() again on an already-existing store would throw.
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        db.createObjectStore("api-cache", { keyPath: "url" });
        const qs = db.createObjectStore("mutation-queue", {
          keyPath: "id",
          autoIncrement: true,
        });
        qs.createIndex("by-timestamp", "timestamp");
      }

      // Use transaction.objectStore() — this is the only correct way to access
      // an existing store during an IDB version upgrade with the `idb` library.
      if (oldVersion < 2) {
        try {
          const qs2 = transaction.objectStore("mutation-queue");
          if (!qs2.indexNames.contains("by-category")) {
            qs2.createIndex("by-category", "category");
          }
          if (!qs2.indexNames.contains("by-failed")) {
            qs2.createIndex("by-failed", "permanentlyFailed");
          }
        } catch {
          // Defensive: index already exists or store not yet present in this tx
        }
      }

      // nextRetryAt and offlineId are new optional fields on existing records.
      // No index needed — we filter in JS (queue is always small < 100 items).
      // Existing records simply lack these fields and will be treated as
      // immediately retryable (nextRetryAt = undefined → no delay).
    },
    blocked() {
      // Another tab is holding an old DB version open — nothing we can do.
    },
    blocking() {
      // We're blocking a newer version in another tab — close our handle.
      _db?.close();
      _db = null;
    },
    terminated() {
      _db = null;
    },
  });
  return _db;
}

export interface QueuedMutation {
  id?: number;
  method: string;
  url: string;
  body?: unknown;
  timestamp: number;
  /** "sale" | "pending-order" | "product" | undefined */
  category?: string;
  /** Number of failed sync attempts (not counting permanent failures) */
  retryCount?: number;
  /** True when the mutation is permanently un-syncable (e.g. 400/422 from server) */
  permanentlyFailed?: boolean;
  /** Last error message, for display */
  lastError?: string;
  /**
   * Earliest time (ms epoch) this item should next be retried.
   * Undefined = immediately retryable.
   * Calculated as: Date.now() + BASE_BACKOFF * 2^retryCount after each failure.
   */
  nextRetryAt?: number;
  /**
   * For POST mutations: the temporary client-side ID assigned to the entity
   * that was optimistically created. Used by foldQueue (POST+DELETE→nothing,
   * POST+PUT→merge) and by ID remapping after the POST syncs and returns the
   * real server ID.
   */
  offlineId?: string | number;
}

export async function getCached<T>(url: string): Promise<T | null> {
  // Never serve IDB data when the session isn't initialized yet.
  if (!_currentUserId) return null;
  try {
    const db = await getDB();
    const entry = await db.get("api-cache", cacheKey(url));
    return entry ? (entry.data as T) : null;
  } catch {
    return null;
  }
}

export async function setCached(url: string, data: unknown): Promise<void> {
  if (!_currentUserId) return;
  try {
    const db = await getDB();
    await db.put("api-cache", { url: cacheKey(url), data, timestamp: Date.now() });
  } catch {}
}

export async function patchCached<T>(
  url: string,
  updater: (prev: T[]) => T[]
): Promise<void> {
  try {
    const current = await getCached<T[]>(url);
    await setCached(url, updater(current ?? []));
  } catch {}
}

/** Returns the age of a cached entry in ms, or null if not cached. */
export async function getCacheAge(url: string): Promise<number | null> {
  if (!_currentUserId) return null;
  try {
    const db = await getDB();
    const entry = await db.get("api-cache", cacheKey(url));
    if (!entry?.timestamp) return null;
    return Date.now() - entry.timestamp;
  } catch {
    return null;
  }
}

/**
 * Evict api-cache entries older than maxAgeMs.
 * Call once per session to prevent the IDB growing unbounded on long-running POS devices.
 */
export async function pruneStaleCache(maxAgeMs: number): Promise<void> {
  if (!_currentUserId) return;
  try {
    const db = await getDB();
    const all = await db.getAll("api-cache");
    const cutoff = Date.now() - maxAgeMs;
    const tx = db.transaction("api-cache", "readwrite");
    for (const entry of all) {
      // Only prune entries belonging to the current user (have the right prefix)
      if (entry.timestamp && entry.timestamp < cutoff && entry.url.startsWith(`${_currentUserId}:`)) {
        tx.store.delete(entry.url);
      }
    }
    await tx.done;
  } catch {}
}

export const MAX_RETRIES = 5;

/** Exponential backoff per retry attempt (ms). Cap at 5 min. */
export function calcNextRetryAt(retryCount: number): number {
  const base = 2_000; // 2 s
  const backoff = Math.min(base * 2 ** retryCount, 5 * 60_000);
  const jitter = backoff * 0.2 * (Math.random() * 2 - 1);
  return Date.now() + Math.round(backoff + jitter);
}

/**
 * Add a new item to the queue.
 * @param offlineId  Temporary client-side ID given to the optimistically-created
 *                   entity (for POST mutations only). Enables foldQueue to collapse
 *                   subsequent edits/deletes and remapQueueItemUrls to fix URLs
 *                   after the POST syncs and returns a real server ID.
 */
export async function queueMutation(
  method: string,
  url: string,
  body?: unknown,
  category?: string,
  offlineId?: string | number,
): Promise<number> {
  const db = await getDB();
  const id = (await db.add("mutation-queue", {
    method,
    url,
    body,
    timestamp: Date.now(),
    category,
    retryCount: 0,
    permanentlyFailed: false,
    offlineId,
  } as any)) as number;
  return id;
}

/** Read all queued mutations ordered by timestamp (oldest first). */
export async function getQueue(): Promise<QueuedMutation[]> {
  try {
    const db = await getDB();
    return await db.getAllFromIndex("mutation-queue", "by-timestamp");
  } catch {
    return [];
  }
}

/** Remove a single item from the queue. */
export async function removeQueueItem(id: number): Promise<void> {
  try {
    const db = await getDB();
    await db.delete("mutation-queue", id);
  } catch {}
}

/** Overwrite the body of a queued mutation without touching any other fields.
 *  Used after foldQueue merges a POST+PUT so the persisted POST body is
 *  up-to-date before the PUT is removed from IDB. */
export async function updateQueueItemBody(id: number, body: unknown): Promise<void> {
  try {
    const db = await getDB();
    const item = await db.get("mutation-queue", id);
    if (!item) return;
    await db.put("mutation-queue", { ...item, body });
  } catch {}
}

/** Read all queue stats in a single IDB scan (replaces 3 separate getAll calls). */
export async function getQueueStats(): Promise<{
  sales: number;
  total: number;
  failed: number;
}> {
  try {
    const db = await getDB();
    const all = await db.getAll("mutation-queue");
    return {
      total: all.length,
      failed: all.filter((i) => i.permanentlyFailed).length,
      sales: all.filter(
        (i) =>
          (i.category === "sale" || i.category === "pending-order") &&
          !i.permanentlyFailed,
      ).length,
    };
  } catch {
    return { sales: 0, total: 0, failed: 0 };
  }
}

/** Update retry tracking fields on a queue item. */
export async function updateQueueItemRetry(
  id: number,
  retryCount: number,
  lastError: string,
  permanentlyFailed: boolean,
  nextRetryAt?: number,
): Promise<void> {
  try {
    const db = await getDB();
    const item = await db.get("mutation-queue", id);
    if (!item) return;
    await db.put("mutation-queue", {
      ...item,
      retryCount,
      lastError,
      permanentlyFailed,
      ...(nextRetryAt !== undefined ? { nextRetryAt } : {}),
    });
  } catch {}
}

/** Reset all permanently-failed items so they'll be retried on next sync. */
export async function resetFailedQueueItems(): Promise<void> {
  try {
    const db = await getDB();
    const all = await db.getAll("mutation-queue");
    const tx = db.transaction("mutation-queue", "readwrite");
    await Promise.all(
      all
        .filter((item) => item.permanentlyFailed)
        .map((item) =>
          tx.store.put({
            ...item,
            permanentlyFailed: false,
            retryCount: 0,
            lastError: undefined,
            nextRetryAt: undefined,
          })
        )
    );
    await tx.done;
  } catch {}
}

/**
 * Scan all remaining queue items and replace every occurrence of oldId with
 * newId in both the URL and JSON body.  Call after a POST syncs successfully
 * and returns the real server-assigned ID so that subsequent queue items
 * (UPDATEs, DELETEs) targeting the temp ID are automatically corrected.
 */
export async function remapQueueItemUrls(
  oldId: string,
  newId: string,
): Promise<void> {
  if (!oldId || !newId || oldId === newId) return;
  try {
    const db = await getDB();
    const all = await db.getAll("mutation-queue");
    const toUpdate = all.filter(
      (item) =>
        item.url.includes(oldId) ||
        (item.body !== undefined && JSON.stringify(item.body).includes(oldId)),
    );
    if (toUpdate.length === 0) return;

    const tx = db.transaction("mutation-queue", "readwrite");
    for (const item of toUpdate) {
      const newUrl = item.url.split(oldId).join(newId);
      let newBody = item.body;
      if (item.body !== undefined) {
        const bodyStr = JSON.stringify(item.body);
        if (bodyStr.includes(oldId)) {
          try { newBody = JSON.parse(bodyStr.split(oldId).join(newId)); } catch {}
        }
      }
      tx.store.put({ ...item, url: newUrl, body: newBody });
    }
    await tx.done;
  } catch {}
}

/** Total count of queued items (including permanently-failed). */
export async function getQueueCount(): Promise<number> {
  try {
    const db = await getDB();
    return await db.count("mutation-queue");
  } catch {
    return 0;
  }
}

/** Count of queued sale / pending-order mutations that are NOT permanently failed.
 *  Counts both "sale" (useCreateSale) and "pending-order" (useCreatePendingOrder / POS checkout). */
export async function getSalesQueueCount(): Promise<number> {
  try {
    const db = await getDB();
    const all = await db.getAll("mutation-queue");
    return all.filter(
      (item) =>
        (item.category === "sale" || item.category === "pending-order") &&
        !item.permanentlyFailed,
    ).length;
  } catch {
    return 0;
  }
}

/** Count of permanently-failed mutations. */
export async function getFailedQueueCount(): Promise<number> {
  try {
    const db = await getDB();
    const all = await db.getAll("mutation-queue");
    return all.filter((item) => item.permanentlyFailed).length;
  } catch {
    return 0;
  }
}

/** Return full details for all permanently-failed mutations (for conflict UI). */
export async function getFailedQueueItems(): Promise<QueuedMutation[]> {
  try {
    const db = await getDB();
    const all = await db.getAll("mutation-queue");
    return all.filter((item) => item.permanentlyFailed);
  } catch {
    return [];
  }
}

/** Discard a single permanently-failed item from the queue (same as removeQueueItem). */
export async function discardQueueItem(id: number): Promise<void> {
  return removeQueueItem(id);
}

/** Discard all permanently-failed items from the queue. */
export async function discardAllFailedItems(): Promise<void> {
  try {
    const db = await getDB();
    const all = await db.getAll("mutation-queue");
    const failed = all.filter((item) => item.permanentlyFailed);
    await Promise.all(failed.map((item) => removeQueueItem(item.id!)));
  } catch {}
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError")) return true;
  return false;
}

export function isOffline(): boolean {
  return !navigator.onLine;
}

export const OFFLINE_ID_PREFIX = "__offline__";
let _offlineCounter = 0;

/** Generate a unique offline ID — guaranteed unique even within the same ms. */
export function makeOfflineId(): string {
  _offlineCounter = (_offlineCounter + 1) % 1_000_000;
  return `${OFFLINE_ID_PREFIX}${Date.now()}_${_offlineCounter}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export function isOfflineId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith(OFFLINE_ID_PREFIX);
}

/** True if id looks like a large-timestamp temp numeric id (> 2024-01-01 in ms). */
export function isTempNumericId(id: unknown): boolean {
  const n = Number(id);
  return Number.isFinite(n) && n > 1_500_000_000_000;
}

/** Clear only the API cache (safe to call on logout — preserves queued mutations). */
export async function clearApiCache(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear("api-cache");
  } catch {}
}

/** Clear everything: API cache + mutation queue. */
export async function clearAllCache(): Promise<void> {
  _currentUserId = null;
  try {
    const db = await getDB();
    await db.clear("api-cache");
    await db.clear("mutation-queue");
  } catch {}
}
