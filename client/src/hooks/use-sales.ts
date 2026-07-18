import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { type InsertSale } from "@shared/schema";
import {
  getCached,
  setCached,
  patchCached,
  queueMutation,
  makeOfflineId,
  isOfflineId,
} from "@/lib/offline-db";
import { nativeFetch, queryClient as qc } from "@/lib/queryClient";

const BASE_URL = api.sales.list.path;

export interface SalesQueryParams {
  startDate?: string;
  endDate?: string;
  limit?: number;
  includeVoided?: boolean;
}

function buildSalesUrl(params?: SalesQueryParams): string {
  if (!params) return BASE_URL;
  const qs = new URLSearchParams();
  if (params.startDate) qs.set("startDate", params.startDate);
  if (params.endDate) qs.set("endDate", params.endDate);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.includeVoided) qs.set("includeVoided", "1");
  const str = qs.toString();
  return str ? `${BASE_URL}?${str}` : BASE_URL;
}

function buildCacheKey(url: string, params?: SalesQueryParams): string {
  return params ? url : BASE_URL;
}

export function useSales(params?: SalesQueryParams) {
  const url = buildSalesUrl(params);
  const cacheKey = params
    ? [
        BASE_URL,
        params.startDate ?? "",
        params.endDate ?? "",
        params.limit ?? 200,
        params.includeVoided ? "voided" : "",
      ]
    : [BASE_URL];

  return useQuery({
    queryKey: cacheKey,
    queryFn: async () => {
      const idbKey = buildCacheKey(url, params);

      const idbData =
        await getCached<ReturnType<(typeof api.sales.list.responses)[200]["parse"]>>(idbKey);

      if (idbData !== null) {
        nativeFetch(url)
          .then(async (res) => {
            if (!res.ok) return;
            const fresh = api.sales.list.responses[200].parse(await res.json());

            const current = qc.getQueryData<any[]>(cacheKey);
            const freshIds = new Set((fresh ?? []).map((s: any) => String(s.id)));
            const offlinePending = (Array.isArray(current) ? current : []).filter(
              (s: any) => isOfflineId(String(s.id ?? "")) && !freshIds.has(String(s.id)),
            );
            const merged = offlinePending.length > 0 ? [...offlinePending, ...fresh] : fresh;
            setCached(idbKey, fresh).catch(() => {});
            qc.setQueryData(cacheKey, merged);
          })
          .catch(() => {});
        return idbData;
      }

      try {
        const res = await nativeFetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = api.sales.list.responses[200].parse(await res.json());
        await setCached(idbKey, data);
        return data;
      } catch (err) {
        const cached =
          await getCached<ReturnType<(typeof api.sales.list.responses)[200]["parse"]>>(idbKey);
        if (cached !== null) return cached;
        if (!params) {
          const base =
            await getCached<ReturnType<(typeof api.sales.list.responses)[200]["parse"]>>(BASE_URL);
          if (base !== null) return base;
        }
        throw err;
      }
    },
    staleTime: 30_000,
    select: (data: any) => (Array.isArray(data) ? data : []),
  });
}

