import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { type InsertSale } from "@shared/schema";
import { getCached, setCached, patchCached, queueMutation } from "@/lib/offline-db";

const LIST_URL = api.sales.list.path;

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export function useSales() {
  return useQuery({
    queryKey: [LIST_URL],
    queryFn: async () => {
      try {
        const res = await fetch(LIST_URL, { credentials: "include" });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = api.sales.list.responses[200].parse(await res.json());
        await setCached(LIST_URL, data);
        return data;
      } catch (err) {
        const cached = await getCached<ReturnType<typeof api.sales.list.responses[200]["parse"]>>(LIST_URL);
        if (cached !== null) return cached;
        throw err;
      }
    },
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertSale) => {
      try {
        const res = await fetch(api.sales.create.path, {
          method: api.sales.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to record sale");
        const result = api.sales.create.responses[201].parse(await res.json());
        return result;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await queueMutation("POST", api.sales.create.path, data);
        const optimistic = { ...data, id: Date.now(), createdAt: new Date().toISOString() };
        await patchCached(LIST_URL, (prev: any[]) => [...prev, optimistic]);
        return optimistic as any;
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData([LIST_URL], (old: any[] | undefined) => [
        ...(old ?? []),
        result,
      ]);
      const fresh = queryClient.getQueryData<any[]>([LIST_URL]);
      if (fresh) setCached(LIST_URL, fresh);
      queryClient.invalidateQueries({ queryKey: [LIST_URL] });
    },
  });
}
