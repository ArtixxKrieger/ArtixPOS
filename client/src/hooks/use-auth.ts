import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { nativeFetch, clearNativeToken, NATIVE_TOKEN_KEY } from "@/lib/queryClient";
import { clearAllCache } from "@/lib/offline-db";
import { debugLog } from "@/lib/debug-log";
import { clearSettingsPrewarm } from "@/hooks/use-settings";
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
  const token = localStorage.getItem(NATIVE_TOKEN_KEY);
  const isNative = !!API_BASE;

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
    debugLog("auth", `fetchMe — token=${token ? "YES" : "NO"}`);
    const res = await nativeFetch("/api/auth/me", { signal: controller.signal });
    clearTimeout(timeoutId);
    debugLog("auth", `fetchMe — status=${res.status}`);
    if (res.status === 401) {
      if (isNative && token) {
        debugLog("auth", "fetchMe — stale native token detected, clearing");
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
    const authUser: AuthUser | null = data.user ?? null;
    saveCachedAuthUser(authUser);
    return authUser;
  } catch (err) {
    clearTimeout(timeoutId);
    debugLog("auth", `fetchMe — NETWORK ERROR / TIMEOUT: ${err}`);
    // Do NOT clear the auth cache on network errors / timeouts / AbortErrors.
    // Returning null here would call saveCachedAuthUser(null), wipe localStorage,
    // and redirect the user to login — even though they are still authenticated.
    // Return the last known good user so the session survives transient failures.
    return loadCachedAuthUser();
  }
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, isFetching } = useQuery<AuthUser | null>({
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
      try {
        await nativeFetch("/auth/logout", { method: "POST" });
      } catch {
      }
      clearNativeToken();
      saveCachedAuthUser(null);
      await clearSettingsPrewarm().catch(() => {});
      clearAllCache().catch(() => {});
    },
    onSuccess: () => {
      queryClient.cancelQueries();
      queryClient.clear();
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
