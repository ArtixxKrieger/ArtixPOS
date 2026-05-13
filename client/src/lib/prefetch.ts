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
const BOOTSTRAP_URLS = [
  "/api/settings",
  "/api/subscription",
  "/api/products",
  "/api/dashboard/stats",
  "/api/notifications",
  "/api/customers",
];

const prefetchedUsers = new Set<string>();

export function prefetchBootstrapData(userId: string): void {
  if (prefetchedUsers.has(userId)) return;
  prefetchedUsers.add(userId);

  const queryFn = getQueryFn({ on401: "returnNull" });

  for (const url of BOOTSTRAP_URLS) {
    queryClient.prefetchQuery({
      queryKey: [url],
      queryFn,
    }).catch(() => {});
  }
}

export function clearPrefetchCache(): void {
  prefetchedUsers.clear();
}
