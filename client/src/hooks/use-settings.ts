import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { type InsertUserSetting } from "@shared/schema";
import { getCached, setCached, queueMutation } from "@/lib/offline-db";

const SETTINGS_URL = api.settings.get.path;

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export function useSettings() {
  return useQuery({
    queryKey: [SETTINGS_URL],
    queryFn: async () => {
      try {
        const res = await fetch(SETTINGS_URL, { credentials: "include" });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`${res.status}`);
        const data = api.settings.get.responses[200].parse(await res.json());
        await setCached(SETTINGS_URL, data);
        return data;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        const cached = await getCached<ReturnType<typeof api.settings.get.responses[200]["parse"]>>(SETTINGS_URL);
        return cached ?? null;
      }
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<InsertUserSetting>) => {
      try {
        const res = await fetch(api.settings.update.path, {
          method: api.settings.update.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to update settings");
        const result = api.settings.update.responses[200].parse(await res.json());
        await setCached(SETTINGS_URL, result);
        return result;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        await queueMutation("PUT", api.settings.update.path, data);
        const current = await getCached<any>(SETTINGS_URL);
        const updated = { ...current, ...data };
        await setCached(SETTINGS_URL, updated);
        return updated as any;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SETTINGS_URL] }),
  });
}
