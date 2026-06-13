import { useEffect, useRef, useState, useCallback } from "react";
import { nativeFetch, queryClient } from "@/lib/queryClient";
import { setCached } from "@/lib/offline-db";
import { ALL_PREFETCH_URLS } from "@/lib/prefetch";

const PREFETCH_INTERVAL_MS = 5 * 60 * 1000;

const LAST_UID_LS_KEY = "pos-last-uid";
const prefetchTsKey = () =>
  `artixpos_last_prefetch_${localStorage.getItem(LAST_UID_LS_KEY) ?? "anon"}`;

async function prefetchEndpoint(url: string): Promise<void> {
  try {
    const res = await nativeFetch(url, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();

await setCached(url, data);
    queryClient.setQueryData([url], data);
  } catch {

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

let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        prefetchNow().finally(schedule);
      }, PREFETCH_INTERVAL_MS);
    };

schedule();

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
