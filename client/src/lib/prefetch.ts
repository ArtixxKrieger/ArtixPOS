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

/**
 * All critical API URLs to keep warm in both IDB and the React Query cache.
 * Exported so useOfflinePrefetch can reference the same list for periodic
 * background refreshes without duplicating or drifting from this definition.
 *
 * Core (top group): fetched immediately on login — always needed for the POS.
 * Extended (bottom group): fetched in parallel on login and refreshed every
 * 5 min for full offline coverage of all app pages.
 */
export const ALL_PREFETCH_URLS: readonly string[] = [
  // ── Core ────────────────────────────────────────────────────────────────
  "/api/settings",
  "/api/subscription",
  "/api/dashboard/stats",
  "/api/notifications",
  "/api/pending-orders",
  "/api/products",
  "/api/customers",
  // ── Extended (full offline coverage) ────────────────────────────────────
  "/api/expenses",
  "/api/staff",
  "/api/suppliers",
  "/api/branches",
  "/api/categories",
  "/api/memberships",
  "/api/loyalty-tiers",
  "/api/tables",
  "/api/rooms",
  "/api/pos-features",
];

// ── localStorage key used by useOfflinePrefetch for the last-prefetch timestamp
// Defined here so clearPrefetchCache can remove it on logout / user-switch.
const LAST_UID_LS_KEY = "pos-last-uid";
const prefetchTsKey = (uid: string) => `artixpos_last_prefetch_${uid}`;

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

  // ── Phase 2: Network refresh + IDB warm-up ────────────────────────────────
  // Fire all requests immediately.  TanStack Query deduplicates in-flight
  // requests, so if a useQuery / useSettings / useProducts mounts at the same
  // time it reuses the same pending Promise instead of making a second request.
  //
  // After each successful fetch we also write the result to IDB.  This is the
  // critical piece for "Chrome back button on low-end devices": bfcache is
  // often evicted under memory pressure, so the next page load reboots the
  // whole React app.  Phase 1 above seeds from IDB in ~2-5 ms, but only if
  // IDB was populated from a previous visit.  Without this write, IDB stays
  // empty until the user explicitly saves something — and every back-navigation
  // feels slow again.
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

  // Also remove the user-scoped last-prefetch timestamp written by
  // useOfflinePrefetch — otherwise the "Offline · cached Xm ago" label
  // would show a stale time from the previous session after logout.
  try {
    const uid = localStorage.getItem(LAST_UID_LS_KEY);
    if (uid) localStorage.removeItem(prefetchTsKey(uid));
  } catch {}
}
