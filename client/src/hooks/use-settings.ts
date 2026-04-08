import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "@shared/routes";
import { type InsertUserSetting } from "@shared/schema";
import { getCached, setCached, queueMutation } from "@/lib/offline-db";
import { detectLocale } from "@/lib/locale-detect";
import { nativeFetch } from "@/lib/queryClient";

const SETTINGS_URL = api.settings.get.path;

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

export function useSettings() {
  const queryClient = useQueryClient();
  const didAutoSync = useRef(false);

  const query = useQuery({
    queryKey: [SETTINGS_URL],
    queryFn: async () => {
      try {
        const res = await nativeFetch(SETTINGS_URL);
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

  useEffect(() => {
    if (didAutoSync.current) return;
    if (!query.data) return;

    const settings = query.data as any;
    const locale = detectLocale();
    const needsTimezone = !settings.timezone;
    const needsCurrency = !settings.currency || settings.currency === "$";

    if (!needsTimezone && !needsCurrency) return;

    didAutoSync.current = true;

    const patch: Partial<InsertUserSetting> = {};
    if (needsTimezone) patch.timezone = locale.timezone;
    if (needsCurrency) patch.currency = locale.currency;

    nativeFetch(api.settings.update.path, {
      method: api.settings.update.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
      .then(r => r.json())
      .then(updated => {
        setCached(SETTINGS_URL, updated);
        queryClient.invalidateQueries({ queryKey: [SETTINGS_URL] });
      })
      .catch(() => {});
  }, [query.data, queryClient]);

  return query;
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<InsertUserSetting>) => {
      try {
        const res = await nativeFetch(api.settings.update.path, {
          method: api.settings.update.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("[useUpdateSettings] server error:", res.status, body);
          throw new Error(body?.message || `Server error ${res.status}`);
        }
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
