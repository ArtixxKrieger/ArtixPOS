import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "@shared/routes";
import { type InsertUserSetting } from "@shared/schema";
import { getCached, setCached, queueMutation } from "@/lib/offline-db";
import { detectLocale } from "@/lib/locale-detect";
import { nativeFetch } from "@/lib/queryClient";

const SETTINGS_URL = api.settings.get.path;

let _prewarmedSettings: unknown = undefined;
let _prewarmDone = false;

getCached(SETTINGS_URL)
  .then((data) => {
    _prewarmedSettings = data;
    _prewarmDone = true;
  })
  .catch(() => {
    _prewarmDone = true;
  });

export async function clearSettingsPrewarm(): Promise<void> {
  _prewarmedSettings = undefined;
  _prewarmDone = false;
  try {
    await setCached(SETTINGS_URL, null as any);
  } catch {

  }
}

function isNetworkOrTimeoutError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError"))
    return true;
  return false;
}

async function fetchSettingsFromNetwork(signal?: AbortSignal): Promise<unknown | null> {
  const controller = new AbortController();

  const timeoutId = setTimeout(
    () => controller.abort(new DOMException("Settings fetch timeout", "TimeoutError")),
    15_000,
  );
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort(signal.reason);
    } else {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeoutId);
          controller.abort(signal.reason);
        },
        { once: true },
      );
    }
  }

  try {
    const res = await nativeFetch(SETTINGS_URL, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status}`);
    const data = api.settings.get.responses[200].parse(await res.json());

    setCached(SETTINGS_URL, data).catch(() => {});
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (isNetworkOrTimeoutError(err)) return undefined;
    throw err;
  }
}

export function useSettings() {
  const queryClient = useQueryClient();
  const didAutoSync = useRef(false);

  const query = useQuery({
    queryKey: [SETTINGS_URL],
    staleTime: Infinity,

placeholderData: () =>
      (_prewarmDone && _prewarmedSettings != null ? _prewarmedSettings : undefined) as any,
    queryFn: async ({ signal }) => {

      if (!navigator.onLine) {
        const cached =
          await getCached<ReturnType<(typeof api.settings.get.responses)[200]["parse"]>>(
            SETTINGS_URL,
          );

        if (cached == null) throw new Error("Offline and no cached settings");
        return cached;
      }

const result = await fetchSettingsFromNetwork(signal);

if (result === undefined) {
        const cached =
          await getCached<ReturnType<(typeof api.settings.get.responses)[200]["parse"]>>(
            SETTINGS_URL,
          );

        if (cached != null) return cached;

throw new Error("Settings fetch timed out");
      }

      return result as ReturnType<(typeof api.settings.get.responses)[200]["parse"]> | null;
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
      .then((r) => r.json())
      .then((updated) => {
        setCached(SETTINGS_URL, updated);

})
      .catch(() => {});
  }, [query.data, queryClient]);

  return query;
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<InsertUserSetting>) => {

const current = queryClient.getQueryData<any>([SETTINGS_URL]);
      const optimistic = current ? { ...current, ...data } : data;

queryClient.setQueryData([SETTINGS_URL], optimistic);

setCached(SETTINGS_URL, optimistic).catch(() => {});

_prewarmedSettings = optimistic;

if (!navigator.onLine) {
        await queueMutation("PUT", api.settings.update.path, data);
        return optimistic as any;
      }

const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new DOMException("Settings save timeout", "TimeoutError")),
        30_000,
      );

      try {
        const res = await nativeFetch(api.settings.update.path, {
          method: api.settings.update.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          let body: any = {};
          let rawText = "";
          try {
            rawText = await res.text();
            body = JSON.parse(rawText);
          } catch {
            body = { message: rawText || res.statusText };
          }

if (res.status >= 400 && res.status < 500) {
            if (current !== undefined) queryClient.setQueryData([SETTINGS_URL], current);
            _prewarmedSettings = current;
          } else {

            await queueMutation("PUT", api.settings.update.path, data);
          }

          const err = new Error(
            body?.message || body?.error || rawText || res.statusText || "Unknown error",
          ) as any;
          err.status = res.status;
          err.pgError = body?.error ?? null;
          throw err;
        }

        const result = api.settings.update.responses[200].parse(await res.json());

queryClient.setQueryData([SETTINGS_URL], result);
        setCached(SETTINGS_URL, result).catch(() => {});
        _prewarmedSettings = result;

        return result;
      } catch (err) {
        clearTimeout(timer);
        if (isNetworkOrTimeoutError(err)) {

          await queueMutation("PUT", api.settings.update.path, data);
          return optimistic as any;
        }
        throw err;
      }
    },

onSuccess: (data) => {
      queryClient.setQueryData([SETTINGS_URL], data);
    },
  });
}
