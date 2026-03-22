import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { type InsertSale } from "@shared/schema";
import { getCached, setCached, patchCached, queueMutation, isOffline } from "@/lib/offline-db";

const LIST_URL = api.sales.list.path;

export function useSales() {
  return useQuery({
    queryKey: [LIST_URL],
    queryFn: async () => {
      if (isOffline()) {
        const cached = await getCached<ReturnType<typeof api.sales.list.responses[200]["parse"]>>(LIST_URL);
        if (cached) return cached;
        throw new Error("Offline — no cached sales available");
      }
      const res = await fetch(LIST_URL, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sales");
      const data = api.sales.list.responses[200].parse(await res.json());
      await setCached(LIST_URL, data);
      return data;
    },
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertSale) => {
      if (isOffline()) {
        await queueMutation("POST", api.sales.create.path, data);
        const optimistic = { ...data, id: Date.now(), createdAt: new Date().toISOString() };
        await patchCached(LIST_URL, (prev: any[]) => [...prev, optimistic]);
        return optimistic as any;
      }
      const res = await fetch(api.sales.create.path, {
        method: api.sales.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to record sale");
      const result = api.sales.create.responses[201].parse(await res.json());
      await patchCached(LIST_URL, (prev: any[]) => [...prev, result]);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LIST_URL] });
    },
  });
}
