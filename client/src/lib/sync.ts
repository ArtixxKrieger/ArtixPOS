import {
  getQueue,
  removeQueueItem,
  updateQueueItemRetry,
  updateQueueItemBody,
  resetFailedQueueItems,
  remapQueueItemUrls,
  calcNextRetryAt,
  type QueuedMutation,
  MAX_RETRIES,
  SYNC_CHANNEL_NAME,
  isOfflineId,
  isTempNumericId,
} from "./offline-db";
import { queryClient, nativeFetch } from "./queryClient";

export type SyncChannelMessage =
  | { type: "SYNC_START" }
  | { type: "SYNC_COMPLETE"; result: SyncResult; ts: number }
  | { type: "QUEUE_CHANGED" };

let _channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!_channel) {
    try { _channel = new BroadcastChannel(SYNC_CHANNEL_NAME); } catch { return null; }
  }
  return _channel;
}
function broadcast(msg: SyncChannelMessage) {
  try { getChannel()?.postMessage(msg); } catch {}
}

async function withSyncLock<T>(fn: () => Promise<T>): Promise<T & { skipped?: boolean }> {
  const locks = (navigator as any).locks as LockManager | undefined;
  if (!locks) return fn() as any;

  return new Promise<T & { skipped?: boolean }>((resolve, reject) => {
    locks.request(
      "pos-offline-sync",
      { ifAvailable: true },
      async (lock: Lock | null) => {
        if (!lock) {

          resolve({ skipped: true } as any);
          return;
        }
        try { resolve(await fn() as any); }
        catch (err) { reject(err); }
      },
    );
  });
}

export interface SyncResult {
  synced: number;
  failed: number;
  permanentlyFailed: number;
  errors: string[];
  skipped?: boolean;
}

function isKnownTempId(value: unknown): boolean {
  return isOfflineId(value) || isTempNumericId(value);
}

function entityUrlMatchesTempId(url: string, baseCollectionUrl: string, tempId: string | number): boolean {
  const idStr = String(tempId);

return url.startsWith(baseCollectionUrl) && url.endsWith(`/${idStr}`);
}

export function foldQueue(queue: QueuedMutation[]): QueuedMutation[] {
  if (queue.length <= 1) return queue;

  const toRemove = new Set<number>();

  const seenDeleteUrls = new Set<string>();
  for (const item of queue) {
    if (item.method !== "DELETE") continue;
    if (seenDeleteUrls.has(item.url)) {
      toRemove.add(item.id!);
    } else {
      seenDeleteUrls.add(item.url);
    }
  }

  const putsByUrl = new Map<string, QueuedMutation[]>();
  for (const item of queue) {
    if (toRemove.has(item.id!)) continue;
    if (item.method !== "PUT" && item.method !== "PATCH") continue;
    const arr = putsByUrl.get(item.url) ?? [];
    arr.push(item);
    putsByUrl.set(item.url, arr);
  }
  for (const items of putsByUrl.values()) {

    for (let i = 0; i < items.length - 1; i++) {
      toRemove.add(items[i].id!);
    }
  }

const activeDeletes = new Map<string, QueuedMutation>();
  for (const item of queue) {
    if (toRemove.has(item.id!)) continue;
    if (item.method === "DELETE") activeDeletes.set(item.url, item);
  }
  for (const item of queue) {
    if (toRemove.has(item.id!)) continue;
    if (item.method !== "PUT" && item.method !== "PATCH") continue;
    const del = activeDeletes.get(item.url);
    if (del && del.timestamp > item.timestamp) {
      toRemove.add(item.id!);
    }
  }

  for (const post of queue) {
    if (toRemove.has(post.id!)) continue;
    if (post.method !== "POST") continue;

    const baseUrl = post.url;
    const tempId  = post.offlineId;

    for (const other of queue) {
      if (toRemove.has(other.id!)) continue;
      if (other.id === post.id) continue;
      if (other.method !== "DELETE") continue;
      if (other.timestamp <= post.timestamp) continue;

      let matches = false;

if (tempId != null) {
        matches = entityUrlMatchesTempId(other.url, baseUrl, tempId);
      }

if (!matches) {
        const lastSeg = other.url.split("/").pop() ?? "";
        if (isKnownTempId(lastSeg)) {

          const otherBase = other.url.substring(0, other.url.lastIndexOf("/"));
          if (otherBase === baseUrl) matches = true;
        }
      }

      if (matches) {
        toRemove.add(post.id!);
        toRemove.add(other.id!);
        break;
      }
    }
  }

for (const post of queue) {
    if (toRemove.has(post.id!)) continue;
    if (post.method !== "POST") continue;

    const tempId = post.offlineId;
    if (tempId == null) continue;

    const baseUrl = post.url;

    for (const other of queue) {
      if (toRemove.has(other.id!)) continue;
      if (other.id === post.id) continue;
      if (other.method !== "PUT" && other.method !== "PATCH") continue;
      if (other.timestamp <= post.timestamp) continue;
      if (!entityUrlMatchesTempId(other.url, baseUrl, tempId)) continue;

if (
        other.body !== null &&
        typeof other.body === "object" &&
        post.body !== null &&
        typeof post.body === "object"
      ) {
        (post as any).body = { ...(post.body as object), ...(other.body as object) };
      }
      toRemove.add(other.id!);
    }
  }

  return queue.filter((q) => !toRemove.has(q.id!));
}

