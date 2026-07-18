import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ActiveSession {
  id: string;
  jti: string;
  userId: string;
  deviceName: string | null;
  ipAddress: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  expiresAt: string;
  current: boolean;
}

const QK = ["sessions"] as const;

export function useSessions() {
  return useQuery<ActiveSession[]>({
    queryKey: QK,
    queryFn: async () => {
      const res = await api.get<ActiveSession[]>("/api/sessions");
      return res.data;
    },
    staleTime: 30_000,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.delete(`/api/sessions/${sessionId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useRevokeAllOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete("/api/sessions"),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}
