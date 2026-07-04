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

  const queryFn = getQueryFn({ on401: "returnNull" });

for (const url of ALL_PREFETCH_URLS) {
    getCached<unknown>(url, Infinity)
      .then((cached) => {
        if (cached != null && queryClient.getQueryData([url]) === undefined) {
          queryClient.setQueryData([url], cached);
        }
      })
      .catch(() => {});
  }

async function fetchTier(urls: readonly string[], delayMs: number): Promise<void> {
    if (delayMs > 0) await new Promise<void>((r) => setTimeout(r, delayMs));
    await Promise.allSettled(
      urls.map((url) =>
        queryClient
          .fetchQuery({ queryKey: [url], queryFn })
          .then((data) => {
            if (data != null) {
              import("./offline-db").then(({ setCached }) => {
                setCached(url, data).catch(() => {});
              });
            } else {
              queryClient.removeQueries({ queryKey: [url], exact: true });
            }
          })
          .catch(() => {}),
      ),
    );
  }

fetchTier(CRITICAL_URLS, 0)
    .then(() => fetchTier(OPERATIONAL_URLS, 200))
    .then(() => fetchTier(BACKGROUND_URLS, 200))
    .catch(() => {});
}

export async function prefetchCriticalData(): Promise<void> {
  const queryFn = getQueryFn({ on401: "returnNull" });
  await Promise.allSettled(
    CRITICAL_URLS.map((url) =>
      queryClient
        .fetchQuery({ queryKey: [url], queryFn })
        .then((data) => {
          if (data != null) {
            import("./offline-db").then(({ setCached }) => {
              setCached(url, data).catch(() => {});
            });
          } else {
            queryClient.removeQueries({ queryKey: [url], exact: true });
          }
        })
        .catch(() => {}),
    ),
  );
}

export function clearPrefetchCache(): void {
  prefetchedUsers.clear();
  try {
    const uid = localStorage.getItem(LAST_UID_LS_KEY);
    if (uid) localStorage.removeItem(prefetchTsKey(uid));
  } catch {}
}
