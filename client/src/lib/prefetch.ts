import { queryClient, getQueryFn } from "./queryClient";
import { getCached } from "./offline-db";

/**
 * Bootstrap prefetch — "IDB-first, network-second" pipeline.
 *
 * On every login we run two overlapping phases:
 *
 * Phase 1 — IDB seed (~2-5 ms per key)
 *   Read every critical URL from IndexedDB and inject it into the React Query
 *   cache BEFORE the network responses arrive.  On returning visits (fresh tab,
 *   browser reload, mobile PWA reopen) this makes every page render instantly
 *   with the last-known data, then quietly update when the network catches up.
 *
 * Phase 2 — Network refresh (fired in parallel, ~200-500 ms)
 *   prefetchQuery for every URL so the cache is brought up-to-date.
 *   Queries that already have fresh data (staleTime not elapsed) are skipped
 *   automatically by TanStack Query — no wasted requests.
 *
 * NO Wave 2 delay — products, customers and pending-orders used to be fetched
 * 3-4 s after login.  They now load in parallel with everything else so POS,
 * Pending Orders and Customers are data-ready on first visit.
 */

const ALL_PREFETCH_URLS = [
  "/api/settings",
  "/api/subscription",
  "/api/dashboard/stats",
  "/api/notifications",
  // Previously Wave 2 (delayed 3-4 s) — now fetched immediately on login:
  "/api/pending-orders",
  "/api/products",
  "/api/customers",
];

const prefetchedUsers = new Set<string>();

export function prefetchBootstrapData(userId: string): void {
  if (prefetchedUsers.has(userId)) return;
  prefetchedUsers.add(userId);

  const queryFn = getQueryFn({ on401: "returnNull" });

  // ── Phase 1: IDB seed ──────────────────────────────────────────────────────
  // Fire all IDB reads in parallel.  Each resolves in ~2-5 ms.  When data
  // arrives, inject it into the cache if the network hasn't beaten it there yet.
  // This is the key to "instant" page loads on revisits — no spinner needed.
  for (const url of ALL_PREFETCH_URLS) {
    getCached<unknown>(url)
      .then((cached) => {
        if (cached != null && queryClient.getQueryData([url]) === undefined) {
          queryClient.setQueryData([url], cached);
        }
      })
      .catch(() => {});
  }

  // ── Phase 2: Network refresh ───────────────────────────────────────────────
  // Fire all requests immediately.  TanStack Query deduplicates in-flight
  // requests, so if a useQuery / useSettings / useProducts mounts at the same
  // time it reuses the same pending Promise instead of making a second request.
  for (const url of ALL_PREFETCH_URLS) {
    queryClient.prefetchQuery({ queryKey: [url], queryFn }).catch(() => {});
  }
}

export function clearPrefetchCache(): void {
  prefetchedUsers.clear();
}
