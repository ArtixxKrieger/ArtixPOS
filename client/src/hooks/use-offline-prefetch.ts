import { useEffect, useRef, useState, useCallback } from "react";
import { nativeFetch, queryClient } from "@/lib/queryClient";
import { setCached } from "@/lib/offline-db";

const PREFETCH_INTERVAL_MS = 5 * 60 * 1000;
// localStorage key is user-scoped to prevent User A's timestamp being shown to User B.
// We read the same UID key that offline-db.ts writes on session init.
const LAST_UID_LS_KEY = "pos-last-uid";
const prefetchTsKey = () =>
  `artixpos_last_prefetch_${localStorage.getItem(LAST_UID_LS_KEY) ?? "anon"}`;

// All critical endpoints to keep warm in IDB.
// These cover every page a user might land on while offline.
const CRITICAL_ENDPOINTS = [
  "/api/products",
  "/api/customers",
  "/api/pending-orders",
  "/api/settings",
  "/api/expenses",
  "/api/staff",
  "/api/suppliers",
  "/api/branches",
  "/api/categories",
  "/api/memberships",
  "/api/loyalty-tiers",
  "/api/tables",
  "/api/rooms",
  "/api/pos-features",
];

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
      await Promise.allSettled(CRITICAL_ENDPOINTS.map(prefetchEndpoint));
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

    // Initial prefetch — delayed 3 s so the auth + settings fetch (which
    // matters more to the user) wins the first network window.
    const initTimer = setTimeout(() => {
      if (!cancelled) prefetchNow();
    }, 3_000);

    // Periodic refresh
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
      clearTimeout(initTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("online", handleOnline);
    };
  }, [prefetchNow]);

  return { lastPrefetch, isPrefetching, prefetchNow };
}
