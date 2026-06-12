import { queryClient, getQueryFn } from "./queryClient";
import { getCached, pruneStaleCache } from "./offline-db";

export const ALL_PREFETCH_URLS: readonly string[] = [
  "/api/settings",
  "/api/subscription",
  "/api/dashboard/stats",
  "/api/notifications",
  "/api/pending-orders",
  "/api/products",
  "/api/customers",
  "/api/expenses",
  "/api/staff",
  "/api/suppliers",
  "/api/admin/branches",
  "/api/categories",
  "/api/memberships",
  "/api/loyalty-tiers",
  "/api/tables",
  "/api/rooms",
  "/api/pos-features",
  "/api/shifts",
  "/api/inventory",
  "/api/appointments",
  "/api/discount-codes",
];

const LAST_UID_LS_KEY = "pos-last-uid";
const prefetchTsKey = (uid: string) => `artixpos_last_prefetch_${uid}`;

const prefetchedUsers = new Set<string>();

export function prefetchBootstrapData(userId: string): void {
  if (prefetchedUsers.has(userId)) return;
  prefetchedUsers.add(userId);

  // Evict IDB api-cache entries older than 7 days to prevent unbounded storage
  // growth on long-running POS devices.  Fire-and-forget — never blocks boot.
  pruneStaleCache(7 * 24 * 60 * 60 * 1000).catch(() => {});

  const queryFn = getQueryFn({ on401: "returnNull" });

  for (const url of ALL_PREFETCH_URLS) {
    getCached<unknown>(url)
      .then((cached) => {
        if (cached != null && queryClient.getQueryData([url]) === undefined) {
          queryClient.setQueryData([url], cached);
        }
      })
      .catch(() => {});
  }

  for (const url of ALL_PREFETCH_URLS) {
    queryClient
      .fetchQuery({ queryKey: [url], queryFn })
      .then((data) => {
        if (data != null) {
          import("./offline-db").then(({ setCached }) => {
            setCached(url, data).catch(() => {});
          });
        }
      })
      .catch(() => {});
  }
}

export function clearPrefetchCache(): void {
  prefetchedUsers.clear();
  try {
    const uid = localStorage.getItem(LAST_UID_LS_KEY);
    if (uid) localStorage.removeItem(prefetchTsKey(uid));
  } catch {}
}
