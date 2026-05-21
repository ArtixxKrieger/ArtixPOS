import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "@shared/routes";
import { type InsertUserSetting } from "@shared/schema";
import { getCached, setCached, queueMutation } from "@/lib/offline-db";
import { detectLocale } from "@/lib/locale-detect";
import { nativeFetch } from "@/lib/queryClient";

const SETTINGS_URL = api.settings.get.path;

// True for network errors (no connectivity) AND for timeouts (AbortError).
// Both should fall through to the IDB cache so the app works offline or on
// very slow connections — the key invariant is "the server was unreachable."
function isNetworkOrTimeoutError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch network error
  if (err instanceof DOMException && err.name === "AbortError") return true; // timeout
  return false;
}

export function useSettings() {
  const queryClient = useQueryClient();
  const didAutoSync = useRef(false);

  const query = useQuery({
    queryKey: [SETTINGS_URL],
    // Once loaded, never auto-refetch on route changes / window focus.
    // Settings are kept up-to-date exclusively by useUpdateSettings (which
    // calls setQueryData on success) and the auto-sync effect below.
    // Without this, staleTime defaults to 0 and every page navigation triggers
    // a background refetch → one extra render pass per navigation for every
    // component that calls useSettings().
    staleTime: Infinity,
    // Settings query has a 10-second hard timeout.
    // nativeFetch() is a plain fetch() with no built-in timeout, so on a slow
    // Vercel cold-start or a weak mobile connection the Promise can hang
    // indefinitely, keeping settingsLoading=true forever and the splash screen
    // stuck. The AbortController below ensures we always exit within 10 s.
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(new DOMException("Settings fetch timeout", "TimeoutError")),
        10_000,
      );
      // Honour the outer query abort signal (fired on component unmount / cancelQueries)
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timeoutId);
          controller.abort(signal.reason);
        } else {
          signal.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            controller.abort(signal.reason);
          }, { once: true });
        }
      }

      try {
        const res = await nativeFetch(SETTINGS_URL, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`${res.status}`);
        const data = api.settings.get.responses[200].parse(await res.json());
        // Fire-and-forget — don't block returning data to React
        setCached(SETTINGS_URL, data).catch(() => {});
        return data;
      } catch (err) {
        clearTimeout(timeoutId);
        if (!isNetworkOrTimeoutError(err)) throw err;
        // Network error or timeout → serve from IDB cache so the app still
        // works offline and doesn't stay stuck on the splash screen.
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
    // Auto-detect currency when not set or still at the server default "$".
    // Detection now uses navigator.language (browser locale set by the USER),
    // not the device timezone, so a Filipino user on a Japanese device
    // with "Filipino (Philippines)" language gets ₱, not ¥.
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
        // Use setQueryData instead of invalidateQueries — silently updates the
        // cache without triggering a refetch, preventing a visible re-render
        // (the reload flash users see right after login).
        queryClient.setQueryData([SETTINGS_URL], updated);
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
          let body: any = {};
          let rawText = "";
          try {
            rawText = await res.text();
            body = JSON.parse(rawText);
          } catch { body = { message: rawText || res.statusText }; }
          console.error("[useUpdateSettings] server error:", res.status, body, "url:", api.settings.update.path);
          const err = new Error(body?.message || body?.error || rawText || res.statusText || "Unknown error") as any;
          err.status = res.status;
          err.pgError = body?.error ?? null;
          throw err;
        }
        const result = api.settings.update.responses[200].parse(await res.json());
        // Fire-and-forget IDB write — do NOT await so the mutation resolves
        // immediately without blocking on IndexedDB I/O (~100-300 ms on mobile).
        setCached(SETTINGS_URL, result).catch(() => {});
        return result;
      } catch (err) {
        if (!isNetworkOrTimeoutError(err)) throw err;
        await queueMutation("PUT", api.settings.update.path, data);
        const current = await getCached<any>(SETTINGS_URL);
        const updated = { ...current, ...data };
        // Also non-blocking in the offline path.
        setCached(SETTINGS_URL, updated).catch(() => {});
        return updated as any;
      }
    },
    // Use setQueryData instead of invalidateQueries so we:
    //   1. Skip the redundant GET re-fetch (we already have fresh data from PUT)
    //   2. Cause exactly one synchronous render pass instead of two
    //      (invalidateQueries triggers stale→fetching→fresh = 2 renders)
    //   3. Eliminate the 3-4 s UI freeze caused by the extra network round-trip
    //      + second IDB write inside the queryFn's await setCached()
    onSuccess: (data) => queryClient.setQueryData([SETTINGS_URL], data),
  });
}
