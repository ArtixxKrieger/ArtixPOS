import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "pos-offline-v1";
const DB_VERSION = 3;

export const SYNC_CHANNEL_NAME = "pos-sync";

const LAST_USER_LS_KEY = "pos-last-uid";
let _currentUserId: string | null = null;

function cacheKey(url: string): string {
  return _currentUserId ? `${_currentUserId}:${url}` : url;
}

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
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        db.createObjectStore("api-cache", { keyPath: "url" });
        const qs = db.createObjectStore("mutation-queue", {
          keyPath: "id",
          autoIncrement: true,
        });
        qs.createIndex("by-timestamp", "timestamp");
      }

      if (oldVersion < 2) {
        try {
          const qs2 = transaction.objectStore("mutation-queue");
          if (!qs2.indexNames.contains("by-category")) {
            qs2.createIndex("by-category", "category");
          }
          if (!qs2.indexNames.contains("by-failed")) {
            qs2.createIndex("by-failed", "permanentlyFailed");
          }
        } catch {}
      }
    },
    blocked() {},
    blocking() {
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

  category?: string;

  retryCount?: number;

  permanentlyFailed?: boolean;

  lastError?: string;

  nextRetryAt?: number;

  offlineId?: string | number;
}

export async function getCached<T>(
  url: string,
  maxAgeMs: number = 24 * 60 * 60 * 1000,
): Promise<T | null> {
  if (!_currentUserId) return null;
  try {
    const db = await getDB();
    const entry = await db.get("api-cache", cacheKey(url));
    if (!entry) return null;

    if (entry.timestamp && maxAgeMs !== Infinity && Date.now() - entry.timestamp > maxAgeMs) {
      return null;
    }
    return entry.data as T;
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

export async function patchCached<T>(url: string, updater: (prev: T[]) => T[]): Promise<void> {
  try {
    const current = await getCached<T[]>(url);
    await setCached(url, updater(current ?? []));
  } catch {}
}

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

export async function pruneStaleCache(maxAgeMs: number): Promise<void> {
  if (!_currentUserId) return;
  try {
    const db = await getDB();
    const all = await db.getAll("api-cache");
    const cutoff = Date.now() - maxAgeMs;
    const tx = db.transaction("api-cache", "readwrite");
    for (const entry of all) {
      if (
        entry.timestamp &&
        entry.timestamp < cutoff &&
        entry.url.startsWith(`${_currentUserId}:`)
      ) {
        tx.store.delete(entry.url);
      }
    }
    await tx.done;
  } catch {}
}

export const MAX_RETRIES = 5;

export function calcNextRetryAt(retryCount: number): number {
  const base = 2_000;
  const backoff = Math.min(base * 2 ** retryCount, 5 * 60_000);
  const jitter = backoff * 0.2 * (Math.random() * 2 - 1);
  return Date.now() + Math.round(backoff + jitter);
}

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

export async function getQueue(): Promise<QueuedMutation[]> {
  try {
    const db = await getDB();
    return await db.getAllFromIndex("mutation-queue", "by-timestamp");
  } catch {
    return [];
  }
}

export async function removeQueueItem(id: number): Promise<void> {
  try {
    const db = await getDB();
    await db.delete("mutation-queue", id);
  } catch {}
}

export async function updateQueueItemBody(id: number, body: unknown): Promise<void> {
  try {
    const db = await getDB();
    const item = await db.get("mutation-queue", id);
    if (!item) return;
    await db.put("mutation-queue", { ...item, body });
  } catch {}
}

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
        (i) => (i.category === "sale" || i.category === "pending-order") && !i.permanentlyFailed,
      ).length,
    };
  } catch {
    return { sales: 0, total: 0, failed: 0 };
  }
}

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
          }),
        ),
    );
    await tx.done;
  } catch {}
}

export async function remapQueueItemUrls(oldId: string, newId: string): Promise<void> {
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
          try {
            newBody = JSON.parse(bodyStr.split(oldId).join(newId));
          } catch {}
        }
      }
      tx.store.put({ ...item, url: newUrl, body: newBody });
    }
    await tx.done;
  } catch {}
}

export async function getQueueCount(): Promise<number> {
  try {
    const db = await getDB();
    return await db.count("mutation-queue");
  } catch {
    return 0;
  }
}

export async function getSalesQueueCount(): Promise<number> {
  return (await getQueueStats()).sales;
}

export async function getFailedQueueCount(): Promise<number> {
  return (await getQueueStats()).failed;
}

export async function getFailedQueueItems(): Promise<QueuedMutation[]> {
  try {
    const db = await getDB();
    const all = await db.getAll("mutation-queue");
    return all.filter((item) => item.permanentlyFailed);
  } catch {
    return [];
  }
}

export async function discardQueueItem(id: number): Promise<void> {
  return removeQueueItem(id);
}

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
  if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError"))
    return true;
  return false;
}

export function isOffline(): boolean {
  return !navigator.onLine;
}

export const OFFLINE_ID_PREFIX = "__offline__";
let _offlineCounter = 0;

export function makeOfflineId(): string {
  _offlineCounter = (_offlineCounter + 1) % 1_000_000;
  return `${OFFLINE_ID_PREFIX}${Date.now()}_${_offlineCounter}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export function isOfflineId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith(OFFLINE_ID_PREFIX);
}

export function isTempNumericId(id: unknown): boolean {
  const n = Number(id);
  return Number.isFinite(n) && n > 1_500_000_000_000;
}

export async function clearApiCache(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear("api-cache");
  } catch {}
}

export async function clearAllCache(): Promise<void> {
  _currentUserId = null;
  try {
    const db = await getDB();
    await db.clear("api-cache");
    // NEVER clear mutation-queue here — offline sales and pending changes
    // must survive session expiry. Only explicit logout via performLogout
    // should drain the queue after syncing.
  } catch {}
}
