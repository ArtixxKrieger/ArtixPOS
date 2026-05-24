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
    // Data stays fresh for 2 min — matches the server-side cache TTL (120 s).
    // All mutations call setQueryData directly so the cache is always up-to-date
    // without needing a stale-triggered refetch; the longer staleTime just
    // prevents needless background re-fetches on route changes.
    staleTime: 120_000,
    queryFn: async () => {
      try {
        const res = await nativeFetch(LIST_URL);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = api.products.list.responses[200].parse(await res.json());
        // Fire-and-forget IDB write — do NOT await so the queryFn resolves
        // immediately and React renders the new data without waiting for IDB.
        setCached(LIST_URL, data).catch(() => {});
        return data;
      } catch (err) {
        const cached = await getCached<ReturnType<typeof api.products.list.responses[200]["parse"]>>(LIST_URL);
        if (cached !== null) return cached;
        throw err;
      }
    },
  });
}

function useProduct(id: number) {
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
    retry: (failureCount, error) => {
      if (failureCount >= 1) return false;
      if (error instanceof ValidationError) return false;
      return true;
    },
    retryDelay: 1200,
    mutationFn: async (data: InsertProduct) => {
      let res: Response;
      try {
        res = await nativeFetch(api.products.create.path, {
          method: api.products.create.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch {
        // Offline — queue the mutation and return an optimistic result.
        // We pin the temp ID before any async work so it's consistent between
        // the queue item (offlineId) and the optimistic cache entry.
        const tempId = Date.now();
        await queueMutation(
          "POST",
          api.products.create.path,
          data,
          "product",
          tempId, // offlineId — enables foldQueue and ID remapping after sync
        );
        const optimistic = { ...data, id: tempId, sizes: data.sizes ?? [], modifiers: data.modifiers ?? [] };
        await patchCached(LIST_URL, (prev: any[]) => [...(Array.isArray(prev) ? prev : []), optimistic]);
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
      queryClient.setQueryData<Product[]>([LIST_URL], (old) =>
        old ? [...old, result] : [result]
      );
      patchCached(LIST_URL, (prev: any[]) => {
        const list = Array.isArray(prev) ? prev : [];
        const exists = list.some((p) => p.id === result.id);
        return exists ? list.map((p) => (p.id === result.id ? result : p)) : [...list, result];
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
        await queueMutation("PUT", url, data, "product");
        await patchCached(LIST_URL, (prev: any[]) => Array.isArray(prev) ? prev.map((p) => (p.id === id ? { ...p, ...data } : p)) : []);
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
      queryClient.setQueryData<Product[]>([LIST_URL], (old) =>
        old ? old.map((p) => (p.id === result.id ? result : p)) : [result]
      );
      patchCached(LIST_URL, (prev: any[]) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.map((p) => (p.id === result.id ? result : p));
      });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: [LIST_URL] });
      const previous = queryClient.getQueryData<Product[]>([LIST_URL]);
      queryClient.setQueryData<Product[]>([LIST_URL], (old) =>
        old ? old.filter((p) => p.id !== id) : []
      );
      return { previous };
    },
    mutationFn: async (id: number) => {
      const url = buildUrl(api.products.delete.path, { id });
      let res: Response;
      try {
        res = await nativeFetch(url, { method: api.products.delete.method });
      } catch {
        await queueMutation("DELETE", url, undefined, "product");
        await patchCached(LIST_URL, (prev: any[]) => Array.isArray(prev) ? prev.filter((p) => p.id !== id) : []);
        return;
      }
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Server error ${res.status}`);
      }
      await patchCached(LIST_URL, (prev: any[]) => Array.isArray(prev) ? prev.filter((p) => p.id !== id) : []);
    },
    onError: (_err, _id, context) => {
      if (context?.previous)
        queryClient.setQueryData<Product[]>([LIST_URL], context.previous);
    },
  });
}
