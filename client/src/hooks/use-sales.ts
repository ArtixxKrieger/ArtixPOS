import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { type InsertSale } from "@shared/schema";
import { getCached, setCached, patchCached, queueMutation } from "@/lib/offline-db";
import { nativeFetch } from "@/lib/queryClient";

const BASE_URL = api.sales.list.path;

export interface SalesQueryParams {
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  includeVoided?: boolean;
}

function buildSalesUrl(params?: SalesQueryParams): string {
  if (!params) return BASE_URL;
  const qs = new URLSearchParams();
  if (params.startDate) qs.set("startDate", params.startDate);
  if (params.endDate) qs.set("endDate", params.endDate);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
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
    ? [BASE_URL, params.startDate ?? "", params.endDate ?? "", params.limit ?? 200, params.offset ?? 0, params.includeVoided ? "voided" : ""]
    : [BASE_URL];

  return useQuery({
    queryKey: cacheKey,
    queryFn: async () => {
      const idbKey = buildCacheKey(url, params);
      try {
        const res = await nativeFetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = api.sales.list.responses[200].parse(await res.json());
        await setCached(idbKey, data);
        return data;
      } catch (err) {
        const cached = await getCached<ReturnType<typeof api.sales.list.responses[200]["parse"]>>(idbKey);
        if (cached !== null) return cached;
        if (!params) {
          const base = await getCached<ReturnType<typeof api.sales.list.responses[200]["parse"]>>(BASE_URL);
          if (base !== null) return base;
        }
        throw err;
      }
    },
    staleTime: 30_000,
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertSale) => {
      let res: Response;
      try {
        res = await nativeFetch(api.sales.create.path, {
          method: api.sales.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch {
        await queueMutation("POST", api.sales.create.path, data, "sale");
        const optimistic = { ...data, id: Date.now(), createdAt: new Date().toISOString() };
        await patchCached(BASE_URL, (prev: any[]) => [...prev, optimistic]);
        return optimistic as any;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Server error ${res.status}`);
      }
      const result = api.sales.create.responses[201].parse(await res.json());
      return result;
    },
    onSuccess: (result) => {
      // Prepend to cache instantly — no refetch needed
      queryClient.setQueriesData({ queryKey: [BASE_URL] }, (old: any[] | undefined) => [
        result,
        ...(old ?? []),
      ]);
      const fresh = queryClient.getQueryData<any[]>([BASE_URL]);
      if (fresh) setCached(BASE_URL, fresh);
      // Deduct product stock in cache
      if (Array.isArray(result.items)) {
        const deductions = new Map<number, number>();
        for (const item of result.items as any[]) {
          const pid = Number(item?.productId ?? item?.id ?? item?.product?.id);
          const qty = Number(item?.quantity ?? 1);
          if (Number.isFinite(pid) && pid > 0 && qty > 0)
            deductions.set(pid, (deductions.get(pid) ?? 0) + qty);
        }
        if (deductions.size > 0) {
          queryClient.setQueryData<any[]>(["/api/products"], (old) =>
            old ? old.map((p: any) => {
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

export function useDeleteSale() {
  const queryClient = useQueryClient();
  return useMutation({
    onMutate: async ({ id }: { id: number; reason?: string }) => {
      await queryClient.cancelQueries({ queryKey: [BASE_URL] });
      const previous = queryClient.getQueryData<any[]>([BASE_URL]);
      queryClient.setQueriesData({ queryKey: [BASE_URL] }, (old: any[] | undefined) =>
        old ? old.filter((s: any) => s.id !== id) : []
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
      if (context?.previous)
        queryClient.setQueriesData({ queryKey: [BASE_URL] }, context.previous);
    },
    onSuccess: (_, { id }) => {
      patchCached(BASE_URL, (prev: any[]) => prev.filter((s: any) => s.id !== id));
    },
  });
}

export function useDeletedSales() {
  return useQuery({
    queryKey: ["/api/sales/deleted"],
    queryFn: async () => {
      const res = await nativeFetch("/api/sales/deleted");
      if (!res.ok) return [];
      return res.json();
    },
  });
}
