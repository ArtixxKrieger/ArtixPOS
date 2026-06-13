import { useState, useEffect, useCallback, useRef } from "react";
import {
  getQueueStats,
  SYNC_CHANNEL_NAME,
} from "@/lib/offline-db";
import {
  syncOfflineData,
  retryFailedMutations,
  refreshAllData,
  type SyncResult,
  type SyncChannelMessage,
} from "@/lib/sync";
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

  const timer = setTimeout(() => controller.abort(), 2000);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    await nativeFetch("/api/health", {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {

return navigator.onLine;
  } finally {
    clearTimeout(timer);
  }
}

const BASE_POLL_MS = 8_000;
const MAX_POLL_MS  = 64_000;

async function registerBackgroundSync(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    if ("sync" in reg) {
      await (reg as any).sync.register("pos-offline-sync");
    }
  } catch {}
}

export function useOnlineStatus(): OnlineStatus {

const [isOnline, setIsOnline]               = useState(() => navigator.onLine);

  const [isReady, _setIsReady]                = useState(true);
  const [isSyncing, setIsSyncing]             = useState(false);
  const [salesQueueCount, setSalesQueueCount] = useState(0);
  const [totalQueueCount, setTotalQueueCount] = useState(0);
  const [failedQueueCount, setFailedQueueCount] = useState(0);
  const [lastSync, setLastSync]               = useState<SyncResult | null>(null);

  const isSyncingRef        = useRef(false);
  const isCheckingRef       = useRef(false);
  const checkAbortRef       = useRef<AbortController | null>(null);
  const mountedRef          = useRef(true);
  const pollIntervalRef     = useRef(BASE_POLL_MS);
  const consecutiveOnline   = useRef(0);
  const pollTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);

const lastVisibilityCheckRef = useRef(0);

const refreshCounts = useCallback(async () => {
    const { sales, total, failed } = await getQueueStats();
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
      if (mountedRef.current && !result.skipped) setLastSync(result);
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
      setIsOnline(online);

      if (online) {
        pollIntervalRef.current = BASE_POLL_MS;
        consecutiveOnline.current = 0;

        const total = await refreshCounts();
        if (total > 0) {
          await doSync();
          registerBackgroundSync();
        }

refreshAllData().catch(() => {});
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

let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        channel.onmessage = (e: MessageEvent<SyncChannelMessage>) => {
          if (!mountedRef.current) return;
          if (e.data?.type === "SYNC_COMPLETE") {
            refreshCounts();
            if (e.data.result && !e.data.result.skipped) {
              setLastSync(e.data.result);
            }
          }
          if (e.data?.type === "QUEUE_CHANGED") {
            refreshCounts();
          }
        };
      } catch {}
    }

const swMessageHandler = (e: MessageEvent) => {
      if (e.data?.type === "TRIGGER_SYNC" && mountedRef.current) {
        handleCameOnline();
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", swMessageHandler);
    }

const backgroundInit = async () => {

      const total = await refreshCounts();

if (navigator.onLine) {
        const online = await confirmOnline();
        if (!mountedRef.current) return;
        setIsOnline(online);
        if (online && total > 0) {
          doSync();
          registerBackgroundSync();
        }
      }
    };
    backgroundInit();

const handleOffline = () => {
      if (mountedRef.current) {
        setIsOnline(false);
        consecutiveOnline.current = 0;
        pollIntervalRef.current = BASE_POLL_MS;
      }
    };

    let debounceTimer: ReturnType<typeof setTimeout>;
    const handleOnline = () => {

      if (mountedRef.current) setIsOnline(true);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { handleCameOnline(); }, 300);
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) {
        if (mountedRef.current) setIsOnline(false);
        return;
      }

const now = Date.now();
      if (now - lastVisibilityCheckRef.current < 30_000) return;
      lastVisibilityCheckRef.current = now;
      handleCameOnline();
    };

let consecutiveOffline = 0;

    const schedulePoll = () => {
      if (!mountedRef.current) return;
      pollTimerRef.current = setTimeout(async () => {
        if (!mountedRef.current) return;

        if (!navigator.onLine) {
          consecutiveOffline++;
          consecutiveOnline.current = 0;
          if (mountedRef.current) setIsOnline(false);
          pollIntervalRef.current = Math.min(
            BASE_POLL_MS * 2 ** Math.min(consecutiveOffline - 1, 3),
            MAX_POLL_MS,
          );
          schedulePoll();
          return;
        }

        let online: boolean;
        if (consecutiveOnline.current >= 3) {
          online = true;
          consecutiveOnline.current++;
          if (consecutiveOnline.current >= 6) consecutiveOnline.current = 0;
        } else {
          online = await confirmOnline();
        }

        if (!mountedRef.current) return;

        if (online) {
          consecutiveOffline = 0;
          consecutiveOnline.current++;
          pollIntervalRef.current = BASE_POLL_MS;
          setIsOnline((prev) => (prev !== online ? online : prev));
          const total = await refreshCounts();
          if (total > 0) await doSync();
        } else {
          consecutiveOffline++;
          consecutiveOnline.current = 0;
          setIsOnline(false);
          pollIntervalRef.current = Math.min(
            BASE_POLL_MS * 2 ** Math.min(consecutiveOffline - 1, 3),
            MAX_POLL_MS,
          );
        }

        schedulePoll();
      }, pollIntervalRef.current);
    };

    schedulePoll();

    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mountedRef.current = false;
      clearTimeout(debounceTimer);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      checkAbortRef.current?.abort();
      channel?.close();
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", swMessageHandler);
      }
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
