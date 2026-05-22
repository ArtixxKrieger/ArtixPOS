import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "@shared/routes";
import { type InsertUserSetting } from "@shared/schema";
import { getCached, setCached, queueMutation } from "@/lib/offline-db";
import { detectLocale } from "@/lib/locale-detect";
import { nativeFetch } from "@/lib/queryClient";

const SETTINGS_URL = api.settings.get.path;

// ── IDB pre-warm ─────────────────────────────────────────────────────────────
// FIX #1: Start reading IDB the moment this module loads so that by the time
// any component calls useSettings(), the cached value is already in memory.
// This reduces the "cold IDB read" from ~50-200ms to ~0ms on most calls.
let _prewarmedSettings: unknown = undefined;
let _prewarmDone = false;

getCached(SETTINGS_URL).then((data) => {
  _prewarmedSettings = data;
  _prewarmDone = true;
}).catch(() => {
  _prewarmDone = true;
});

function isNetworkOrTimeoutError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof DOMException && (err.name === "AbortError" || err.name === "TimeoutError")) return true;
  return false;
}

// ── Fetch with a hard timeout, returns null on any network/timeout failure ───
async function fetchSettingsFromNetwork(signal?: AbortSignal): Promise<unknown | null> {
  const controller = new AbortController();
  // FIX #1: Reduced from 10s to 5s — form should load from IDB if server is slow
  const timeoutId = setTimeout(
    () => controller.abort(new DOMException("Settings fetch timeout", "TimeoutError")),
    5_000,
  );
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
    if (isNetworkOrTimeoutError(err)) return undefined; // signal: use IDB
    throw err; // non-network error — propagate
  }
}

export function useSettings() {
  const queryClient = useQueryClient();
  const didAutoSync = useRef(false);

  const query = useQuery({
    queryKey: [SETTINGS_URL],
    staleTime: Infinity,
    // FIX #1: Serve IDB cache as initial data for instant form population.
    // placeholderData is shown while the real queryFn runs in the background.
    // If the prewarm already finished, we get the cached value synchronously.
    placeholderData: () => (_prewarmDone ? (_prewarmedSettings ?? null) : undefined) as any,
    queryFn: async ({ signal }) => {
      // FIX #1: If definitely offline, skip network entirely and return IDB immediately.
      if (!navigator.onLine) {
        const cached = await getCached<ReturnType<typeof api.settings.get.responses[200]["parse"]>>(SETTINGS_URL);
        return cached ?? null;
      }

      // Try network with a 5s timeout
      const result = await fetchSettingsFromNetwork(signal);

      // undefined = network/timeout error → fall back to IDB
      if (result === undefined) {
        const cached = await getCached<ReturnType<typeof api.settings.get.responses[200]["parse"]>>(SETTINGS_URL);
        return cached ?? null;
      }

      return result as ReturnType<typeof api.settings.get.responses[200]["parse"]> | null;
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
      // FIX #2: OPTIMISTIC UPDATE — apply to both React Query cache and IDB
      // immediately, before touching the network. The UI reflects changes
      // instantly; Save button is free as soon as this function returns.
      const current = queryClient.getQueryData<any>([SETTINGS_URL]);
      const optimistic = current ? { ...current, ...data } : data;

      // Synchronously update React Query cache — zero latency, no render blocked
      queryClient.setQueryData([SETTINGS_URL], optimistic);

      // Update IDB (fire-and-forget — non-blocking)
      setCached(SETTINGS_URL, optimistic).catch(() => {});

      // Update prewarm cache for next mount
      _prewarmedSettings = optimistic;

      // FIX #2: If offline, queue immediately without attempting network at all
      if (!navigator.onLine) {
        await queueMutation("PUT", api.settings.update.path, data);
        return optimistic as any;
      }

      // FIX #2: Try network with a SHORT 5s timeout — if slow/flaky, queue it
      // and return the optimistic value. The UI never waits for the server.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(
        new DOMException("Settings save timeout", "TimeoutError")
      ), 5_000);

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
          } catch { body = { message: rawText || res.statusText }; }

          // For permanent server errors (4xx), revert the optimistic update
          if (res.status >= 400 && res.status < 500) {
            if (current !== undefined) queryClient.setQueryData([SETTINGS_URL], current);
            _prewarmedSettings = current;
          } else {
            // 5xx — queue for retry, keep optimistic value shown
            await queueMutation("PUT", api.settings.update.path, data);
          }

          const err = new Error(body?.message || body?.error || rawText || res.statusText || "Unknown error") as any;
          err.status = res.status;
          err.pgError = body?.error ?? null;
          throw err;
        }

        const result = api.settings.update.responses[200].parse(await res.json());

        // Update with the canonical server response (may include computed fields)
        queryClient.setQueryData([SETTINGS_URL], result);
        setCached(SETTINGS_URL, result).catch(() => {});
        _prewarmedSettings = result;

        return result;
      } catch (err) {
        clearTimeout(timer);
        if (isNetworkOrTimeoutError(err)) {
          // Network/timeout — optimistic value is already shown, queue for sync
          await queueMutation("PUT", api.settings.update.path, data);
          return optimistic as any;
        }
        throw err;
      }
    },
    // onSuccess: cache is already up-to-date from mutationFn — no refetch needed.
    // We still call setQueryData as a safety net in case the server returned
    // extra computed fields that weren't in our optimistic payload.
    onSuccess: (data) => {
      queryClient.setQueryData([SETTINGS_URL], data);
    },
  });
}
