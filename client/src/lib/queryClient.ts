import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

export const NATIVE_TOKEN_KEY = "cafebara_native_token";

export function resolveUrl(url: string): string {
  if (API_BASE && url.startsWith("/")) {
    return `${API_BASE}${url}`;
  }
  return url;
}

export function setNativeToken(token: string) {
  // Only persist the token in localStorage for native (Capacitor) clients where
  // API_BASE is set. Web clients authenticate via httpOnly cookie set by the
  // server — storing the JWT in localStorage would expose it to any JavaScript
  // running on the page, enabling token theft via XSS.
  if (!API_BASE) return;
  localStorage.setItem(NATIVE_TOKEN_KEY, token);
}

export function clearNativeToken() {
  localStorage.removeItem(NATIVE_TOKEN_KEY);
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(NATIVE_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── CSRF token ───────────────────────────────────────────────────────────────
// Read the csrf_token cookie set by the server (not httpOnly, so JS can read
// it) and return it as the X-CSRF-Token header for state-changing requests.
// Native clients (API_BASE set) use Bearer tokens — they are CSRF-safe by
// definition and the server will exempt them, so we skip this for them.
const UNSAFE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match?.[1] ?? "";
}

function getCsrfHeaders(method: string): Record<string, string> {
  if (!UNSAFE_METHODS.has(method.toUpperCase())) return {};
  if (API_BASE) return {}; // Native client — Bearer token, CSRF not needed
  const token = getCsrfToken();
  return token ? { "X-CSRF-Token": token } : {};
}

export async function nativeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(resolveUrl(url), {
    ...options,
    credentials: getCredentials(),
    headers: {
      ...(options.headers ?? {}),
      ...getAuthHeaders(),
    },
  });
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    let message = res.statusText || "Something went wrong";
    if (text) {
      try {
        const body = JSON.parse(text);
        message = body?.message || body?.error || message;
      } catch {
        message = text;
      }
    }
    throw new Error(message);
  }
}

function getCredentials(): RequestCredentials {
  const isNativeContext = !!API_BASE;
  const hasToken = !!localStorage.getItem(NATIVE_TOKEN_KEY);
  return isNativeContext || hasToken ? "omit" : "include";
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(resolveUrl(url), {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...getAuthHeaders(),
      ...getCsrfHeaders(method),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: getCredentials(),
  });
  await throwIfResNotOk(res);
  return res;
}

// ── Fetch with timeout ─────────────────────────────────────────────────────
// When Android Chrome suspends a tab (user switches apps), in-flight fetch
// requests have their Promises frozen — they never resolve or reject.
// On return, React Query stays in the `loading` state forever because the
// queryFn never settles. A 20-second abort timeout ensures the query either
// resolves or throws so React Query can retry / show an error.
function fetchWithTimeout(
  url: string,
  init: RequestInit,
  externalSignal?: AbortSignal | null,
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);

  // Respect the query's own abort signal (fired on unmount / query cancellation)
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        controller.abort(externalSignal.reason);
      }, { once: true });
    }
  }

  return fetch(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const url = resolveUrl(queryKey.join("/") as string);
    const res = await fetchWithTimeout(
      url,
      { credentials: getCredentials(), headers: getAuthHeaders() },
      signal,
    );

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      networkMode: "always",
    },
    mutations: {
      retry: false,
      networkMode: "always",
    },
  },
});

// ── Visibility-change recovery ─────────────────────────────────────────────
// When the user returns to the tab after the device was suspended or the
// browser killed background processes, any queries that were mid-fetch will
// be stuck (see fetchWithTimeout above — they'll eventually timeout and
// retry). We additionally pro-actively refetch any query in an error state
// and cancel/restart any that are still stuck in fetching state.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;

    queryClient.getQueryCache().getAll().forEach((query) => {
      const { status, fetchStatus } = query.state;
      // Re-try errored queries immediately on return
      if (status === "error") {
        queryClient.invalidateQueries({ queryKey: query.queryKey });
      }
      // If a query is stuck fetching (e.g. frozen Promise), cancel it so
      // the timeout fires immediately and React Query reschedules a retry.
      if (fetchStatus === "fetching") {
        queryClient.cancelQueries({ queryKey: query.queryKey });
        queryClient.invalidateQueries({ queryKey: query.queryKey });
      }
    });
  });
}
