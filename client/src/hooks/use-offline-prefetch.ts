import { useEffect, useRef, useState, useCallback } from "react";
import { nativeFetch } from "@/lib/queryClient";
import { setCached } from "@/lib/offline-db";
import { queryClient } from "@/lib/queryClient";

const PREFETCH_INTERVAL_MS = 5 * 60 * 1000;

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
      const stored = localStorage.getItem("artixpos_last_prefetch");
      return stored ? new Date(stored) : null;
    } catch {
      return null;
    }
  });
  const [isPrefetching, setIsPrefetching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        try { localStorage.setItem("artixpos_last_prefetch", now.toISOString()); } catch {}
      }
    } finally {
      runningRef.current = false;
      if (mountedRef.current) setIsPrefetching(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Initial prefetch — run once on mount with a short delay so the app
    // shell renders first (avoids competing with the initial auth + settings fetches)
    const initTimer = setTimeout(() => {
      prefetchNow();
    }, 3000);

    // Periodic refresh every 5 minutes while the app is open
    const schedule = () => {
      timerRef.current = setTimeout(() => {
        prefetchNow().finally(schedule);
      }, PREFETCH_INTERVAL_MS);
    };
    schedule();

    // Re-prefetch immediately when coming back online
    const handleOnline = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      prefetchNow().finally(schedule);
    };
    window.addEventListener("online", handleOnline);

    return () => {
      mountedRef.current = false;
      clearTimeout(initTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("online", handleOnline);
    };
  }, [prefetchNow]);

  return { lastPrefetch, isPrefetching, prefetchNow };
}
