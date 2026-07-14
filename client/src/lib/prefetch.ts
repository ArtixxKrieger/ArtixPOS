import { queryClient, getQueryFn } from "./queryClient";
import { getCached, pruneStaleCache } from "./offline-db";

const CRITICAL_URLS: readonly string[] = [
  "/api/settings",
  "/api/products",
  "/api/customers",
  "/api/pending-orders",
];

const OPERATIONAL_URLS: readonly string[] = [
  "/api/service-staff",
  "/api/tables",
  "/api/service-rooms",
  "/api/memberships",
  "/api/loyalty/tiers",
  "/api/discount-codes",
  "/api/ingredients",
];

const BACKGROUND_URLS: readonly string[] = [
  "/api/dashboard/stats",
  "/api/inventory",
  "/api/suppliers",
  "/api/expenses",
  "/api/appointments",
  "/api/shifts",
  "/api/subscription",
  "/api/notifications",
  "/api/admin/branches",
];

export const ALL_PREFETCH_URLS: readonly string[] = [
  ...CRITICAL_URLS,
  ...OPERATIONAL_URLS,
  ...BACKGROUND_URLS,
];

const LAST_UID_LS_KEY = "pos-last-uid";
const prefetchTsKey = (uid: string) => `artixpos_last_prefetch_${uid}`;

const prefetchedUsers = new Set<string>();

export function prefetchBootstrapData(userId: string): void {
  if (prefetchedUsers.has(userId)) return;
  prefetchedUsers.add(userId);

  pruneStaleCache(7 * 24 * 60 * 60 * 1000).catch(() => {});

  // Seed the cache from IndexedDB first so components have data immediately.
  for (const url of ALL_PREFETCH_URLS) {
    getCached<unknown>(url, Infinity)
      .then((cached) => {
        if (cached != null && queryClient.getQueryData([url]) === undefined) {
          queryClient.setQueryData([url], cached);
        }
      })
      .catch(() => {});
  }

  // Call the query function directly instead of fetchQuery so that a 401 (null)
  // result never touches the TanStack cache. fetchQuery stores the return value
  // before our cleanup runs, causing a brief null window that crashes any
  // component calling .filter()/.map() on the result.
  const qfn = getQueryFn({ on401: "returnNull" });

  async function fetchTier(urls: readonly string[], delayMs: number, label: string): Promise<void> {
    if (delayMs > 0) await new Promise<void>((r) => setTimeout(r, delayMs));
    console.log(`[prefetch ${new Date().toISOString().slice(11, 23)}] fetch ${label} (${urls.length} urls)`);
    await Promise.allSettled(
      urls.map(async (url) => {
        try {
          const data = await qfn({ queryKey: [url], signal: undefined, meta: {} } as any);
          if (data != null) {
            // Only write non-null data to the cache — null means 401/unauthed.
            queryClient.setQueryData([url], data);
          }
          // On null: leave the cache untouched (offline seed or undefined stays).
        } catch {}
      }),
    );
    console.log(`[prefetch ${new Date().toISOString().slice(11, 23)}] done ${label}`);
  }

  fetchTier(CRITICAL_URLS, 0, "critical")
    .then(() => fetchTier(OPERATIONAL_URLS, 200, "operational"))
    .then(() => fetchTier(BACKGROUND_URLS, 200, "background"))
    .catch(() => {});
}

export async function prefetchCriticalData(): Promise<void> {
  const qfn = getQueryFn({ on401: "returnNull" });
  await Promise.allSettled(
    CRITICAL_URLS.map(async (url) => {
      try {
        const data = await qfn({ queryKey: [url], signal: undefined, meta: {} } as any);
        if (data != null) {
          queryClient.setQueryData([url], data);
        }
      } catch {}
    }),
  );
}

export function clearPrefetchCache(): void {
  prefetchedUsers.clear();
  try {
    const uid = localStorage.getItem(LAST_UID_LS_KEY);
    if (uid) localStorage.removeItem(prefetchTsKey(uid));
  } catch {}
}
