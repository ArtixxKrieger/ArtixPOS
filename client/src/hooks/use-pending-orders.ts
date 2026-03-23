import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertPendingOrder } from "@shared/schema";
import { getCached, setCached, patchCached, queueMutation, isNetworkError } from "@/lib/offline-db";

const LIST_URL = api.pendingOrders.list.path;

export function usePendingOrders() {
  return useQuery({
    queryKey: [LIST_URL],
    queryFn: async () => {
      try {
        const res = await fetch(LIST_URL, { credentials: "include" });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = api.pendingOrders.list.responses[200].parse(await res.json());
        await setCached(LIST_URL, data);
        return data;
      } catch (err) {
        const cached = await getCached<ReturnType<typeof api.pendingOrders.list.responses[200]["parse"]>>(LIST_URL);
        if (cached !== null) return cached;
        throw err;
      }
    },
  });
}

export function useCreatePendingOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertPendingOrder) => {
      try {
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
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await queueMutation("POST", api.pendingOrders.create.path, data, "pending-order");
        const optimistic = { ...data, id: Date.now(), createdAt: new Date().toISOString() };
        await patchCached(LIST_URL, (prev: any[]) => [...prev, optimistic]);
        return optimistic as any;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_URL] }),
  });
}

export function useDeletePendingOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.pendingOrders.delete.path, { id });
      try {
        const res = await fetch(url, {
          method: api.pendingOrders.delete.method,
          credentials: "include",
        });
        if (!res.ok && res.status !== 404) throw new Error("Failed to delete pending order");
        await patchCached(LIST_URL, (prev: any[]) => prev.filter((o: any) => o.id !== id));
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await queueMutation("DELETE", url, undefined, "pending-order");
        await patchCached(LIST_URL, (prev: any[]) => prev.filter((o: any) => o.id !== id));
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_URL] }),
  });
}

export function useUpdatePendingOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<InsertPendingOrder>) => {
      const url = buildUrl(api.pendingOrders.update.path, { id });
      try {
        const res = await fetch(url, {
          method: api.pendingOrders.update.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to update pending order");
        const result = api.pendingOrders.update.responses[200].parse(await res.json());
        await patchCached(LIST_URL, (prev: any[]) => prev.map((o: any) => (o.id === id ? result : o)));
        return result;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await queueMutation("PUT", url, data, "pending-order");
        await patchCached(LIST_URL, (prev: any[]) => prev.map((o: any) => (o.id === id ? { ...o, ...data } : o)));
        return { id, ...data } as any;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_URL] }),
  });
}
