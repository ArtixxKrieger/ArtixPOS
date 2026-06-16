import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getCached, setCached, isNetworkError } from "./offline-db";

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

const rawUrl = queryKey.join("/") as string;

    try {

const data = await apiGet<T>(rawUrl, signal);

if (shouldCacheInIDB(rawUrl)) {
        setCached(rawUrl, data).catch(() => {});
      }

      return data;
    } catch (err) {

      if (unauthorizedBehavior === "returnNull" && (err as any).status === 401) {
        return null as unknown as T;
      }

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

gcTime: 30 * 60 * 1000,

retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        const msg = (error as Error)?.message ?? "";

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

      retry: false,
      networkMode: "always",
    },
  },
});

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;

    queryClient.getQueryCache().getAll().forEach((query) => {
      const key = query.queryKey[0];
      if (key === "auth-me" || (typeof key === "string" && key.startsWith("/api/auth"))) return;
      if (query.state.status === "error") {
        queryClient.invalidateQueries({ queryKey: query.queryKey });
      }
    });
  });
}
