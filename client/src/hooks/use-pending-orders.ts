import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type PendingOrder, type InsertPendingOrder, type Product } from "@shared/schema";
import { getCached, setCached, patchCached, queueMutation, makeOfflineId } from "@/lib/offline-db";
import { nativeFetch } from "@/lib/queryClient";

const LIST_URL = api.pendingOrders.list.path;

export function usePendingOrders() {
  return useQuery({
    queryKey: [LIST_URL],
    // Data stays fresh for 30 s — route changes within a session never trigger
    // a background re-fetch.  All mutations call setQueryData directly so the
    // cache is always current without needing a stale-triggered refetch.
    staleTime: 30_000,
    queryFn: async () => {
      try {
        const res = await nativeFetch(LIST_URL);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = api.pendingOrders.list.responses[200].parse(await res.json());
        // Fire-and-forget IDB write — resolve immediately without waiting for IDB.
        setCached(LIST_URL, data).catch(() => {});
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
        // Offline — generate a stable temp ID first so both the queue item
        // (offlineId) and the optimistic cache entry reference the same value.
        // foldQueue uses offlineId to collapse a subsequent DELETE into a no-op,
        // and syncOfflineData uses it to remap any subsequent PUT after the real
        // server ID is assigned.
        const tempId = makeOfflineId();
        await queueMutation(
          "POST",
          api.pendingOrders.create.path,
          data,
          "pending-order",
          tempId, // offlineId
        );
        const optimistic = { ...data, id: tempId, createdAt: new Date().toISOString() };
        await patchCached(LIST_URL, (prev: PendingOrder[]) => [...prev, optimistic as unknown as PendingOrder]);
        return optimistic as unknown as PendingOrder;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string })?.message ?? `Server error ${res.status}`);
      }
      const result = api.pendingOrders.create.responses[201].parse(await res.json());
      await patchCached(LIST_URL, (prev: PendingOrder[]) => [...prev, result]);
      return result;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<PendingOrder[]>([LIST_URL], (old) =>
        old ? [...old.filter((o) => o.id !== result.id), result] : [result]
      );
      // Deduct stock in products cache for paid orders
      if (result.status === "paid" && Array.isArray(result.items)) {
        const deductions = new Map<number, number>();
        for (const item of result.items as any[]) {
          const pid = Number(item?.productId ?? item?.id ?? item?.product?.id);
          const qty = Number(item?.quantity ?? 1);
          if (Number.isFinite(pid) && pid > 0 && qty > 0)
            deductions.set(pid, (deductions.get(pid) ?? 0) + qty);
        }
        if (deductions.size > 0) {
          queryClient.setQueryData<Product[]>(["/api/products"], (old) =>
            old ? old.map((p) => {
              const sold = deductions.get(p.id);
              if (!sold || !p.trackStock) return p;
              return { ...p, stock: Math.max(0, (p.stock ?? 0) - sold) };
            }) : old
          );
        }
      }
    },
  });
}

export function useDeletePendingOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: [LIST_URL] });
      const previous = queryClient.getQueryData<PendingOrder[]>([LIST_URL]);
      queryClient.setQueryData<PendingOrder[]>([LIST_URL], (old) =>
        old ? old.filter((o) => o.id !== id) : []
      );
      return { previous };
    },
    mutationFn: async (id: number) => {
      const url = buildUrl(api.pendingOrders.delete.path, { id });
      let res: Response;
      try {
        res = await nativeFetch(url, { method: api.pendingOrders.delete.method });
      } catch {
        await queueMutation("DELETE", url, undefined, "pending-order");
        await patchCached(LIST_URL, (prev: PendingOrder[]) => prev.filter((o) => o.id !== id));
        return;
      }
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string })?.message ?? `Server error ${res.status}`);
      }
      await patchCached(LIST_URL, (prev: PendingOrder[]) => prev.filter((o) => o.id !== id));
    },
    onError: (_err, _id, context) => {
      if (context?.previous)
        queryClient.setQueryData<PendingOrder[]>([LIST_URL], context.previous);
    },
  });
}

export function useUpdatePendingOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    onMutate: async ({ id, ...data }: { id: number } & Partial<InsertPendingOrder>) => {
      await queryClient.cancelQueries({ queryKey: [LIST_URL] });
      const previous = queryClient.getQueryData<PendingOrder[]>([LIST_URL]);
      queryClient.setQueryData<PendingOrder[]>([LIST_URL], (old) =>
        old ? old.map((o) => (o.id === id ? { ...o, ...data } : o)) : []
      );
      return { previous };
    },
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
        await queueMutation("PUT", url, data, "pending-order");
        await patchCached(LIST_URL, (prev: PendingOrder[]) => prev.map((o) => (o.id === id ? { ...o, ...data } : o)));
        return { id, ...data } as unknown as PendingOrder;
      }
      if (!res.ok) {
        if (res.status === 404) throw new Error("Order not found");
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string })?.message ?? `Server error ${res.status}`);
      }
      const result = api.pendingOrders.update.responses[200].parse(await res.json());
      await patchCached(LIST_URL, (prev: PendingOrder[]) => prev.map((o) => (o.id === id ? result : o)));
      return result;
    },
    onError: (_err, _vars, context) => {
      if (context?.previous)
        queryClient.setQueryData<PendingOrder[]>([LIST_URL], context.previous);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<PendingOrder[]>([LIST_URL], (old) =>
        old ? old.map((o) => (o.id === result.id ? result : o)) : []
      );
    },
  });
}
