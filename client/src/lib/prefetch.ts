import { queryClient, getQueryFn } from "./queryClient";

/**
 * Bootstrap prefetch — fires all critical API requests in parallel
 * the moment the user's identity is confirmed, so every page renders
 * with data already in the TanStack Query cache (zero loading time).
 *
 * Called once per user session. Subsequent calls for the same userId
 * are no-ops because TanStack Query won't re-fetch data that's already
 * in cache with staleTime: Infinity.
 */

// Wave 1 — tiny/fast: fetched immediately on login.
// These power the sidebar, notification bell, and dashboard stats.
const BOOTSTRAP_URLS = [
  "/api/settings",
  "/api/subscription",
  "/api/dashboard/stats",
  "/api/notifications",
];

// Wave 2 — medium: fetched ~4 s after login in the background.
// Products power the POS page (the most-used feature). Fetching them
// early means the first POS visit renders instantly instead of showing
// a skeleton while 100-1000 products load on demand.
// Pending orders are small and power the badge count + Pending page.
const SECONDARY_URLS = [
  "/api/pending-orders",
  "/api/products",
  "/api/customers",
];

const prefetchedUsers = new Set<string>();

export function prefetchBootstrapData(userId: string): void {
  if (prefetchedUsers.has(userId)) return;
  prefetchedUsers.add(userId);

  const queryFn = getQueryFn({ on401: "returnNull" });

  // Wave 1: fire immediately — these are required for the initial render
  for (const url of BOOTSTRAP_URLS) {
    queryClient.prefetchQuery({ queryKey: [url], queryFn }).catch(() => {});
  }

  // Wave 2: stagger after Wave 1 completes so we don't compete for bandwidth.
  // Using requestIdleCallback when available so this doesn't block any user
  // interaction that happens right after login.
  const scheduleWave2 = () => {
    for (const url of SECONDARY_URLS) {
      queryClient.prefetchQuery({ queryKey: [url], queryFn }).catch(() => {});
    }
  };

  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    setTimeout(() => (window as any).requestIdleCallback(scheduleWave2, { timeout: 8_000 }), 3_000);
  } else {
    setTimeout(scheduleWave2, 4_000);
  }
}

export function clearPrefetchCache(): void {
  prefetchedUsers.clear();
}
