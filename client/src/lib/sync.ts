import {
  getQueue,
  removeQueueItem,
  updateQueueItemRetry,
  resetFailedQueueItems,
  type QueuedMutation,
  MAX_RETRIES,
} from "./offline-db";
import { queryClient, nativeFetch } from "./queryClient";

// ─── Query keys to invalidate after sync ───────────────────────────────────
const SYNC_QUERY_KEYS = [
  ["/api/products"],
  ["/api/sales"],
  ["/api/pending-orders"],
  ["/api/customers"],
  ["/api/expenses"],
  ["/api/purchase-orders"],
];

// ─── Types ─────────────────────────────────────────────────────────────────
export interface SyncResult {
  synced: number;
  failed: number;
  permanentlyFailed: number;
  errors: string[];
}

// ─── Queue folding — collapse redundant create+delete pairs ────────────────
function isTempNumericId(id: string | number): boolean {
  // Offline-created pending orders get id = Date.now() (> 1.5 trillion in 2024+)
  const n = Number(id);
  return Number.isFinite(n) && n > 1_500_000_000_000;
}

function extractPendingOrderId(url: string): string | null {
  const m = url.match(/\/api\/pending-orders\/(\d+)$/);
  return m ? m[1] : null;
}

/** Remove create+delete pairs for temp-id pending orders — they cancel out. */
function foldQueue(queue: QueuedMutation[]): QueuedMutation[] {
  const toRemove = new Set<number>();

  const pendingOrderCreates = new Map<number, QueuedMutation>();
  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    if (q.method === "POST" && q.url === "/api/pending-orders") {
      pendingOrderCreates.set(i, q);
    }
  }

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (item.method !== "DELETE") continue;
    const pendingId = extractPendingOrderId(item.url);
    if (!pendingId || !isTempNumericId(pendingId)) continue;

    for (const [idx, createItem] of pendingOrderCreates) {
      if (idx < i && !toRemove.has(createItem.id!)) {
        toRemove.add(createItem.id!);
        toRemove.add(item.id!);
        break;
      }
    }
  }

  return queue.filter((q) => !toRemove.has(q.id!));
}

// ─── Error classification ───────────────────────────────────────────────────
/**
 * Returns true if this HTTP status means the request should NEVER be retried.
 * E.g. bad data (400/422) will always fail, so mark as permanently failed.
 * 404/409 are treated as retryable to handle eventual consistency.
 * 5xx and network errors are transient — retry with backoff.
 */
function isPermanentFailure(status: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 422;
}

// ─── Process a single mutation ─────────────────────────────────────────────
async function processMutation(item: QueuedMutation): Promise<void> {
  const res = await nativeFetch(item.url, {
    method: item.method,
    headers: item.body ? { "Content-Type": "application/json" } : {},
    body: item.body ? JSON.stringify(item.body) : undefined,
  });

  // 404 on DELETE is fine — item was already gone
  if (res.status === 404 && item.method === "DELETE") return;

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    const msg = `HTTP ${res.status}: ${text.slice(0, 200)}`;
    // Attach whether this is a permanent failure so the caller can decide
    const err = new Error(msg) as Error & { isPermanent: boolean };
    err.isPermanent = isPermanentFailure(res.status);
    throw err;
  }
}

// ─── Main sync function ─────────────────────────────────────────────────────
export async function syncOfflineData(): Promise<SyncResult> {
  const rawQueue = await getQueue();
  if (rawQueue.length === 0) {
    return { synced: 0, failed: 0, permanentlyFailed: 0, errors: [] };
  }

  // Fold away create+delete pairs for temp-id pending orders
  const folded = foldQueue(rawQueue);

  // Remove folded-out items from IDB
  const foldedIds = new Set(folded.map((q) => q.id!));
  await Promise.all(
    rawQueue
      .filter((q) => !foldedIds.has(q.id!))
      .map((q) => removeQueueItem(q.id!))
  );

  // Skip items that are permanently failed (will be retried only via retryFailed)
  const actionable = folded.filter((q) => !q.permanentlyFailed);

  const result: SyncResult = {
    synced: 0,
    failed: 0,
    permanentlyFailed: folded.filter((q) => q.permanentlyFailed).length,
    errors: [],
  };

  // Process in timestamp order (oldest first) — each item is independent
  for (const item of actionable) {
    try {
      await processMutation(item);
      await removeQueueItem(item.id!);
      result.synced++;
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryCount = (item.retryCount ?? 0) + 1;
      const permanent = err.isPermanent === true || retryCount >= MAX_RETRIES;

      if (permanent) {
        // Mark as permanently failed — won't auto-retry
        await updateQueueItemRetry(item.id!, retryCount, msg, true);
        result.permanentlyFailed++;
      } else {
        // Transient failure — increment retry count, try again next sync
        await updateQueueItemRetry(item.id!, retryCount, msg, false);
        result.failed++;
      }

      result.errors.push(
        `[${item.category ?? item.method}] ${msg}${permanent ? " (PERMANENT)" : ` (attempt ${retryCount}/${MAX_RETRIES})`}`
      );
    }
  }

  // Invalidate only the queries that offline mutations can affect
  await Promise.all(
    SYNC_QUERY_KEYS.map((key) =>
      queryClient.invalidateQueries({ queryKey: key })
    )
  );

  return result;
}

/** Reset all permanently-failed items and re-run sync. */
export async function retryFailedMutations(): Promise<SyncResult> {
  await resetFailedQueueItems();
  return syncOfflineData();
}

/** Invalidate all tracked queries (use when coming back online without sync). */
export async function refreshAllData(): Promise<void> {
  await Promise.all(
    SYNC_QUERY_KEYS.map((key) =>
      queryClient.invalidateQueries({ queryKey: key })
    )
  );
}
