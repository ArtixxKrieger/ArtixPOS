import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertPendingOrder } from "@shared/schema";

export function usePendingOrders() {
  return useQuery({
    queryKey: [api.pendingOrders.list.path],
    queryFn: async () => {
      const res = await fetch(api.pendingOrders.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pending orders");
      return api.pendingOrders.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreatePendingOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertPendingOrder) => {
      const res = await fetch(api.pendingOrders.create.path, {
        method: api.pendingOrders.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create pending order");
      return api.pendingOrders.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.pendingOrders.list.path] }),
  });
}

export function useDeletePendingOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.pendingOrders.delete.path, { id });
      const res = await fetch(url, {
        method: api.pendingOrders.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete pending order");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.pendingOrders.list.path] }),
  });
}
