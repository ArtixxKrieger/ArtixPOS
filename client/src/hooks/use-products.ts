import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertProduct, type Product } from "@shared/schema";
import { getCached, setCached, patchCached, queueMutation } from "@/lib/offline-db";
import { nativeFetch } from "@/lib/queryClient";

const LIST_URL = api.products.list.path;

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function useProducts() {
  return useQuery({
    queryKey: [LIST_URL],
    queryFn: async () => {
      try {
        const res = await nativeFetch(LIST_URL);
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
      const res = await nativeFetch(url);
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
      let res: Response;
      try {
        res = await nativeFetch(api.products.create.path, {
          method: api.products.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch {
        await queueMutation("POST", api.products.create.path, data);
        const optimistic = { ...data, id: Date.now(), sizes: data.sizes ?? [], modifiers: data.modifiers ?? [] };
        await patchCached(LIST_URL, (prev: any[]) => [...prev, optimistic]);
        return optimistic as any;
      }
      if (!res.ok) {
        if (res.status === 400) {
          const err = api.products.create.responses[400].parse(await res.json());
          throw new ValidationError(err.message);
        }
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Server error ${res.status}`);
      }
      return api.products.create.responses[201].parse(await res.json());
    },
    onSuccess: (result) => {
      // Update React Query cache instantly — no network round-trip
      queryClient.setQueryData<Product[]>([LIST_URL], (old) =>
        old ? [...old, result] : [result]
      );
      patchCached(LIST_URL, (prev: any[]) => {
        const exists = prev.some((p) => p.id === result.id);
        return exists ? prev.map((p) => (p.id === result.id ? result : p)) : [...prev, result];
      });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<InsertProduct>) => {
      const url = buildUrl(api.products.update.path, { id });
      let res: Response;
      try {
        res = await nativeFetch(url, {
          method: api.products.update.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch {
        await queueMutation("PUT", url, data);
        await patchCached(LIST_URL, (prev: any[]) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
        return { id, ...data } as any;
      }
      if (!res.ok) {
        if (res.status === 404) throw new Error("Product not found");
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Server error ${res.status}`);
      }
      return api.products.update.responses[200].parse(await res.json());
    },
    onSuccess: (result) => {
      // Update React Query cache instantly — no network round-trip
      queryClient.setQueryData<Product[]>([LIST_URL], (old) =>
        old ? old.map((p) => (p.id === result.id ? result : p)) : [result]
      );
      patchCached(LIST_URL, (prev: any[]) => prev.map((p) => (p.id === result.id ? result : p)));
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.products.delete.path, { id });
      let res: Response;
      try {
        res = await nativeFetch(url, {
          method: api.products.delete.method,
        });
      } catch {
        await queueMutation("DELETE", url);
        await patchCached(LIST_URL, (prev: any[]) => prev.filter((p) => p.id !== id));
        return;
      }
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Server error ${res.status}`);
      }
    },
    onSuccess: (_, id) => {
      // Update React Query cache instantly — no network round-trip needed
      queryClient.setQueryData<Product[]>([LIST_URL], (old) =>
        old ? old.filter((p) => p.id !== id) : []
      );
      patchCached(LIST_URL, (prev: any[]) => prev.filter((p) => p.id !== id));
    },
  });
}
