import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { resolveUrl, clearNativeToken, nativeFetch, NATIVE_TOKEN_KEY, getCsrfHeaders } from "@/lib/queryClient";
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

async function fetchMe(): Promise<AuthUser | null> {
  const token = localStorage.getItem(NATIVE_TOKEN_KEY);
  // Only send a Bearer token for native (Capacitor) clients where API_BASE is set.
  // Web clients authenticate via httpOnly cookie — never trust a localStorage token
  // for web sessions, as any JS on the page could read or forge it.
  const isNative = !!API_BASE;
  const headers: Record<string, string> =
    isNative && token ? { Authorization: `Bearer ${token}` } : {};
  const credentials: RequestCredentials = isNative ? "omit" : "include";

  try {
    debugLog("auth", `fetchMe — token=${token ? "YES" : "NO"} url=${resolveUrl("/api/auth/me")}`);
    const res = await fetch(resolveUrl("/api/auth/me"), { credentials, headers });
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
    return data.user ?? null;
  } catch (err) {
    // Network error — always return null and require re-authentication.
    // Never decode the JWT locally; the signature cannot be verified in the browser
    // and a forged token could grant attacker-controlled role/permissions.
    debugLog("auth", `fetchMe — NETWORK ERROR: ${err}`);
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
      clearApiCache().catch(() => {});
    },
    onSuccess: () => {
      queryClient.setQueryData(["auth-me"], null);
      queryClient.clear();
      window.location.href = "/login";
    },
    onError: () => {
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
