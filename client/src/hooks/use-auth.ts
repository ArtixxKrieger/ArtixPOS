import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { resolveUrl, clearNativeToken, nativeFetch, NATIVE_TOKEN_KEY } from "@/lib/queryClient";
import { clearApiCache } from "@/lib/offline-db";
import { debugLog } from "@/lib/debug-log";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

export interface ActiveBranchInfo {
  id: number;
  name: string;
  businessType: string | null;
  businessSubType: string | null;
}

export interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  provider: string;
  tenantId: string | null;
  role: "owner" | "manager" | "admin" | "cashier";
  activeBranchId: number | null;
  activeBranch: ActiveBranchInfo | null;
}

function decodeJwtUser(token: string): AuthUser | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload?.id) return null;
    // Reject expired tokens
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return {
      id: payload.id,
      name: payload.name ?? null,
      email: payload.email ?? null,
      avatar: payload.avatar ?? null,
      provider: payload.provider ?? "unknown",
      tenantId: payload.tenantId ?? null,
      role: payload.role ?? "owner",
      activeBranchId: payload.activeBranchId ?? null,
      activeBranch: null,
    };
  } catch {
    return null;
  }
}

async function fetchMe(): Promise<AuthUser | null> {
  const token = localStorage.getItem(NATIVE_TOKEN_KEY);
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  // On native (API_BASE set) every request is cross-origin. Use "omit" even
  // before the first token arrives so the initial /api/auth/me check doesn't
  // fail CORS — the server never sends Allow-Credentials for native origins.
  const credentials: RequestCredentials = token || API_BASE ? "omit" : "include";

  try {
    debugLog("auth", `fetchMe — token=${token ? "YES" : "NO"} url=${resolveUrl("/api/auth/me")}`);
    const res = await fetch(resolveUrl("/api/auth/me"), { credentials, headers });
    debugLog("auth", `fetchMe — status=${res.status}`);
    if (res.status === 401) return null;
    if (res.status === 403) {
      const data = await res.json().catch(() => ({}));
      if (data.banned) {
        clearNativeToken();
        // Only redirect if not already on the login page to prevent infinite refresh loop
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login?reason=banned";
        }
      }
      return null;
    }
    const data = await res.json();
    debugLog("auth", `fetchMe — user=${JSON.stringify(data.user?.id ?? null)}`);
    return data.user ?? null;
  } catch (err) {
    // Network error (offline or CORS). If a valid stored token exists, keep the
    // user logged in by decoding the token locally rather than logging them out.
    debugLog("auth", `fetchMe — NETWORK ERROR: ${err}`);
    if (token) {
      const userFromToken = decodeJwtUser(token);
      if (userFromToken) {
        debugLog("auth", `fetchMe — offline, returning user from stored token`);
        return userFromToken;
      }
    }
    return null;
  }
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth-me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // ── WHY credentials:"include" (not nativeFetch) ───────────────────────
      // nativeFetch() switches to credentials:"omit" whenever a native Bearer
      // token exists in localStorage — which happens for web Google OAuth users
      // too, because the web login flow also stores a token there.
      //
      // Browser security rule: when credentials:"omit" is used, Set-Cookie
      // response headers are silently discarded. The server sends
      // "Set-Cookie: auth_token=; expires=past" but the browser ignores it,
      // leaving the cookie (and therefore the session) fully alive.
      //
      // Effect: first logout click appears to work (page navigates to /login)
      // but the auth_token cookie is still set, so fetchMe() returns the user
      // and the app immediately re-enters the authenticated state. A second
      // click finally clears the cookie because clearNativeToken() already ran,
      // so credentials:"include" is used and Set-Cookie is processed.
      //
      // Fix: always use credentials:"include" for the logout call so the
      // cookie is reliably cleared. Still send Bearer token in the Authorization
      // header so native (Capacitor) clients are also invalidated server-side.
      const token = localStorage.getItem(NATIVE_TOKEN_KEY);
      try {
        await fetch(resolveUrl("/auth/logout"), {
          method: "POST",
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch {
        // Offline or network error — still proceed with local-only logout.
      }
      // Clear the native token AFTER the fetch so it's still in the
      // Authorization header for the request above.
      clearNativeToken();
      // Use clearApiCache (not clearAllCache) so any queued offline sales
      // belonging to this session are preserved across a re-login.
      clearApiCache().catch(() => {});
    },
    onSuccess: () => {
      queryClient.setQueryData(["auth-me"], null);
      queryClient.clear();
      window.location.href = "/login";
    },
    onError: () => {
      // Even if mutation fails, force local logout
      clearNativeToken();
      queryClient.setQueryData(["auth-me"], null);
      queryClient.clear();
      window.location.href = "/login";
    },
  });

  const u = user ?? null;
  return {
    user: u,
    isLoading,
    isAuthenticated: !!u,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    isOwner: u?.role === "owner",
    isManager: u?.role === "manager",
    isAdmin: u?.role === "admin",
    isCashier: u?.role === "cashier",
    isManagerOrAbove: u?.role === "owner" || u?.role === "manager",
    isAdminOrAbove: u?.role === "owner" || u?.role === "manager" || u?.role === "admin",
  };
}
