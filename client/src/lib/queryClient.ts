import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getCached, setCached, isNetworkError } from "./offline-db";

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

export function getCsrfHeaders(method: string): Record<string, string> {
  if (!UNSAFE_METHODS.has(method.toUpperCase())) return {};
  if (API_BASE) return {}; // Native client — Bearer token, CSRF not needed
  const token = getCsrfToken();
  return token ? { "X-CSRF-Token": token } : {};
}

export async function nativeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  return fetch(resolveUrl(url), {
    ...options,
    credentials: getCredentials(),
    headers: {
      ...(options.headers ?? {}),
      ...getAuthHeaders(),
      ...getCsrfHeaders(method),
    },
  });
}

// ── 503 retry-with-backoff ───────────────────────────────────────────────────
// When the server is under load it returns 503. We silently retry up to
// MAX_503_RETRIES times with exponential back-off + ±20 % jitter before
// surfacing the error to the caller. The Retry-After response header (seconds)
// is honoured when present. If the request's abort signal fires mid-wait the
// pending delay is cancelled and the abort reason propagates immediately.
const MAX_503_RETRIES = 3;
const BASE_503_DELAY_MS = 1_000;

async function retryOn503(
  fn: () => Promise<Response>,
  signal?: AbortSignal | null,
): Promise<Response> {
  let attempt = 0;

  while (true) {
    const res = await fn();

    if (res.status !== 503 || attempt >= MAX_503_RETRIES) {
      return res;
    }

    // Honour Retry-After header when the server provides it (value in seconds)
    const retryAfterHeader = res.headers.get("Retry-After");
    const serverDelayMs = retryAfterHeader ? parseFloat(retryAfterHeader) * 1_000 : null;

    // Exponential back-off: 1 s, 2 s, 4 s — capped at 10 s
    const backoffMs = Math.min(BASE_503_DELAY_MS * 2 ** attempt, 10_000);
    // ±20 % jitter to spread burst retries across clients
    const jitterMs = backoffMs * 0.2 * (Math.random() * 2 - 1);
    const delayMs = Math.round(serverDelayMs ?? backoffMs + jitterMs);

    await new Promise<void>((resolve, reject) => {
      const id = setTimeout(resolve, delayMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(id);
          reject(signal.reason);
        },
        { once: true },
      );
    });

    attempt++;
  }
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
  const res = await retryOn503(
    () =>
      fetch(resolveUrl(url), {
        method,
        headers: {
          ...(data ? { "Content-Type": "application/json" } : {}),
          ...getAuthHeaders(),
          ...getCsrfHeaders(method),
        },
        body: data ? JSON.stringify(data) : undefined,
        credentials: getCredentials(),
      }),
  );
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

  // 503 retries run inside the timeout window and propagate the combined
  // abort signal so a tab-unload or query cancellation stops them immediately.
  return retryOn503(
    () => fetch(url, { ...init, signal: controller.signal }),
    controller.signal,
  ).finally(() => clearTimeout(timeoutId));
}

// ── IDB cache helpers for default queryFn ────────────────────────────────
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
    const url = resolveUrl(rawUrl);

    try {
      const res = await fetchWithTimeout(
        url,
        { credentials: getCredentials(), headers: getAuthHeaders() },
        signal,
      );

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null as unknown as T;
      }

      await throwIfResNotOk(res);
      const data = await res.json();

      // Write to IDB on success — fire-and-forget so we don't block rendering
      if (shouldCacheInIDB(rawUrl)) {
        setCached(rawUrl, data).catch(() => {});
      }

      return data as T;
    } catch (err) {
      // ONLY fall back to IDB for genuine network / timeout failures.
      // Do NOT serve stale cache for 4xx/5xx — those are intentional server
      // signals (403 = lost access, 404 = deleted) and must propagate so the
      // UI shows the real error instead of silently serving stale data.
      const isTimeout =
        err instanceof DOMException && err.name === "TimeoutError";
      if ((isNetworkError(err) || isTimeout) && shouldCacheInIDB(rawUrl)) {
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
      // 503s are already retried silently inside fetchWithTimeout/retryOn503.
      // Only retry here for genuine network failures or other transient errors,
      // but never re-retry a 503 (it has already exhausted its own retry budget).
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false;
        const msg = (error as Error)?.message ?? "";
        // 503 exhausted its own retries — don't retry again at this layer
        if (msg.toLowerCase().includes("service unavailable") || msg.includes("503")) return false;
        return true;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      networkMode: "always",
    },
    mutations: {
      // 503s are silently retried inside apiRequest/retryOn503.
      retry: false,
      networkMode: "always",
    },
  },
});

// ── Visibility-change recovery ─────────────────────────────────────────────
// Fires when the user returns to the tab after switching apps, locking the
// screen, or receiving a notification tap on mobile.
//
// IMPORTANT: We deliberately do NOT call cancelQueries here even for queries
// that are currently fetching.  The previous version cancelled all in-flight
// fetches on every tab-return, which is extremely common on Android Chrome.
// Each cancelled query then retried up to 2× before completing, turning a
// 1-2 s network request into a 5-8 s "loading loop" from the user's
// perspective.  The 20-second fetchWithTimeout already handles the only
// legitimate stuck-Promise case (Android suspends the tab mid-fetch): when
// JavaScript execution resumes the queued setTimeout fires immediately,
// cancelling the frozen Promise and letting React Query retry cleanly.
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

// ── Back/Forward Cache (bfcache) recovery ───────────────────────────────────
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