function isPermanentFailure(status: number): boolean {

return [400, 401, 413, 422].includes(status);
}

interface ProcessResult {

  serverId?: string | number;
}

const SYNC_MUTATION_TIMEOUT_MS = 15_000;

async function processMutation(item: QueuedMutation): Promise<ProcessResult> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("Sync mutation timeout", "TimeoutError")),
    SYNC_MUTATION_TIMEOUT_MS,
  );

  let res: Response;
  try {
    res = await nativeFetch(item.url, {
      method: item.method,
      headers: item.body ? { "Content-Type": "application/json" } : {},
      body: item.body ? JSON.stringify(item.body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

if (res.status === 404 && item.method === "DELETE") return {};

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    const msg = `HTTP ${res.status}: ${text.slice(0, 200)}`;
    const err = new Error(msg) as Error & { isPermanent: boolean };
    err.isPermanent = isPermanentFailure(res.status);
    throw err;
  }

if (item.method === "POST" && item.offlineId != null) {
    try {
      const body = await res.clone().json();
      const serverId = body?.id;
      if (serverId != null) return { serverId };
    } catch {}
  }

  return {};
}

const ALWAYS_INVALIDATE = [
  ["/api/dashboard/stats"],
  ["/api/analytics"],
  ["/api/reports"],

["/api/sales"],
];

function deriveInvalidationKeys(synced: QueuedMutation[]): string[][] {
  const bases = new Set<string>();
  for (const item of synced) {

    const m = item.url.match(/^(\/api\/[a-z-]+)/i);
    if (m) bases.add(m[1]);
  }
  return [
    ...Array.from(bases).map((b) => [b]),
    ...ALWAYS_INVALIDATE,
  ];
}

export async function syncOfflineData(): Promise<SyncResult> {
  return withSyncLock(async () => {
    const rawQueue = await getQueue();
    if (rawQueue.length === 0) {
      return { synced: 0, failed: 0, permanentlyFailed: 0, errors: [] };
    }

    broadcast({ type: "SYNC_START" });

const originalBodies = new Map(rawQueue.map((q) => [q.id!, q.body]));

    const folded = foldQueue(rawQueue);

const foldedIds = new Set(folded.map((q) => q.id!));
    const bodyPersistPromises: Promise<void>[] = [];
    for (const item of folded) {
      if (item.method === "POST" && item.id != null) {
        const orig = originalBodies.get(item.id);

        if (JSON.stringify(orig) !== JSON.stringify(item.body)) {
          bodyPersistPromises.push(updateQueueItemBody(item.id, item.body));
        }
      }
    }

await Promise.all([
      ...bodyPersistPromises,
      ...rawQueue
        .filter((q) => !foldedIds.has(q.id!))
        .map((q) => removeQueueItem(q.id!)),
    ]);

const actionable = folded.filter((q) => !q.permanentlyFailed);

    const result: SyncResult = {
      synced: 0,
      failed: 0,
      permanentlyFailed: folded.filter((q) => q.permanentlyFailed).length,
      errors: [],
    };

    const successfullySynced: QueuedMutation[] = [];
    const now = Date.now();

    for (const item of actionable) {

      if (item.nextRetryAt && item.nextRetryAt > now) {
        result.failed++;
        continue;
      }

      try {
        const { serverId } = await processMutation(item);
        await removeQueueItem(item.id!);
        successfullySynced.push(item);
        result.synced++;

if (serverId != null && item.offlineId != null) {
          await remapQueueItemUrls(String(item.offlineId), String(serverId));
        }
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        const retryCount = (item.retryCount ?? 0) + 1;
        const permanent = err.isPermanent === true || retryCount >= MAX_RETRIES;

        if (permanent) {
          await updateQueueItemRetry(item.id!, retryCount, msg, true, undefined);
          result.permanentlyFailed++;
        } else {

          const nextRetryAt = calcNextRetryAt(retryCount);
          await updateQueueItemRetry(item.id!, retryCount, msg, false, nextRetryAt);
          result.failed++;
        }

        result.errors.push(
          `[${item.category ?? item.method}] ${msg}` +
          (permanent
            ? " (PERMANENT)"
            : ` (attempt ${retryCount}/${MAX_RETRIES})`),
        );
      }
    }

    if (successfullySynced.length > 0) {
      const keys = deriveInvalidationKeys(successfullySynced);
      await Promise.all(
        keys.map((key) => queryClient.invalidateQueries({ queryKey: key }))
      );
    }

    broadcast({ type: "SYNC_COMPLETE", result, ts: Date.now() });
    return result;
  });
}

export async function retryFailedMutations(): Promise<SyncResult> {
  await resetFailedQueueItems();
  return syncOfflineData();
}

export async function refreshAllData(): Promise<void> {
  const keys = [
    ...ALWAYS_INVALIDATE,
    ["/api/products"],
    ["/api/sales"],
    ["/api/pending-orders"],
    ["/api/customers"],
    ["/api/expenses"],
    ["/api/purchase-orders"],
    ["/api/inventory"],
    ["/api/appointments"],
    ["/api/service-staff"],
    ["/api/shifts"],
  ];
  await Promise.all(
    keys.map((key) => queryClient.invalidateQueries({ queryKey: key }))
  );
}
