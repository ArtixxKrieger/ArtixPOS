import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  nativeFetch,
  clearNativeToken,
  getNativeToken,
  setNativeToken,
  setAuthenticatedUserId,
  queryClient,
  performLogout,
} from "@/lib/queryClient";
import { debugLog } from "@/lib/debug-log";
import { setErrorCaptureUser } from "@/lib/error-capture";
import type { UserRole } from "@shared/schema";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

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

export function clearAuthCache(): void {
  saveCachedAuthUser(null);
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
  emailVerified?: boolean;
}

async function fetchMe({ signal }: { signal?: AbortSignal } = {}): Promise<AuthUser | null> {
  const token = getNativeToken();
  const isNative = !!API_BASE;

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException("fetchMe timeout", "TimeoutError")),
    20_000,
  );
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(signal.reason);
    } else {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeoutId);
          controller.abort(signal.reason);
        },
        { once: true },
      );
    }
  }

  try {
    debugLog("auth", `fetchMe — token=${token ? "YES" : "NO"}`);
    const res = await nativeFetch("/api/auth/me", { signal: controller.signal });
    clearTimeout(timeoutId);
    debugLog("auth", `fetchMe — status=${res.status}`);
    if (res.status === 401) {
      if (token) {
        debugLog("auth", "fetchMe — stale token detected, clearing");
        clearNativeToken();
      }

      saveCachedAuthUser(null);
      return null;
    }
    if (res.status === 403) {
      const data = await res.json().catch(() => ({}));

      saveCachedAuthUser(null);
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
    // If the server silently rotated the token (rem=true session nearing expiry),
    // store the fresh token so the Bearer header stays valid for another 90 days.
    // Guard with typeof to prevent localStorage corruption from unexpected payloads.
    if (typeof data.token === "string" && data.token) {
      setNativeToken(data.token);
      debugLog("auth", "fetchMe — rotated token stored");
    }
    const authUser: AuthUser | null = data.user ?? null;
    saveCachedAuthUser(authUser);
    return authUser;
  } catch (err) {
    clearTimeout(timeoutId);
    debugLog("auth", `fetchMe — NETWORK ERROR / TIMEOUT: ${err}`);

    // AbortErrors fall into two cases:
    // 1. Our internal timeout controller fired (name includes "TimeoutError") — rethrow
    //    so React Query retries (the server may just be slow).
    // 2. React Query cancelled the request (component unmount / query cancelled).
    //    Rethrowing here lets React Query handle it cleanly without treating it as
    //    a "null" response that would wipe the auth cache and redirect to /login.
    // In both cases: rethrow, never return null from an abort.
    if (err instanceof DOMException && err.name === "AbortError") throw err;

    // On genuine network failures (offline, server completely unreachable) return
    // the last known cached user so the session isn't destroyed by a transient
    // outage — the user is probably still authenticated.
    return loadCachedAuthUser();
  }
}

export function useAuth() {
  const {
    data: user,
    isLoading,
    isFetching,
    isPlaceholderData,
  } = useQuery<AuthUser | null>({
    queryKey: ["auth-me"],
    queryFn: fetchMe,
    placeholderData: loadCachedAuthUser(),
    retry: 2,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await performLogout();
      if (!res.ok) throw new Error(`Logout failed: ${res.status}`);
    },
    onSuccess: () => {
      clearNativeToken();
      saveCachedAuthUser(null);
      queryClient.setQueryData(["auth-me"], null);
      queryClient.clear();
      window.location.replace("/login?logout=1");
    },
    onError: () => {
      // Server unreachable — clear local state and navigate anyway
      clearNativeToken();
      saveCachedAuthUser(null);
      queryClient.setQueryData(["auth-me"], null);
      queryClient.clear();
      window.location.replace("/login?logout=1");
    },
  });

  const u = user ?? null;

  // Keep the api.ts auth-state tracker and error capture user in sync.
  useEffect(() => {
    setAuthenticatedUserId(u?.id ?? null);
    setErrorCaptureUser(u?.id ?? null);
  }, [u?.id]);

  // Periodically ping the server so the branch is known to be online.
  // Powers "branch offline" push alerts for owners/admins.
  useEffect(() => {
    const branchId = u?.activeBranchId;
    if (!branchId) return;

    const sendHeartbeat = () => {
      if (!navigator.onLine) return;
      nativeFetch(`/api/admin/branches/${branchId}/heartbeat`, {
        method: "POST",
      }).catch(() => {});
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 5 * 60 * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") sendHeartbeat();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [u?.activeBranchId]);

  return {
    user: u,
    isLoading,
    isFetching,
    isPlaceholderData,
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
