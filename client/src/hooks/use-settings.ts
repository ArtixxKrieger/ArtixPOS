import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "@shared/routes";
import { type InsertUserSetting } from "@shared/schema";
import { getCached, setCached } from "@/lib/offline-db";
import { detectLocale } from "@/lib/locale-detect";
import { nativeFetch } from "@/lib/queryClient";

const SETTINGS_URL = api.settings.get.path;

const BOOT_SETTINGS_KEY = "artixpos_settings_boot";

// Called by the login handler right before window.location.replace() so that
// the very next page load can seed _prewarmedSettings synchronously and skip
// the AppRouter LoadingScreen gate entirely.
export function cacheSettingsForBoot(data: unknown): void {
  try {
    sessionStorage.setItem(BOOT_SETTINGS_KEY, JSON.stringify(data));
  } catch {}
}

// Synchronous read from sessionStorage (written by login handler before hard navigate).
// Consumed once so subsequent normal refreshes fall back to the IndexedDB path.
let _bootData: unknown = undefined;
try {
  const _raw = sessionStorage.getItem(BOOT_SETTINGS_KEY);
  if (_raw) {
    _bootData = JSON.parse(_raw);
    sessionStorage.removeItem(BOOT_SETTINGS_KEY);
  }
} catch {}

let _prewarmedSettings: unknown = _bootData;
let _prewarmDone = _bootData !== undefined;

getCached(SETTINGS_URL)
  .then((data) => {
    // Only use IndexedDB value if we didn't already get fresher data from sessionStorage
    if (_prewarmedSettings == null) _prewarmedSettings = data;
    _prewarmDone = true;
  })
  .catch(() => {
    _prewarmDone = true;
  });

// Set by the login handler just before navigation so AppRouter skips the LoadingScreen
// gate on the very first render after login (consumed once, then resets).
//
// IMPORTANT: signalPostLoginNav() must survive window.location.replace() (a full page
// reload), so we persist to sessionStorage — the same pattern used by cacheSettingsForBoot.
// A plain module-level variable would be reset before consumeLoadingGateSignal() runs
// on the new page, making the signal a no-op.
const POST_LOGIN_NAV_KEY = "artixpos_post_login_nav";

let _skipLoadingGate = false;
// Read the signal written by the previous page's login handler (if any) and
// consume it immediately so a normal hard refresh does not skip the gate.
try {
  if (sessionStorage.getItem(POST_LOGIN_NAV_KEY) === "1") {
    _skipLoadingGate = true;
    sessionStorage.removeItem(POST_LOGIN_NAV_KEY);
  }
} catch {}

export function signalPostLoginNav(): void {
  try { sessionStorage.setItem(POST_LOGIN_NAV_KEY, "1"); } catch {}
}
export function consumeLoadingGateSignal(): boolean {
  const v = _skipLoadingGate;
  _skipLoadingGate = false;
  return v;
}

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

export async function fetchSettingsFromNetwork(signal?: AbortSignal): Promise<unknown | null> {
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
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((updated) => {
        const parsed = api.settings.update.responses[200].parse(updated);
        setCached(SETTINGS_URL, parsed).catch(() => {});
        queryClient.setQueryData([SETTINGS_URL], parsed);
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
        if (current !== undefined) queryClient.setQueryData([SETTINGS_URL], current);
        _prewarmedSettings = current;
        throw new Error("You're offline — connect to save settings.");
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
            // 5xx — revert optimistic; user must retry
            if (current !== undefined) queryClient.setQueryData([SETTINGS_URL], current);
            _prewarmedSettings = current;
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
          // Network failure — revert optimistic so stale data isn't silently saved
          if (current !== undefined) queryClient.setQueryData([SETTINGS_URL], current);
          _prewarmedSettings = current;
        }
        throw err;
      }
    },

    // mutationFn already calls setQueryData with the same value on success —
    // no need to repeat it here; a second call would trigger a redundant re-render
    // of every settings consumer.
  });
}
