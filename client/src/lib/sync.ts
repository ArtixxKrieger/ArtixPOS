import { getQueue, removeQueueItem, type QueuedMutation } from "./offline-db";
import { queryClient } from "./queryClient";

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
  const result = [...queue];
  const toRemove = new Set<number>();

  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    if (item.method !== "DELETE") continue;

    const pendingId = extractPendingOrderId(item.url);
    if (!pendingId || !isTempId(pendingId)) continue;

    const createIdx = result.findIndex(
      (q, idx) =>
        idx < i &&
        q.method === "POST" &&
        q.url === "/api/pending-orders" &&
        !toRemove.has(q.id!)
    );

    if (createIdx !== -1) {
      toRemove.add(result[createIdx].id!);
      toRemove.add(item.id!);
    }
  }

  return result.filter((q) => !toRemove.has(q.id!));
}

async function processMutation(item: QueuedMutation): Promise<void> {
  const res = await fetch(item.url, {
    method: item.method,
    headers: item.body ? { "Content-Type": "application/json" } : {},
    body: item.body ? JSON.stringify(item.body) : undefined,
    credentials: "include",
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

  await queryClient.invalidateQueries();

  return result;
}

export async function refreshAllData(): Promise<void> {
  await queryClient.invalidateQueries();
}
