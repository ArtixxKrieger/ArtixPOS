import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  provider: string;
}

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  const data = await res.json();
  return data.user ?? null;
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
      await fetch("/auth/logout", { method: "POST", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.setQueryData(["auth-me"], null);
      queryClient.clear();
      window.location.href = "/login";
    },
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
  };
}
