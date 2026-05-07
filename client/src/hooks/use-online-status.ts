import { useState, useEffect, useCallback, useRef } from "react";
import {
  getSalesQueueCount,
  getQueueCount,
  getFailedQueueCount,
} from "@/lib/offline-db";
import { syncOfflineData, retryFailedMutations, type SyncResult } from "@/lib/sync";
import { nativeFetch } from "@/lib/queryClient";

export interface OnlineStatus {
  isOnline: boolean;
  isReady: boolean;
  isSyncing: boolean;
  salesQueueCount: number;
  totalQueueCount: number;
  failedQueueCount: number;
  lastSync: SyncResult | null;
  triggerSync: () => Promise<void>;
  triggerRetryFailed: () => Promise<void>;
}

async function confirmOnline(signal?: AbortSignal): Promise<boolean> {
  if (!navigator.onLine) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  const linked = signal?.addEventListener("abort", () => controller.abort());
  void linked;
  try {
    const res = await nativeFetch("/api/health", {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function useOnlineStatus(): OnlineStatus {
  // Start optimistically online — avoids flashing "offline" on load.
  // The initial probe will correct this if we're actually offline.
  const [isOnline, setIsOnline] = useState(true);
  // isReady gates the banner: don't show anything until first probe done.
  const [isReady, setIsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [salesQueueCount, setSalesQueueCount] = useState(0);
  const [totalQueueCount, setTotalQueueCount] = useState(0);
  const [failedQueueCount, setFailedQueueCount] = useState(0);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  const isSyncingRef  = useRef(false);
  const isCheckingRef = useRef(false);
  const checkAbortRef = useRef<AbortController | null>(null);
  const mountedRef    = useRef(true);

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

  const handleCameOnline = useCallback(async () => {
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

  const triggerSync = useCallback(async () => {
    await handleCameOnline();
  }, [handleCameOnline]);

  const triggerRetryFailed = useCallback(async () => {
    const online = await confirmOnline();
    if (!online || !mountedRef.current) return;
    setIsOnline(true);
    await doRetryFailed();
  }, [doRetryFailed]);

  useEffect(() => {
    mountedRef.current = true;

    let pollTimer: ReturnType<typeof setInterval>;
    let debounceTimer: ReturnType<typeof setTimeout>;

    // Initial probe — runs once on mount. Until it completes, isReady=false
    // so the banner stays hidden regardless of the optimistic isOnline value.
    const initialise = async () => {
      // Always do a real network probe regardless of navigator.onLine,
      // since mobile browsers can lie about connectivity on first load.
      const online = await confirmOnline();
      if (!mountedRef.current) return;
      setIsOnline(online);
      setIsReady(true);
      const total = await refreshCounts();
      if (online && total > 0) await doSync();
    };
    initialise();

    const handleOffline = () => {
      clearTimeout(debounceTimer);
      if (mountedRef.current) setIsOnline(false);
    };

    const handleOnline = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        handleCameOnline();
      }, 300);
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) {
        if (mountedRef.current) setIsOnline(false);
        return;
      }
      handleCameOnline();
    };

    let consecutiveOnlineCount = 0;
    const poll = async () => {
      if (!navigator.onLine) {
        consecutiveOnlineCount = 0;
        if (mountedRef.current) setIsOnline(false);
        return;
      }
      let online: boolean;
      if (consecutiveOnlineCount >= 3) {
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
    isReady,
    isSyncing,
    salesQueueCount,
    totalQueueCount,
    failedQueueCount,
    lastSync,
    triggerSync,
    triggerRetryFailed,
  };
}
