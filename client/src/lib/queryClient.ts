import { QueryClient, QueryFunction } from "@tanstack/react-query";

// When bundled for native (Capacitor) builds, VITE_API_BASE_URL is set to the
// deployed backend URL so API calls reach the server from the local WebView.
// In web/dev mode it stays empty so relative paths like /api/products work as-is.
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

// Key used to persist the JWT received from native OAuth deep links
export const NATIVE_TOKEN_KEY = "cafebara_native_token";

export function resolveUrl(url: string): string {
  if (API_BASE && url.startsWith("/")) {
    return `${API_BASE}${url}`;
  }
  return url;
}

export function setNativeToken(token: string) {
  localStorage.setItem(NATIVE_TOKEN_KEY, token);
}

export function clearNativeToken() {
  localStorage.removeItem(NATIVE_TOKEN_KEY);
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(NATIVE_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Drop-in replacement for fetch() that works in both web and native (APK) contexts.
// - Resolves relative URLs to the configured API base for native builds
// - Attaches the Bearer token when one is stored (native auth flow)
// - Uses the correct credentials mode (omit for native, include for web)
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

// When a native token is stored the app is cross-origin (APK WebView → Vercel).
// Sending credentials:"include" on cross-origin requests requires the server to
// echo back an exact origin + Allow-Credentials header, which was causing the
// CORS preflight to silently fail. With Bearer-token auth, cookies aren't needed,
// so we use "omit" to sidestep that requirement.
function getCredentials(): RequestCredentials {
  return localStorage.getItem(NATIVE_TOKEN_KEY) ? "omit" : "include";
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
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: getCredentials(),
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = resolveUrl(queryKey.join("/") as string);
    const res = await fetch(url, {
      credentials: getCredentials(),
      headers: getAuthHeaders(),
    });

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
      // Retry transient failures up to 2 times for read queries.
      // Mutations intentionally stay at 0 — they are not idempotent.
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
