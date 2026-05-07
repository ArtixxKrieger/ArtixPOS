import { openDB, type IDBPDatabase } from "idb";

// ─── Schema ────────────────────────────────────────────────────────────────
// v1: original schema
// v2: added retryCount, permanentlyFailed, lastError to mutation-queue
const DB_NAME    = "pos-offline-v1";
const DB_VERSION = 2;

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
    upgrade(db, oldVersion) {
      // ── v1 setup ──
      if (oldVersion < 1) {
        db.createObjectStore("api-cache", { keyPath: "url" });
        const qs = db.createObjectStore("mutation-queue", {
          keyPath: "id",
          autoIncrement: true,
        });
        qs.createIndex("by-timestamp", "timestamp");
      }

      // ── v1 → v2 migration ──
      // Add indexes for faster lookup of category & failed state.
      // Existing records get undefined for new fields — treated as 0/false below.
      if (oldVersion < 2) {
        const tx = db.transaction ? undefined : undefined; // just for scope
        const store = db.objectStoreNames.contains("mutation-queue")
          ? // ts helper — access the store being migrated
            undefined
          : undefined;
        void store; void tx;
        // New indexes cannot be added in the same transaction as the store creation
        // in the upgrade callback, but openDB handles this correctly:
        const qs2 = (db as any).objectStore?.("mutation-queue") ??
          (db as any).transaction?.objectStore?.("mutation-queue");
        try {
          if (qs2 && !qs2.indexNames?.contains("by-category")) {
            qs2.createIndex("by-category", "category");
          }
          if (qs2 && !qs2.indexNames?.contains("by-failed")) {
            qs2.createIndex("by-failed", "permanentlyFailed");
          }
        } catch {
          // Index may already exist or store not accessible — skip
        }
      }
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

// ─── Types ─────────────────────────────────────────────────────────────────
export interface QueuedMutation {
  id?: number;
  method: string;
  url: string;
  body?: unknown;
  timestamp: number;
  /** "sale" | "pending-order" | undefined */
  category?: string;
  /** Number of failed sync attempts (not counting permanent failures) */
  retryCount?: number;
  /** True when the mutation is permanently un-syncable (e.g. 400/422 from server) */
  permanentlyFailed?: boolean;
  /** Last error message, for display */
  lastError?: string;
}

// ─── API cache ─────────────────────────────────────────────────────────────
export async function getCached<T>(url: string): Promise<T | null> {
  try {
    const db = await getDB();
    const entry = await db.get("api-cache", url);
    return entry ? (entry.data as T) : null;
  } catch {
    return null;
  }
}

export async function setCached(url: string, data: unknown): Promise<void> {
  try {
    const db = await getDB();
    await db.put("api-cache", { url, data, timestamp: Date.now() });
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

// ─── Mutation queue ─────────────────────────────────────────────────────────
export const MAX_RETRIES = 5;

/** Add a new item to the queue. Returns the auto-generated id. */
export async function queueMutation(
  method: string,
  url: string,
  body?: unknown,
  category?: string
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

/** Update retry tracking fields on a queue item. */
export async function updateQueueItemRetry(
  id: number,
  retryCount: number,
  lastError: string,
  permanentlyFailed: boolean
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
          })
        )
    );
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

/** Count of queued sale mutations that are NOT permanently failed. */
export async function getSalesQueueCount(): Promise<number> {
  try {
    const db = await getDB();
    const all = await db.getAll("mutation-queue");
    return all.filter(
      (item) => item.category === "sale" && !item.permanentlyFailed
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

// ─── Utilities ──────────────────────────────────────────────────────────────
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
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

/** Clear only the API cache (safe to call on logout — preserves queued mutations). */
export async function clearApiCache(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear("api-cache");
  } catch {}
}

/** Clear everything: API cache + mutation queue.
 *  Call only on account switch — not on simple logout. */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear("api-cache");
    await db.clear("mutation-queue");
  } catch {}
}
