import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type PendingOrder, type InsertPendingOrder, type Product } from "@shared/schema";
import { getCached, setCached, patchCached, queueMutation, makeOfflineId, isOfflineId, isNetworkError } from "@/lib/offline-db";
import { nativeFetch, queryClient as qc } from "@/lib/queryClient";

const LIST_URL = api.pendingOrders.list.path;

export function usePendingOrders() {
  return useQuery({
    queryKey: [LIST_URL],
    staleTime: 30_000,
    queryFn: async () => {

const idbData = await getCached<ReturnType<typeof api.pendingOrders.list.responses[200]["parse"]>>(LIST_URL);

      if (idbData !== null) {
        nativeFetch(LIST_URL)
          .then(async (res) => {
            if (!res.ok) return;
            const fresh = api.pendingOrders.list.responses[200].parse(await res.json());

const current = qc.getQueryData<PendingOrder[]>([LIST_URL]);
            const freshIds = new Set((fresh ?? []).map((o: any) => String(o.id)));
            const optimisticPending = (Array.isArray(current) ? current : []).filter(
              (o: any) => isOfflineId(String(o.id ?? "")) && !freshIds.has(String(o.id))
            );
            const merged = optimisticPending.length > 0
              ? [...optimisticPending, ...fresh]
              : fresh;
            setCached(LIST_URL, fresh).catch(() => {});
            qc.setQueryData([LIST_URL], merged);
          })
          .catch(() => {});
        return idbData;
      }

try {
        const res = await nativeFetch(LIST_URL);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = api.pendingOrders.list.responses[200].parse(await res.json());
        setCached(LIST_URL, data).catch(() => {});
        return data;
      } catch (err) {

const retry = await getCached<ReturnType<typeof api.pendingOrders.list.responses[200]["parse"]>>(LIST_URL);
        if (retry !== null) return retry;
        throw err;
      }
    },
    select: (data: any) => (Array.isArray(data) ? data : []),
  });
}

const CHECKOUT_TIMEOUT_MS = 10_000;

export function useCreatePendingOrder() {
  const queryClient = useQueryClient();
  return useMutation({

onMutate: async (data: InsertPendingOrder) => {
      await queryClient.cancelQueries({ queryKey: [LIST_URL] });
      const previous = queryClient.getQueryData<PendingOrder[]>([LIST_URL]);
      const tempId = makeOfflineId();
      const optimistic = {
        ...data,
        id: tempId as unknown as number,
        createdAt: new Date().toISOString(),
        _pendingSync: true,
      } as unknown as PendingOrder;
      queryClient.setQueryData<PendingOrder[]>([LIST_URL], (old) =>
        Array.isArray(old) ? [...old, optimistic] : [optimistic]
      );
      return { previous, tempId };
    },
    onError: (_err: unknown, _vars: InsertPendingOrder, context: any) => {
      if (context?.previous)
        queryClient.setQueryData<PendingOrder[]>([LIST_URL], context.previous);
    },
    mutationFn: async (data: InsertPendingOrder) => {
      let res: Response;

const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new DOMException("Checkout request timed out", "TimeoutError")),
        CHECKOUT_TIMEOUT_MS,
      );

      try {
        res = await nativeFetch(api.pendingOrders.create.path, {
          method: api.pendingOrders.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal: controller.signal,
        });
      } catch {
        clearTimeout(timer);

const tempId = makeOfflineId();
        await queueMutation(
          "POST",
          api.pendingOrders.create.path,
          data,
          "pending-order",
          tempId,
        );
        const optimistic = {
          ...data,
          id: tempId,
          createdAt: new Date().toISOString(),
          _pendingSync: true,
        };

await patchCached(LIST_URL, (prev: PendingOrder[]) => [
          ...(Array.isArray(prev) ? prev : []),
          optimistic as unknown as PendingOrder,
        ]);

await patchCached("/api/sales", (prev: any[]) => [
          optimistic as any,
          ...(Array.isArray(prev) ? prev : []),
        ]);

const statsPrev = await getCached<any>("/api/dashboard/stats");
        if (statsPrev) {
          await setCached("/api/dashboard/stats", {
            ...statsPrev,
            todaySales: [optimistic, ...(Array.isArray(statsPrev.todaySales) ? statsPrev.todaySales : [])],
          });
        }

        return optimistic as unknown as PendingOrder;
      }
      clearTimeout(timer);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string })?.message ?? `Server error ${res.status}`);
      }

let result: PendingOrder;
      try {
        result = api.pendingOrders.create.responses[201].parse(await res.json());
      } catch {

result = { ...data, id: 0, createdAt: new Date().toISOString() } as unknown as PendingOrder;
      }

      await patchCached(LIST_URL, (prev: PendingOrder[]) => [...(Array.isArray(prev) ? prev : []), result]);
      return result;
    },
    onSuccess: (result, _vars, context: any) => {

queryClient.setQueryData<PendingOrder[]>([LIST_URL], (old) => {
        if (!Array.isArray(old)) return [result];
        const filtered = old.filter(
          (o: any) =>
            String(o.id) !== String(context?.tempId) &&
            String(o.id) !== String(result.id)
        );
        return [...filtered, result];
      });

if (isOfflineId(String(result.id ?? ""))) {

queryClient.setQueriesData<any[]>({ queryKey: ["/api/sales"] }, (old) =>
          Array.isArray(old) ? [result, ...old] : [result]
        );

queryClient.setQueryData<any>(["/api/dashboard/stats"], (old: any) => {
          if (!old || !Array.isArray(old.todaySales)) return old;
          return {
            ...old,
            todaySales: [result, ...old.todaySales],
          };
        });
      }

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
      } catch (err) {
        if (isNetworkError(err)) throw new Error("You're offline — connect to delete orders.");
        throw err;
      }
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string })?.message ?? `Server error ${res.status}`);
      }
      await patchCached(LIST_URL, (prev: PendingOrder[]) => Array.isArray(prev) ? prev.filter((o) => o.id !== id) : []);
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
      } catch (err) {
        if (isNetworkError(err)) throw new Error("You're offline — connect to update orders.");
        throw err;
      }
      if (!res.ok) {
        if (res.status === 404) throw new Error("Order not found");
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string })?.message ?? `Server error ${res.status}`);
      }
      const result = api.pendingOrders.update.responses[200].parse(await res.json());
      await patchCached(LIST_URL, (prev: PendingOrder[]) => Array.isArray(prev) ? prev.map((o) => (o.id === id ? result : o)) : []);
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
