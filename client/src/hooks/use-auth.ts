import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { resolveUrl, clearNativeToken, nativeFetch, NATIVE_TOKEN_KEY } from "@/lib/queryClient";
import { clearAllCache } from "@/lib/offline-db";
import { debugLog } from "@/lib/debug-log";

export interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  provider: string;
  tenantId: string | null;
  role: "owner" | "manager" | "admin" | "cashier";
  activeBranchId: number | null;
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
    };
  } catch {
    return null;
  }
}

async function fetchMe(): Promise<AuthUser | null> {
  const token = localStorage.getItem(NATIVE_TOKEN_KEY);
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  // When using a Bearer token (native) omit credentials — cookies are same-origin
  // only and sending them cross-origin requires Allow-Credentials which we avoid.
  const credentials: RequestCredentials = token ? "omit" : "include";

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
    staleTime: 1000 * 60 * 5,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Attempt server-side logout. On native this goes cross-origin so we must
      // use nativeFetch (with Bearer token still present at call time).
      try {
        await nativeFetch(resolveUrl("/auth/logout"), { method: "POST" });
      } catch {
        // If offline or CORS fails, still proceed with local logout
      }
      // Clear local state AFTER the server call so the request still has auth
      clearNativeToken();
      await clearAllCache();
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
    isOwner: u?.role === "owner",
    isManager: u?.role === "manager",
    isAdmin: u?.role === "admin",
    isCashier: u?.role === "cashier",
    isManagerOrAbove: u?.role === "owner" || u?.role === "manager",
    isAdminOrAbove: u?.role === "owner" || u?.role === "manager" || u?.role === "admin",
  };
}
