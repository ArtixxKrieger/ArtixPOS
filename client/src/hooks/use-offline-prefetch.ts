import { useEffect, useRef, useState, useCallback } from "react";
import { nativeFetch, queryClient } from "@/lib/queryClient";
import { setCached } from "@/lib/offline-db";
import { ALL_PREFETCH_URLS } from "@/lib/prefetch";

const PREFETCH_INTERVAL_MS = 5 * 60 * 1000;
// localStorage key is user-scoped to prevent User A's timestamp being shown to User B.
// We read the same UID key that offline-db.ts writes on session init.
const LAST_UID_LS_KEY = "pos-last-uid";
const prefetchTsKey = () =>
  `artixpos_last_prefetch_${localStorage.getItem(LAST_UID_LS_KEY) ?? "anon"}`;

// prefetchBootstrapData (called on every login) handles the initial IDB seed
// and network fetch for ALL_PREFETCH_URLS.  This hook's only job is the
// periodic background refresh — keeping IDB warm between logins.
// We intentionally bypass queryClient/staleTime so data is always refreshed
// even after staleTime:Infinity would otherwise suppress re-fetches.
async function prefetchEndpoint(url: string): Promise<void> {
  try {
    const res = await nativeFetch(url, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    // Write to IDB (for cold-start offline reads) and React Query cache
    // (so any mounted component immediately reflects the fresh data).
    await setCached(url, data);
    queryClient.setQueryData([url], data);
  } catch {
    // Silently ignore — offline or endpoint doesn't exist for this tenant
  }
}

export interface OfflinePrefetchState {
  lastPrefetch: Date | null;
  isPrefetching: boolean;
  prefetchNow: () => Promise<void>;
}

export function useOfflinePrefetch(): OfflinePrefetchState {
  const [lastPrefetch, setLastPrefetch] = useState<Date | null>(() => {
    try {
      const stored = localStorage.getItem(prefetchTsKey());
      if (!stored) return null;
      const d = new Date(stored);
      // Discard malformed dates — they'd corrupt the "cached Xm ago" label
      return Number.isFinite(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  });
  const [isPrefetching, setIsPrefetching] = useState(false);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const prefetchNow = useCallback(async (): Promise<void> => {
    if (!navigator.onLine) return;
    if (runningRef.current) return;
    runningRef.current = true;
    if (mountedRef.current) setIsPrefetching(true);

    try {
      // Fan out all fetches in parallel — each one is independent
      await Promise.allSettled(ALL_PREFETCH_URLS.map(prefetchEndpoint));
      if (mountedRef.current) {
        const now = new Date();
        setLastPrefetch(now);
        try {
          localStorage.setItem(prefetchTsKey(), now.toISOString());
        } catch {}
      }
    } finally {
      runningRef.current = false;
      if (mountedRef.current) setIsPrefetching(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // ── Timer-leak guard ──────────────────────────────────────────────────
    // `schedule` is self-rescheduling via .finally(). Without this flag,
    // if a prefetch is in-flight when the component unmounts, .finally()
    // fires AFTER cleanup and creates an orphan timer that reschedules
    // itself indefinitely, since timerRef was already cleared.
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        prefetchNow().finally(schedule);
      }, PREFETCH_INTERVAL_MS);
    };

    // Start the periodic 5-minute refresh cycle.
    // No immediate initial fetch here — prefetchBootstrapData (called on login
    // from App.tsx) already handles the first fetch for ALL_PREFETCH_URLS,
    // including both core and extended endpoints.  Duplicating that here would
    // fire 17 parallel requests a second time within 3-5 s of login.
    schedule();

    // Re-prefetch immediately when the device comes back online.
    // Cancel any pending scheduled timer first to avoid a double-run right
    // after reconnection.
    const handleOnline = () => {
      if (cancelled) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      prefetchNow().finally(schedule);
    };
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("online", handleOnline);
    };
  }, [prefetchNow]);

  return { lastPrefetch, isPrefetching, prefetchNow };
}
