import { useState, useEffect, useCallback, useRef } from "react";
import {
  getSalesQueueCount,
  getQueueCount,
  getFailedQueueCount,
} from "@/lib/offline-db";
import { syncOfflineData, retryFailedMutations, type SyncResult } from "@/lib/sync";
import { nativeFetch } from "@/lib/queryClient";

// ─── Types ─────────────────────────────────────────────────────────────────
export interface OnlineStatus {
  isOnline: boolean;
  isSyncing: boolean;
  salesQueueCount: number;
  totalQueueCount: number;
  failedQueueCount: number;
  lastSync: SyncResult | null;
  triggerSync: () => Promise<void>;
  triggerRetryFailed: () => Promise<void>;
}

// ─── Connectivity probe ─────────────────────────────────────────────────────
// Uses /api/health — a public, lightweight endpoint that requires no auth.
// This avoids false-offline when the user is online but not yet authenticated.
async function confirmOnline(signal?: AbortSignal): Promise<boolean> {
  if (!navigator.onLine) return false;
  const controller = new AbortController();
  // Abort when the caller's signal fires, or after 2.5 s
  const timer = setTimeout(() => controller.abort(), 2500);
  const linked = signal?.addEventListener("abort", () => controller.abort());
  void linked;
  try {
    const res = await nativeFetch("/api/health", {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    // Accept any 2xx/3xx — a 503 means the DB is down but the network works
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────
export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [salesQueueCount, setSalesQueueCount] = useState(0);
  const [totalQueueCount, setTotalQueueCount] = useState(0);
  const [failedQueueCount, setFailedQueueCount] = useState(0);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  // Mutexes — prevent concurrent syncs and concurrent online-checks
  const isSyncingRef    = useRef(false);
  const isCheckingRef   = useRef(false);
  // AbortController for the in-flight confirmOnline call
  const checkAbortRef   = useRef<AbortController | null>(null);
  // Whether the component is still mounted
  const mountedRef      = useRef(true);

  // ── Queue count refresh ──────────────────────────────────────────────────
  const refreshCounts = useCallback(async () => {
    const [sales, total, failed] = await Promise.all([
      getSalesQueueCount(),
      getQueueCount(),
      getFailedQueueCount(),
    ]);
    if (!mountedRef.current) return total;
    setSalesQueueCount(sales);
    setTotalQueueCount(total);
    setFailedQueueCount(failed);
    return total;
  }, []);

  // ── Core sync ────────────────────────────────────────────────────────────
  const doSync = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (mountedRef.current) setIsSyncing(true);
    try {
      const result = await syncOfflineData();
      if (mountedRef.current) setLastSync(result);
    } finally {
      isSyncingRef.current = false;
      if (mountedRef.current) setIsSyncing(false);
      await refreshCounts();
    }
  }, [refreshCounts]);

  // ── Retry failed ─────────────────────────────────────────────────────────
  const doRetryFailed = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (mountedRef.current) setIsSyncing(true);
    try {
      const result = await retryFailedMutations();
      if (mountedRef.current) setLastSync(result);
    } finally {
      isSyncingRef.current = false;
      if (mountedRef.current) setIsSyncing(false);
      await refreshCounts();
    }
  }, [refreshCounts]);

  // ── Online transition handler (guards concurrent calls) ──────────────────
  const handleCameOnline = useCallback(async () => {
    // Abort any in-flight connectivity check before starting a new one
    if (isCheckingRef.current) {
      checkAbortRef.current?.abort();
    }
    isCheckingRef.current = true;
    const ac = new AbortController();
    checkAbortRef.current = ac;

    try {
      const online = await confirmOnline(ac.signal);
      if (ac.signal.aborted || !mountedRef.current) return;
      if (mountedRef.current) setIsOnline(online);
      if (online) {
        const total = await refreshCounts();
        if (total > 0) await doSync();
      }
    } finally {
      if (!ac.signal.aborted) isCheckingRef.current = false;
    }
  }, [doSync, refreshCounts]);

  // ── Public API: manual sync trigger ─────────────────────────────────────
  const triggerSync = useCallback(async () => {
    await handleCameOnline();
  }, [handleCameOnline]);

  const triggerRetryFailed = useCallback(async () => {
    // Confirm still online before retrying
    const online = await confirmOnline();
    if (!online || !mountedRef.current) return;
    setIsOnline(true);
    await doRetryFailed();
  }, [doRetryFailed]);

  // ── Effect: event listeners + polling ────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    // Interval ref lives inside the effect so cleanup is guaranteed
    let pollTimer: ReturnType<typeof setInterval>;
    // Debounce rapid online/offline toggling
    let debounceTimer: ReturnType<typeof setTimeout>;

    // ── Initial probe ────────────────────────────────────────────────────
    const initialise = async () => {
      // navigator.onLine gives instant answer; confirm with a real request
      const online = navigator.onLine ? await confirmOnline() : false;
      if (!mountedRef.current) return;
      setIsOnline(online);
      const total = await refreshCounts();
      if (online && total > 0) await doSync();
    };
    initialise();

    // ── Offline: instant (browser event is reliable for going offline) ───
    const handleOffline = () => {
      clearTimeout(debounceTimer);
      if (mountedRef.current) setIsOnline(false);
    };

    // ── Online: debounce 300 ms to avoid rapid toggling, then confirm ────
    const handleOnline = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        handleCameOnline();
      }, 300);
    };

    // ── Visibility: re-probe when user returns to the tab ────────────────
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) {
        if (mountedRef.current) setIsOnline(false);
        return;
      }
      // If already online and nothing queued, skip the network probe
      handleCameOnline();
    };

    // ── Adaptive poll ─────────────────────────────────────────────────────
    // Polls every 8 s. When online with empty queue, skips confirmOnline
    // (trusts navigator.onLine) to avoid unnecessary HEAD requests.
    let consecutiveOnlineCount = 0;
    const poll = async () => {
      if (!navigator.onLine) {
        consecutiveOnlineCount = 0;
        if (mountedRef.current) setIsOnline(false);
        return;
      }
      // After 3 consecutive confirmed-online polls with empty queue,
      // skip the network probe for the next 3 cycles (saves bandwidth).
      let online: boolean;
      if (consecutiveOnlineCount >= 3) {
        // Fast path: trust navigator.onLine, just refresh counts
        online = true;
        consecutiveOnlineCount++;
        if (consecutiveOnlineCount >= 6) consecutiveOnlineCount = 0;
      } else {
        online = await confirmOnline();
        if (online) consecutiveOnlineCount++;
        else consecutiveOnlineCount = 0;
      }
      if (!mountedRef.current) return;
      setIsOnline((prev) => (prev !== online ? online : prev));
      if (online) {
        const total = await refreshCounts();
        if (total > 0) await doSync();
      }
    };
    pollTimer = setInterval(poll, 8_000);

    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mountedRef.current = false;
      clearTimeout(debounceTimer);
      clearInterval(pollTimer);
      checkAbortRef.current?.abort();
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [handleCameOnline, refreshCounts, doSync]);

  return {
    isOnline,
    isSyncing,
    salesQueueCount,
    totalQueueCount,
    failedQueueCount,
    lastSync,
    triggerSync,
    triggerRetryFailed,
  };
}
