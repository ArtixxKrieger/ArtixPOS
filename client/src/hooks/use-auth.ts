import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { resolveUrl, clearNativeToken, NATIVE_TOKEN_KEY, getCsrfHeaders } from "@/lib/queryClient";
import { clearAllCache } from "@/lib/offline-db";
import { debugLog } from "@/lib/debug-log";
import { clearSettingsPrewarm } from "@/hooks/use-settings";
import type { UserRole } from "@shared/schema";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

// ── Auth pre-warm ─────────────────────────────────────────────────────────────
// Store the last successful auth response in localStorage so that on hard
// refresh, the user object (including activeBranch.color) is available as
// placeholderData before /api/auth/me finishes loading. This eliminates the
// "default blue theme" flash on every page reload — the branch color is applied
// the instant the React tree mounts, not after the network round-trip.
//
// We store only non-sensitive profile data (id, name, role, activeBranch).
// The actual JWT lives in an httpOnly cookie and is never touched here.
const AUTH_CACHE_LS_KEY = "artixpos_auth_me_v1";

function loadCachedAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function saveCachedAuthUser(user: AuthUser | null): void {
  try {
    if (user) localStorage.setItem(AUTH_CACHE_LS_KEY, JSON.stringify(user));
    else localStorage.removeItem(AUTH_CACHE_LS_KEY);
  } catch {}
}

export interface ActiveBranchInfo {
  id: number;
  name: string;
  color: string | null;
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
  role: UserRole;
  activeBranchId: number | null;
  activeBranch: ActiveBranchInfo | null;
  pinSession?: boolean;
}

// fetchMe is a proper React Query queryFn — it receives the QueryFunctionContext
// so it can (a) honour the query's AbortSignal (fired by cancelQueries on tab
// resume / unmount) and (b) enforce its own 20-second hard timeout.
// Without the signal/timeout, a frozen fetch caused by Android tab suspension
// would leave isLoading=true forever because cancelQueries can't abort a raw
// fetch that has no associated AbortController.
async function fetchMe({ signal }: { signal?: AbortSignal } = {}): Promise<AuthUser | null> {
  const token = localStorage.getItem(NATIVE_TOKEN_KEY);
  // Only send a Bearer token for native (Capacitor) clients where API_BASE is set.
  // Web clients authenticate via httpOnly cookie — never trust a localStorage token
  // for web sessions, as any JS on the page could read or forge it.
  const isNative = !!API_BASE;
  const headers: Record<string, string> =
    isNative && token ? { Authorization: `Bearer ${token}` } : {};
  const credentials: RequestCredentials = isNative ? "omit" : "include";

  // Hard 20-second timeout — prevents indefinite hang when:
  //  · Vercel cold start is slow (setupRLS / ensureIndexes running)
  //  · Android Chrome suspends the tab mid-fetch (Promise freezes until resume)
  // The outer AbortController merges the query signal with the timeout signal.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new DOMException("fetchMe timeout", "TimeoutError")), 20_000);
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        controller.abort(signal.reason);
      }, { once: true });
    }
  }

  try {
    debugLog("auth", `fetchMe — token=${token ? "YES" : "NO"} url=${resolveUrl("/api/auth/me")}`);
    const res = await fetch(resolveUrl("/api/auth/me"), { credentials, headers, signal: controller.signal });
    clearTimeout(timeoutId);
    debugLog("auth", `fetchMe — status=${res.status}`);
    if (res.status === 401) {
      // If we used a stale localStorage token on native, clear it and return null.
      if (isNative && token) {
        debugLog("auth", "fetchMe — stale native token detected, clearing");
        clearNativeToken();
      }
      return null;
    }
    if (res.status === 403) {
      const data = await res.json().catch(() => ({}));
      if (data.banned) {
        clearNativeToken();
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login?reason=banned";
        }
      }
      return null;
    }
    const data = await res.json();
    debugLog("auth", `fetchMe — user=${JSON.stringify(data.user?.id ?? null)}`);
    const authUser: AuthUser | null = data.user ?? null;
    // Persist to localStorage so the next hard-refresh can use it as
    // placeholderData and apply the branch theme color immediately.
    saveCachedAuthUser(authUser);
    return authUser;
  } catch (err) {
    clearTimeout(timeoutId);
    // Network error, timeout, or abort — always return null and require re-auth.
    // Never decode the JWT locally; the signature cannot be verified in the browser
    // and a forged token could grant attacker-controlled role/permissions.
    debugLog("auth", `fetchMe — NETWORK ERROR / TIMEOUT: ${err}`);
    return null;
  }
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, isFetching } = useQuery<AuthUser | null>({
    queryKey: ["auth-me"],
    queryFn: fetchMe,
    // Seed from the last known auth state so branch color and user data are
    // available the instant the component tree mounts — before /api/auth/me
    // even fires. The real fetch still runs in the background and replaces
    // this placeholder with fresh data.
    placeholderData: loadCachedAuthUser(),
    retry: 2,
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Always use credentials:"include" so the server's Set-Cookie: expires=past
      // header is honoured by the browser and the httpOnly cookie is cleared.
      // Also send Bearer token so native clients are invalidated server-side.
      const token = localStorage.getItem(NATIVE_TOKEN_KEY);
      try {
        await fetch(resolveUrl("/auth/logout"), {
          method: "POST",
          credentials: "include",
          headers: {
            ...getCsrfHeaders("POST"),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
      } catch {
        // Offline or network error — still proceed with local-only logout.
      }
      clearNativeToken();
      // Clear auth pre-warm so the next user doesn't briefly see this user's
      // branch color / identity on their first page load.
      saveCachedAuthUser(null);
      // Clear the settings in-memory prewarm and IDB entry synchronously
      // (best-effort) BEFORE the page navigation.  clearAllCache() below is
      // fire-and-forget and may not finish before window.location.replace()
      // triggers a navigation.  If IDB still holds the previous user's settings,
      // the next session's pre-warm shows the wrong store name on first render.
      await clearSettingsPrewarm().catch(() => {});
      // Fire-and-forget full IDB clear — covers all other offline caches.
      clearAllCache().catch(() => {});
    },
    onSuccess: () => {
      // Synchronously kill all in-flight queries and wipe the cache BEFORE
      // navigating. The async cancelQueries().finally() pattern had a race:
      // queries could resolve between clear() and the navigation, repopulating
      // the cache with the previous user's data.
      queryClient.cancelQueries();
      queryClient.clear();
      // replace() removes this entry from history so the back button can never
      // restore the pre-logout app page from the browser's bfcache.
      window.location.replace("/login");
    },
    onError: () => {
      clearNativeToken();
      queryClient.cancelQueries();
      queryClient.clear();
      window.location.replace("/login");
    },
  });

  const u = user ?? null;
  return {
    user: u,
    isLoading,
    isFetching,
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
