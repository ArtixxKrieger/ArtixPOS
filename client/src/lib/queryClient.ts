import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getCached, setCached, isNetworkError } from "./offline-db";

// ── Re-export everything from api.ts ──────────────────────────────────────────
// All 40+ files that import {apiRequest, nativeFetch, resolveUrl, …} from
// "@/lib/queryClient" keep working without any individual changes.
export {
  resolveUrl,
  setNativeToken,
  clearNativeToken,
  getCsrfHeaders,
  getCredentials,
  nativeFetch,
  apiRequest,
  apiGet,
  normaliseError,
  NATIVE_TOKEN_KEY,
} from "./api";

import { apiGet } from "./api";

// These patterns identify URLs that should NOT be cached in IDB:
// - Auth endpoints (stale auth data causes login loops)
// - Non-API keys like "auth-me"
const IDB_SKIP_PATTERNS = [
  /^auth-me$/,
  /\/api\/auth\//,
  /^\/api\/me$/,
  /\/api\/health$/,
];

function shouldCacheInIDB(rawUrl: string): boolean {
  if (!rawUrl.startsWith("/api/")) return false;
  return !IDB_SKIP_PATTERNS.some((p) => p.test(rawUrl));
}

type UnauthorizedBehavior = "returnNull" | "throw";

export function getQueryFn<T>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> {
  const { on401: unauthorizedBehavior } = options;

  return async ({ queryKey, signal }) => {
    // The raw (non-resolved) URL is used as the IDB key so it stays consistent
    // across environments (dev proxy vs production domain).
    const rawUrl = queryKey.join("/") as string;

    try {
      // apiGet uses the axios instance which already has:
      //   • 20 s timeout (replaces fetchWithTimeout)
      //   • 503 retry interceptor with exponential back-off
      //   • Auth headers injected via request interceptor
      const data = await apiGet<T>(rawUrl, signal);

      // Write to IDB on success — fire-and-forget so we don't block rendering
      if (shouldCacheInIDB(rawUrl)) {
        setCached(rawUrl, data).catch(() => {});
      }

      return data;
    } catch (err) {
      // 401 — honour the caller's preference
      if (unauthorizedBehavior === "returnNull" && (err as any).status === 401) {
        return null as unknown as T;
      }

      // IDB fallback: only for genuine network / timeout failures.
      // Network errors have no HTTP status (status === undefined).
      // Don't fall back for aborted queries (signal fired) — those are
      // intentional cancellations and should not serve stale data.
      const isAbort = signal?.aborted;
      const hasNoStatus = (err as any).status === undefined;
      const isNet = isNetworkError(err) || (!isAbort && hasNoStatus);

      if (isNet && shouldCacheInIDB(rawUrl)) {
        try {
          const cached = await getCached<T>(rawUrl);
          if (cached !== null) return cached;
        } catch {}
      }

      throw err;
    }
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      // 30 min — keeps data alive across SPA navigations on low-end devices
      // that frequently evict the bfcache, causing full JS re-boots.
      gcTime: 30 * 60 * 1000,
      // 503s are already retried silently inside the axios interceptor.
      // Only retry here for genuine network failures or other transient errors,
      // but never re-retry a 503 (it has already exhausted its own retry budget).
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        const msg = (error as Error)?.message ?? "";
        // 503 exhausted its own retries — don't retry again at this layer
        if (
          msg.toLowerCase().includes("service unavailable") ||
          msg.includes("503")
        )
          return false;
        return true;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      networkMode: "always",
    },
    mutations: {
      // 503s are silently retried inside apiRequest/axios interceptor.
      retry: false,
      networkMode: "always",
    },
  },
});

// Fires when the user returns to the tab after switching apps, locking the
// screen, or receiving a notification tap on mobile.
//
// IMPORTANT: We deliberately do NOT call cancelQueries here even for queries
// that are currently fetching. The previous version cancelled all in-flight
// fetches on every tab-return, which is extremely common on Android Chrome.
// Each cancelled query then retried up to 2× before completing, turning a
// 1-2 s network request into a 5-8 s "loading loop" from the user's
// perspective. The axios 20-second timeout already handles the only legitimate
// stuck-Promise case (Android suspends the tab mid-fetch): when JavaScript
// execution resumes the queued setTimeout fires immediately, cancelling the
// frozen Promise and letting React Query retry cleanly.
//
// We only restart queries that are ALREADY in an error state — those cannot
// self-heal and benefit from an immediate retry when the user returns.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;

    queryClient.getQueryCache().getAll().forEach((query) => {
      if (query.state.status === "error") {
        queryClient.invalidateQueries({ queryKey: query.queryKey });
      }
    });
  });
}

// Android Chrome aggressively caches pages in the bfcache. When the user
// navigates away (e.g. to a Google OAuth page) and then the OAuth flow
// redirects back to the app domain, Chrome may RESTORE the frozen page from
// bfcache instead of performing a fresh navigation. When that happens:
//   • React Query state is thawed in the pre-auth state (isAuthenticated=false)
//   • refetchOnWindowFocus is false, so no automatic re-check happens
//   • The auth cookie WAS set by the OAuth callback, but nobody asks for it
// The pageshow event fires on every page display — both fresh loads and
// bfcache restores. When event.persisted=true it is a bfcache restore.
// We invalidate auth-me so the auth state is re-validated immediately.
if (typeof window !== "undefined") {
  window.addEventListener("pageshow", (event) => {
    if ((event as PageTransitionEvent).persisted) {
      // Force a fresh auth check — the cookie may have changed since the page
      // was frozen (e.g. OAuth just completed in another browser context).
      queryClient.invalidateQueries({ queryKey: ["auth-me"] });
    }
  });
}
