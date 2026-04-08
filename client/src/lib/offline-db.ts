import { openDB, type IDBPDatabase } from "idb";

interface PosOfflineDB {
  "api-cache": {
    key: string;
    value: { url: string; data: unknown; timestamp: number };
  };
  "mutation-queue": {
    key: number;
    value: {
      id?: number;
      method: string;
      url: string;
      body?: unknown;
      timestamp: number;
      category?: string;
    };
    indexes: { "by-timestamp": number };
  };
}

let _db: IDBPDatabase<PosOfflineDB> | null = null;

async function getDB(): Promise<IDBPDatabase<PosOfflineDB>> {
  if (!_db) {
    _db = await openDB<PosOfflineDB>("pos-offline-v1", 1, {
      upgrade(db) {
        db.createObjectStore("api-cache", { keyPath: "url" });
        const qs = db.createObjectStore("mutation-queue", {
          keyPath: "id",
          autoIncrement: true,
        });
        qs.createIndex("by-timestamp", "timestamp");
      },
    });
  }
  return _db;
}

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

export interface QueuedMutation {
  id?: number;
  method: string;
  url: string;
  body?: unknown;
  timestamp: number;
  category?: string;
}

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
  })) as number;
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

export async function getQueueCount(): Promise<number> {
  try {
    const db = await getDB();
    return await db.count("mutation-queue");
  } catch {
    return 0;
  }
}

export async function getSalesQueueCount(): Promise<number> {
  try {
    const db = await getDB();
    const all = await db.getAll("mutation-queue");
    return all.filter((item) => item.category === "sale").length;
  } catch {
    return 0;
  }
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return false;
}

export function isOffline(): boolean {
  return !navigator.onLine;
}

export const OFFLINE_ID_PREFIX = "__offline__";

export function makeOfflineId(): string {
  return `${OFFLINE_ID_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function isOfflineId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith(OFFLINE_ID_PREFIX);
}

export async function clearAllCache(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear("api-cache");
    await db.clear("mutation-queue");
  } catch {}
}
