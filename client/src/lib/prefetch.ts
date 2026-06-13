import { queryClient, getQueryFn } from "./queryClient";
import { getCached, pruneStaleCache } from "./offline-db";

// ── Priority groups ────────────────────────────────────────────────────────
// Network fetches are batched by priority so POS-critical data (products,
// customers, settings) is guaranteed to land in IDB first on weak mobile
// connections.  All 20 groups fire in parallel WITHIN each tier; tiers are
// sequenced with a short delay so the critical tier monopolises bandwidth
// before lower-priority requests compete.

/** Tier 1 — absolutely required for offline POS checkout */
const CRITICAL_URLS: readonly string[] = [
  "/api/settings",
  "/api/pos-features",
  "/api/products",
  "/api/categories",
  "/api/customers",
  "/api/pending-orders",
];

/** Tier 2 — needed for most in-store operations */
const OPERATIONAL_URLS: readonly string[] = [
  "/api/staff",
  "/api/tables",
  "/api/rooms",
  "/api/memberships",
  "/api/loyalty-tiers",
  "/api/discount-codes",
  "/api/ingredients",
];

/** Tier 3 — background / analytics (fetched after critical + operational) */
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

// Flat list used by the 5-minute background refresh hook (order doesn't
// matter there — we're already online and just keeping IDB warm).
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

  // Evict IDB api-cache entries older than 7 days to prevent unbounded storage
  // growth on long-running POS devices.  Fire-and-forget — never blocks boot.
  pruneStaleCache(7 * 24 * 60 * 60 * 1000).catch(() => {});

  const queryFn = getQueryFn({ on401: "returnNull" });

  // ── Step 1: Seed the in-memory React Query cache from IDB immediately ────
  // This is synchronous in the sense that it fires before any network request,
  // so mounted components see data instantly from the last session.
  for (const url of ALL_PREFETCH_URLS) {
    getCached<unknown>(url, Infinity)
      .then((cached) => {
        if (cached != null && queryClient.getQueryData([url]) === undefined) {
          queryClient.setQueryData([url], cached);
        }
      })
      .catch(() => {});
  }

  // ── Step 2: Network fetch in priority tiers ───────────────────────────────
  // Each tier fans out in parallel, then the next tier starts after a short
  // gap.  This lets the critical URLs saturate available bandwidth before the
  // background URLs compete.  On fast connections (>10 Mbps) all tiers
  // effectively land simultaneously anyway; the gap only matters on slow links.
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
            }
          })
          .catch(() => {}),
      ),
    );
  }

  // Fire tiers sequentially without blocking the main call (fire-and-forget).
  fetchTier(CRITICAL_URLS, 0)
    .then(() => fetchTier(OPERATIONAL_URLS, 200))
    .then(() => fetchTier(BACKGROUND_URLS, 200))
    .catch(() => {});
}

export function clearPrefetchCache(): void {
  prefetchedUsers.clear();
  try {
    const uid = localStorage.getItem(LAST_UID_LS_KEY);
    if (uid) localStorage.removeItem(prefetchTsKey(uid));
  } catch {}
}
