import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertProduct, type Product } from "@shared/schema";
import { getCached, setCached, patchCached } from "@/lib/offline-db";
import { nativeFetch } from "@/lib/queryClient";

const LIST_URL = api.products.list.path;
const SESSION_KEY = "artixpos_products_boot";

// Synchronous sessionStorage read for instant first-render data.
// Does NOT need _currentUserId — sessionStorage is cleared on tab close.
function loadBootProducts(): Product[] | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveBootProducts(data: Product[]): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {}
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function useProducts() {
  return useQuery({
    queryKey: [LIST_URL],
    staleTime: 30_000,
    placeholderData: loadBootProducts as any,
    queryFn: async () => {
      try {
        const res = await nativeFetch(LIST_URL);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = api.products.list.responses[200].parse(await res.json());
        setCached(LIST_URL, data).catch(() => {});
        saveBootProducts(data as any);
        return data;
      } catch (err) {
        const cached =
          await getCached<ReturnType<(typeof api.products.list.responses)[200]["parse"]>>(LIST_URL);
        if (cached !== null) return cached;
        throw err;
      }
    },
    select: (data: any) => (Array.isArray(data) ? data : []),
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
        throw new Error("You're offline — connect to the internet to add products.");
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
      // Guard: if old is undefined the updater returning undefined is a no-op
      // (cache not loaded yet); returning [result] would clobber the full list.
      queryClient.setQueryData<Product[]>([LIST_URL], (old) =>
        Array.isArray(old) ? [...old, result] : old,
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
        throw new Error("You're offline — connect to the internet to update products.");
      }
      if (!res.ok) {
        if (res.status === 404) throw new Error("Product not found");
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Server error ${res.status}`);
      }
      return api.products.update.responses[200].parse(await res.json());
    },
    onSuccess: (result) => {
      // Guard: returning [result] when old is undefined replaces the full list
      // with just the updated product.  Skip the update if data isn't cached.
      queryClient.setQueryData<Product[]>([LIST_URL], (old) =>
        Array.isArray(old) ? old.map((p) => (p.id === result.id ? result : p)) : old,
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
      // Guard: returning [] when old is not loaded means the optimistic removal
      // shows an empty list and the onError rollback skips the restore (because
      // context.previous is undefined / falsy).  Return old unchanged instead.
      queryClient.setQueryData<Product[]>([LIST_URL], (old) =>
        Array.isArray(old) ? old.filter((p) => p.id !== id) : old,
      );
      return { previous };
    },
    mutationFn: async (id: number) => {
      const url = buildUrl(api.products.delete.path, { id });
      let res: Response;
      try {
        res = await nativeFetch(url, { method: api.products.delete.method });
      } catch {
        throw new Error("You're offline — connect to the internet to delete products.");
      }
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Server error ${res.status}`);
      }
      await patchCached(LIST_URL, (prev: any[]) =>
        Array.isArray(prev) ? prev.filter((p) => p.id !== id) : [],
      );
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData<Product[]>([LIST_URL], context.previous);
    },
  });
}
