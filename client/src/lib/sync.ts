import { getQueue, removeQueueItem, type QueuedMutation } from "./offline-db";
import { queryClient, nativeFetch } from "./queryClient";

// Queries that can be affected by offline mutations — invalidate only these
const SYNC_QUERY_KEYS = [
  ["/api/products"],
  ["/api/sales"],
  ["/api/pending-orders"],
  ["/api/customers"],
  ["/api/expenses"],
  ["/api/purchase-orders"],
];

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

function isTempId(id: string | number): boolean {
  const n = Number(id);
  return n > 1_000_000_000_000;
}

function extractPendingOrderId(url: string): string | null {
  const m = url.match(/\/api\/pending-orders\/(\d+)$/);
  return m ? m[1] : null;
}

function foldQueue(queue: QueuedMutation[]): QueuedMutation[] {
  const toRemove = new Set<number>();

  // Build a Map of POST /api/pending-orders items in a single O(N) pass
  // so the subsequent DELETE scan is O(N) instead of O(N²).
  const pendingOrderCreates = new Map<number, QueuedMutation>(); // index -> item
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
    if (!pendingId || !isTempId(pendingId)) continue;

    // Find the earliest un-removed POST for this pending order
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

async function processMutation(item: QueuedMutation): Promise<void> {
  const res = await nativeFetch(item.url, {
    method: item.method,
    headers: item.body ? { "Content-Type": "application/json" } : {},
    body: item.body ? JSON.stringify(item.body) : undefined,
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function syncOfflineData(): Promise<SyncResult> {
  const rawQueue = await getQueue();

  const queue = foldQueue(rawQueue);

  const cancelledIds = new Set(rawQueue.map((q) => q.id!));
  queue.forEach((q) => cancelledIds.delete(q.id!));
  for (const id of cancelledIds) {
    await removeQueueItem(id);
  }

  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  for (const item of queue) {
    try {
      await processMutation(item);
      await removeQueueItem(item.id!);
      result.synced++;
    } catch (err) {
      result.failed++;
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Invalidate only the queries that offline mutations can affect —
  // not everything (that would cause every screen to refetch simultaneously).
  await Promise.all(
    SYNC_QUERY_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: key }))
  );

  return result;
}

export async function refreshAllData(): Promise<void> {
  await Promise.all(
    SYNC_QUERY_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: key }))
  );
}
