import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  return useMutation({
    mutationFn: (sessionId: string) => api.delete(`/api/sessions/${sessionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({
        title: "Device signed out",
        description: "That device will be redirected to the login page on its next action.",
      });
    },
    onError: () => {
      toast({ title: "Failed to sign out device", variant: "destructive" });
    },
  });
}

export function useRevokeAllOtherSessions() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => api.delete("/api/sessions"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({
        title: "All other devices signed out",
        description: "Any other active sessions will be redirected to login shortly.",
      });
    },
    onError: () => {
      toast({ title: "Failed to sign out other devices", variant: "destructive" });
    },
  });
}
