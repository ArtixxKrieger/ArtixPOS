import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertPendingOrder } from "@shared/schema";
import { getCached, setCached, patchCached, queueMutation } from "@/lib/offline-db";
import { nativeFetch } from "@/lib/queryClient";

const LIST_URL = api.pendingOrders.list.path;

export function usePendingOrders() {
  return useQuery({
    queryKey: [LIST_URL],
    queryFn: async () => {
      try {
        const res = await nativeFetch(LIST_URL);
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
      let res: Response;
      try {
        res = await nativeFetch(api.pendingOrders.create.path, {
          method: api.pendingOrders.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch {
        // True network failure — go offline
        await queueMutation("POST", api.pendingOrders.create.path, data, "pending-order");
        const optimistic = { ...data, id: Date.now(), createdAt: new Date().toISOString() };
        await patchCached(LIST_URL, (prev: any[]) => [...prev, optimistic]);
        return optimistic as any;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Server error ${res.status}`);
      }
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
      let res: Response;
      try {
        res = await nativeFetch(url, {
          method: api.pendingOrders.delete.method,
        });
      } catch {
        // True network failure — go offline
        await queueMutation("DELETE", url, undefined, "pending-order");
        await patchCached(LIST_URL, (prev: any[]) => prev.filter((o: any) => o.id !== id));
        return;
      }
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Server error ${res.status}`);
      }
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
      let res: Response;
      try {
        res = await nativeFetch(url, {
          method: api.pendingOrders.update.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch {
        // True network failure — go offline
        await queueMutation("PUT", url, data, "pending-order");
        await patchCached(LIST_URL, (prev: any[]) => prev.map((o: any) => (o.id === id ? { ...o, ...data } : o)));
        return { id, ...data } as any;
      }
      if (!res.ok) {
        if (res.status === 404) throw new Error("Order not found");
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Server error ${res.status}`);
      }
      const result = api.pendingOrders.update.responses[200].parse(await res.json());
      await patchCached(LIST_URL, (prev: any[]) => prev.map((o: any) => (o.id === id ? result : o)));
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_URL] }),
  });
}
