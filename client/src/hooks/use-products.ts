import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertProduct } from "@shared/schema";
import { getCached, setCached, patchCached, queueMutation } from "@/lib/offline-db";

const LIST_URL = api.products.list.path;

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export function useProducts() {
  return useQuery({
    queryKey: [LIST_URL],
    queryFn: async () => {
      try {
        const res = await fetch(LIST_URL, { credentials: "include" });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = api.products.list.responses[200].parse(await res.json());
        await setCached(LIST_URL, data);
        return data;
      } catch (err) {
        const cached = await getCached<ReturnType<typeof api.products.list.responses[200]["parse"]>>(LIST_URL);
        if (cached !== null) return cached;
        throw err;
      }
    },
  });
}

export function useProduct(id: number) {
  return useQuery({
    queryKey: [api.products.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.products.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch product");
      return api.products.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertProduct) => {
      try {
        const res = await fetch(api.products.create.path, {
          method: api.products.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        });
        if (!res.ok) {
          if (res.status === 400) {
            const err = api.products.create.responses[400].parse(await res.json());
            throw new Error(err.message);
          }
          throw new Error("Failed to create product");
        }
        const result = api.products.create.responses[201].parse(await res.json());
        await patchCached(LIST_URL, (prev: any[]) => [...prev, result]);
        return result;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await queueMutation("POST", api.products.create.path, data);
        const optimistic = { ...data, id: Date.now(), sizes: data.sizes ?? [], modifiers: data.modifiers ?? [] };
        await patchCached(LIST_URL, (prev: any[]) => [...prev, optimistic]);
        return optimistic as any;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_URL] }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<InsertProduct>) => {
      const url = buildUrl(api.products.update.path, { id });
      try {
        const res = await fetch(url, {
          method: api.products.update.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to update product");
        const result = api.products.update.responses[200].parse(await res.json());
        await patchCached(LIST_URL, (prev: any[]) => prev.map((p) => (p.id === id ? result : p)));
        return result;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await queueMutation("PUT", url, data);
        await patchCached(LIST_URL, (prev: any[]) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
        return { id, ...data } as any;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_URL] }),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.products.delete.path, { id });
      try {
        const res = await fetch(url, {
          method: api.products.delete.method,
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to delete product");
        await patchCached(LIST_URL, (prev: any[]) => prev.filter((p) => p.id !== id));
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await queueMutation("DELETE", url);
        await patchCached(LIST_URL, (prev: any[]) => prev.filter((p) => p.id !== id));
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_URL] }),
  });
}
