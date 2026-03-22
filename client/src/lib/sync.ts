import { getQueue, removeQueueItem, type QueuedMutation } from "./offline-db";
import { queryClient } from "./queryClient";

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
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
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0, errors: [] };

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

  if (result.synced > 0) {
    await queryClient.invalidateQueries();
  }

  return result;
}
