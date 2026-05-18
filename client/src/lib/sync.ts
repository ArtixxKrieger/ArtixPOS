import {
  getQueue,
  removeQueueItem,
  updateQueueItemRetry,
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

// ─── BroadcastChannel ───────────────────────────────────────────────────────
// Emits events to other open tabs so they can refresh their queue counts
// and online status without triggering a duplicate sync of their own.
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

// ─── Web Locks API — one-tab sync guard ────────────────────────────────────
// Ensures only one browser tab runs syncOfflineData at any time.
// Falls back gracefully when the Locks API is not available.
async function withSyncLock<T>(fn: () => Promise<T>): Promise<T & { skipped?: boolean }> {
  const locks = (navigator as any).locks as LockManager | undefined;
  if (!locks) return fn() as any;

  return new Promise<T & { skipped?: boolean }>((resolve, reject) => {
    locks.request(
      "pos-offline-sync",
      { ifAvailable: true },
      async (lock: Lock | null) => {
        if (!lock) {
          // Another tab already holds the lock — skip silently.
          resolve({ skipped: true } as any);
          return;
        }
        try { resolve(await fn() as any); }
        catch (err) { reject(err); }
      },
    );
  });
}

// ─── Types ─────────────────────────────────────────────────────────────────
export interface SyncResult {
  synced: number;
  failed: number;
  permanentlyFailed: number;
  errors: string[];
  skipped?: boolean;
}

// ─── Advanced queue folding ─────────────────────────────────────────────────
// Collapses logically redundant mutations before sending them to the server.
// All rules preserve intent: the final server state matches what the user did.
//
// Rules applied in order (each pass respects the toRemove set from prior passes):
//
//  1. Duplicate DELETEs to the same URL  → keep first (idempotent)
//  2. Multiple PUT/PATCH to same URL      → keep last  (last-write-wins)
//  3. PUT/PATCH before DELETE (same URL)  → remove PUT/PATCH
//  4. POST + DELETE (same temp-ID entity) → remove both (net no-op)
//  5. POST + PUT/PATCH (same temp-ID)     → merge body into POST, remove PUT/PATCH

function isKnownTempId(value: unknown): boolean {
  return isOfflineId(value) || isTempNumericId(value);
}

function entityUrlMatchesTempId(url: string, baseCollectionUrl: string, tempId: string | number): boolean {
  const idStr = String(tempId);
  // Guard: the URL must start with the same collection base (prevents
  // cross-collection false positives, e.g. /api/sales/123 matching a POST to
  // /api/products when both happen to share the same temp ID string).
  // Then check the last path segment equals the temp ID.
  return url.startsWith(baseCollectionUrl) && url.endsWith(`/${idStr}`);
}

export function foldQueue(queue: QueuedMutation[]): QueuedMutation[] {
  if (queue.length <= 1) return queue;

  const toRemove = new Set<number>();

  // ── Pass 1: Duplicate DELETEs to same URL → keep first ──────────────────
  const seenDeleteUrls = new Set<string>();
  for (const item of queue) {
    if (item.method !== "DELETE") continue;
    if (seenDeleteUrls.has(item.url)) {
      toRemove.add(item.id!);
    } else {
      seenDeleteUrls.add(item.url);
    }
  }

  // ── Pass 2: Multiple PUT/PATCH to same URL → keep last ──────────────────
  const putsByUrl = new Map<string, QueuedMutation[]>();
  for (const item of queue) {
    if (toRemove.has(item.id!)) continue;
    if (item.method !== "PUT" && item.method !== "PATCH") continue;
    const arr = putsByUrl.get(item.url) ?? [];
    arr.push(item);
    putsByUrl.set(item.url, arr);
  }
  for (const items of putsByUrl.values()) {
    // items are already in timestamp order (queue is sorted oldest→newest)
    for (let i = 0; i < items.length - 1; i++) {
      toRemove.add(items[i].id!);
    }
  }

  // ── Pass 3: PUT/PATCH that comes BEFORE a DELETE to same URL → remove PUT ─
  // Re-derive active DELETEs after pass 1
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

  // ── Pass 4: POST + DELETE for same temp-ID entity → remove both ──────────
  for (const post of queue) {
    if (toRemove.has(post.id!)) continue;
    if (post.method !== "POST") continue;

    const baseUrl = post.url; // e.g. /api/products
    const tempId  = post.offlineId;

    for (const other of queue) {
      if (toRemove.has(other.id!)) continue;
      if (other.id === post.id) continue;
      if (other.method !== "DELETE") continue;
      if (other.timestamp <= post.timestamp) continue; // DELETE must come after POST

      let matches = false;

      // Explicit offlineId match
      if (tempId != null) {
        matches = entityUrlMatchesTempId(other.url, baseUrl, tempId);
      }

      // Heuristic: any DELETE whose last URL segment is a known temp ID
      // and whose URL starts with the same base path
      if (!matches) {
        const lastSeg = other.url.split("/").pop() ?? "";
        if (isKnownTempId(lastSeg)) {
          // baseUrl could be /api/products, other.url = /api/products/1234567890
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

  // ── Pass 5: POST + PUT/PATCH for same temp-ID entity → merge body ─────────
  // For any POST that survived pass 4, look for a later PUT/PATCH that targets
  // the same temp entity. Merge the PUT body into the POST body and remove PUT.
  // This means "create + immediately edit" becomes a single correct POST.
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

      // Merge other.body into post.body
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

// ─── Error classification ───────────────────────────────────────────────────
function isPermanentFailure(status: number): boolean {
  // 400/422 — bad data that will never succeed
  // 401/403 — auth/permission issue (user needs to re-login)
  // 413      — payload too large; won't shrink on retry
  return [400, 401, 403, 413, 422].includes(status);
}

// ─── Process a single mutation ─────────────────────────────────────────────
interface ProcessResult {
  /** For successful POSTs: the server-assigned ID, so we can remap the queue. */
  serverId?: string | number;
}

async function processMutation(item: QueuedMutation): Promise<ProcessResult> {
  const res = await nativeFetch(item.url, {
    method: item.method,
    headers: item.body ? { "Content-Type": "application/json" } : {},
    body: item.body ? JSON.stringify(item.body) : undefined,
  });

  // 404 on DELETE is fine — item was already gone
  if (res.status === 404 && item.method === "DELETE") return {};

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    const msg = `HTTP ${res.status}: ${text.slice(0, 200)}`;
    const err = new Error(msg) as Error & { isPermanent: boolean };
    err.isPermanent = isPermanentFailure(res.status);
    throw err;
  }

  // For POSTs with a known offline ID: parse the response to get the real ID.
  // We use res.clone() so the body is still readable by any caller above us.
  if (item.method === "POST" && item.offlineId != null) {
    try {
      const body = await res.clone().json();
      const serverId = body?.id;
      if (serverId != null) return { serverId };
    } catch {}
  }

  return {};
}

// ─── Derive query keys to invalidate from mutated URLs ─────────────────────
// Instead of a fixed allow-list, we derive which collections were touched and
// invalidate exactly those. Dashboard is always included (any mutation can
// affect analytics totals).
const ALWAYS_INVALIDATE = [
  ["/api/dashboard"],
  ["/api/analytics"],
  ["/api/reports"],
];

function deriveInvalidationKeys(synced: QueuedMutation[]): string[][] {
  const bases = new Set<string>();
  for (const item of synced) {
    // Extract the first two path segments: /api/<collection>
    const m = item.url.match(/^(\/api\/[a-z-]+)/i);
    if (m) bases.add(m[1]);
  }
  return [
    ...Array.from(bases).map((b) => [b]),
    ...ALWAYS_INVALIDATE,
  ];
}

// ─── Main sync function ─────────────────────────────────────────────────────
export async function syncOfflineData(): Promise<SyncResult> {
  return withSyncLock(async () => {
    const rawQueue = await getQueue();
    if (rawQueue.length === 0) {
      return { synced: 0, failed: 0, permanentlyFailed: 0, errors: [] };
    }

    broadcast({ type: "SYNC_START" });

    // ── Fold redundant mutations before sending anything ──────────────────
    const folded = foldQueue(rawQueue);

    // Remove folded-out items from IDB
    const foldedIds = new Set(folded.map((q) => q.id!));
    await Promise.all(
      rawQueue
        .filter((q) => !foldedIds.has(q.id!))
        .map((q) => removeQueueItem(q.id!))
    );

    // Skip permanently-failed items (re-tried only via retryFailedMutations)
    const actionable = folded.filter((q) => !q.permanentlyFailed);

    const result: SyncResult = {
      synced: 0,
      failed: 0,
      permanentlyFailed: folded.filter((q) => q.permanentlyFailed).length,
      errors: [],
    };

    const successfullySynced: QueuedMutation[] = [];
    const now = Date.now();

    // ── Process in timestamp order (oldest first) ─────────────────────────
    for (const item of actionable) {
      // Per-item back-off: skip if we're not past the cooldown yet
      if (item.nextRetryAt && item.nextRetryAt > now) {
        result.failed++;
        continue;
      }

      try {
        const { serverId } = await processMutation(item);
        await removeQueueItem(item.id!);
        successfullySynced.push(item);
        result.synced++;

        // ID remapping: after a POST succeeds, any later queue items that
        // reference the temp offline ID are rewritten to use the real server ID.
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
          // Set a per-item cooldown so we don't hammer the server on every poll
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

    // ── Targeted cache invalidation ───────────────────────────────────────
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

/** Reset all permanently-failed items and re-run sync. */
export async function retryFailedMutations(): Promise<SyncResult> {
  await resetFailedQueueItems();
  return syncOfflineData();
}

/** Invalidate all tracked queries (use when coming back online without a pending queue). */
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
    ["/api/staff"],
    ["/api/shifts"],
  ];
  await Promise.all(
    keys.map((key) => queryClient.invalidateQueries({ queryKey: key }))
  );
}
