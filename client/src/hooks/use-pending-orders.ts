import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertPendingOrder } from "@shared/schema";
import { getCached, setCached, patchCached, queueMutation, isOffline } from "@/lib/offline-db";

const LIST_URL = api.pendingOrders.list.path;

export function usePendingOrders() {
  return useQuery({
    queryKey: [LIST_URL],
    queryFn: async () => {
      if (isOffline()) {
        const cached = await getCached<ReturnType<typeof api.pendingOrders.list.responses[200]["parse"]>>(LIST_URL);
        if (cached) return cached;
        throw new Error("Offline — no cached orders available");
      }
      const res = await fetch(LIST_URL, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pending orders");
      const data = api.pendingOrders.list.responses[200].parse(await res.json());
      await setCached(LIST_URL, data);
      return data;
    },
  });
}

export function useCreatePendingOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertPendingOrder) => {
      if (isOffline()) {
        await queueMutation("POST", api.pendingOrders.create.path, data);
        const optimistic = { ...data, id: Date.now(), createdAt: new Date().toISOString() };
        await patchCached(LIST_URL, (prev: any[]) => [...prev, optimistic]);
        return optimistic as any;
      }
      const res = await fetch(api.pendingOrders.create.path, {
        method: api.pendingOrders.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create pending order");
      const result = api.pendingOrders.create.responses[201].parse(await res.json());
      await patchCached(LIST_URL, (prev: any[]) => [...prev, result]);
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_URL] }),
  });
}

export function useDeletePendingOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.pendingOrders.delete.path, { id });
      if (isOffline()) {
        await queueMutation("DELETE", url);
        await patchCached(LIST_URL, (prev: any[]) => prev.filter((o: any) => o.id !== id));
        return;
      }
      const res = await fetch(url, {
        method: api.pendingOrders.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete pending order");
      await patchCached(LIST_URL, (prev: any[]) => prev.filter((o: any) => o.id !== id));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_URL] }),
  });
}

export function useUpdatePendingOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<InsertPendingOrder>) => {
      const url = buildUrl(api.pendingOrders.update.path, { id });
      if (isOffline()) {
        await queueMutation("PUT", url, data);
        await patchCached(LIST_URL, (prev: any[]) =>
          prev.map((o: any) => (o.id === id ? { ...o, ...data } : o))
        );
        return { id, ...data } as any;
      }
      const res = await fetch(url, {
        method: api.pendingOrders.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update pending order");
      const json = await res.json();
      const result = api.pendingOrders.update.responses[200].parse(json);
      await patchCached(LIST_URL, (prev: any[]) =>
        prev.map((o: any) => (o.id === id ? result : o))
      );
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_URL] }),
  });
}