const SALE_TIMEOUT_MS = 10_000;

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertSale) => {
      let res: Response;

      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new DOMException("Sale request timed out", "TimeoutError")),
        SALE_TIMEOUT_MS,
      );

      try {
        res = await nativeFetch(api.sales.create.path, {
          method: api.sales.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal: controller.signal,
        });
      } catch {
        clearTimeout(timer);

        const tempId = makeOfflineId();
        await queueMutation("POST", api.sales.create.path, data, "sale", tempId);
        const optimistic = {
          ...data,
          id: tempId,
          createdAt: new Date().toISOString(),
          _pendingSync: true,
        };

        await patchCached(BASE_URL, (prev: any[]) => [
          optimistic,
          ...(Array.isArray(prev) ? prev : []),
        ]);

        const statsPrev = await getCached<any>("/api/dashboard/stats");
        if (statsPrev) {
          await setCached("/api/dashboard/stats", {
            ...statsPrev,
            todaySales: [
              optimistic,
              ...(Array.isArray(statsPrev.todaySales) ? statsPrev.todaySales : []),
            ],
          });
        }
        return optimistic as any;
      }
      clearTimeout(timer);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Server error ${res.status}`);
      }

      let result: ReturnType<(typeof api.sales.create.responses)[201]["parse"]>;
      try {
        result = api.sales.create.responses[201].parse(await res.json());
      } catch {
        result = { ...data, id: 0, createdAt: new Date().toISOString() } as any;
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.setQueriesData({ queryKey: [BASE_URL] }, (old: any[] | undefined) => [
        result,
        ...(old ?? []),
      ]);
      const fresh = queryClient.getQueryData<any[]>([BASE_URL]);
      if (fresh) setCached(BASE_URL, fresh);

      // Optimistically add the new sale to the dashboard stats immediately
      queryClient.setQueryData<any>(["/api/dashboard/stats"], (old: any) => {
        if (!old || !Array.isArray(old.todaySales)) return old;
        const updated = { ...old, todaySales: [result, ...old.todaySales] };
        // Keep the offline cache in sync too, otherwise the invalidation below
        // re-reads stale IndexedDB data and clobbers this update until the
        // background network refetch finishes.
        setCached("/api/dashboard/stats", updated).catch(() => {});
        return updated;
      });
      // Also invalidate so a fresh fetch happens in the background
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });

      if (Array.isArray(result.items)) {
        const deductions = new Map<number, number>();
        for (const item of result.items as any[]) {
          const pid = Number(item?.productId ?? item?.id ?? item?.product?.id);
          const qty = Number(item?.quantity ?? 1);
          if (Number.isFinite(pid) && pid > 0 && qty > 0)
            deductions.set(pid, (deductions.get(pid) ?? 0) + qty);
        }
        if (deductions.size > 0) {
          // Guard: returning undefined from the updater removes the cache entry
          // in React Query v5, causing a full loading flash.  Only patch when
          // products are already in cache.
          const cachedProducts = queryClient.getQueryData<any[]>(["/api/products"]);
          if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
            queryClient.setQueryData<any[]>(["/api/products"], (old) =>
              Array.isArray(old)
                ? old.map((p: any) => {
                    const sold = deductions.get(p.id);
                    if (!sold || !p.trackStock) return p;
                    return { ...p, stock: Math.max(0, (p.stock ?? 0) - sold) };
                  })
                : old,
            );
          }
        }
      }
    },
  });
}

export function useDeleteSale() {
  const queryClient = useQueryClient();
  return useMutation({
    onMutate: async ({ id }: { id: number; reason?: string }) => {
      await queryClient.cancelQueries({ queryKey: [BASE_URL] });
      const previous = queryClient.getQueryData<any[]>([BASE_URL]);
      queryClient.setQueriesData({ queryKey: [BASE_URL] }, (old: any[] | undefined) =>
        Array.isArray(old) ? old.filter((s: any) => s.id !== id) : [],
      );
      return { previous };
    },
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const res = await nativeFetch(`/api/sales/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? "Failed to void sale");
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueriesData({ queryKey: [BASE_URL] }, context.previous);
    },
    onSuccess: (_, { id }) => {
      patchCached(BASE_URL, (prev: any[]) =>
        Array.isArray(prev) ? prev.filter((s: any) => s.id !== id) : [],
      );
      // Voiding a sale affects revenue, stock, and loyalty — refresh all related views
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
  });
}

function useDeletedSales() {
  return useQuery({
    queryKey: ["/api/sales/deleted"],
    queryFn: async () => {
      const res = await nativeFetch("/api/sales/deleted");
      if (!res.ok) return [];
      return res.json();
    },
  });
}
