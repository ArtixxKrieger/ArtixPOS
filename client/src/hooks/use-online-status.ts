import { useState, useEffect, useCallback, useRef } from "react";
import {
  getSalesQueueCount,
  getQueueCount,
  getFailedQueueCount,
  SYNC_CHANNEL_NAME,
} from "@/lib/offline-db";
import {
  syncOfflineData,
  retryFailedMutations,
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

// ── Connectivity probe ────────────────────────────────────────────────────
// Performs a real HEAD request rather than trusting navigator.onLine, which
// can be stale or wrong on mobile. 2.5 s timeout avoids blocking the poller.
async function confirmOnline(signal?: AbortSignal): Promise<boolean> {
  if (!navigator.onLine) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
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

// ── Adaptive poll interval ────────────────────────────────────────────────
// When we're confirmed online and stable, poll every BASE_POLL_MS (8 s).
// Each consecutive failure doubles the interval up to MAX_POLL_MS (64 s),
// reducing battery/network drain on devices that stay offline for long periods.
const BASE_POLL_MS = 8_000;
const MAX_POLL_MS  = 64_000;

// ── Background Sync registration ─────────────────────────────────────────
// Registers a one-shot sync tag so the service worker can trigger a sync
// even when all tabs are backgrounded (the SW fires the 'sync' event when
// connectivity is restored by the OS).
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
  const [isOnline, setIsOnline]               = useState(true);
  const [isReady, setIsReady]                 = useState(false);
  const [isSyncing, setIsSyncing]             = useState(false);
  const [salesQueueCount, setSalesQueueCount] = useState(0);
  const [totalQueueCount, setTotalQueueCount] = useState(0);
  const [failedQueueCount, setFailedQueueCount] = useState(0);
  const [lastSync, setLastSync]               = useState<SyncResult | null>(null);

  const isSyncingRef   = useRef(false);
  const isCheckingRef  = useRef(false);
  const checkAbortRef  = useRef<AbortController | null>(null);
  const mountedRef     = useRef(true);
  // Adaptive poll state
  const pollIntervalRef     = useRef(BASE_POLL_MS);
  const consecutiveOnline   = useRef(0);
  const pollTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Queue count refresh ────────────────────────────────────────────────
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

  // ── Core sync runner ──────────────────────────────────────────────────
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

  // ── Came-online handler ───────────────────────────────────────────────
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
        // Reset adaptive poll interval on confirmed connectivity
        pollIntervalRef.current = BASE_POLL_MS;
        consecutiveOnline.current = 0;

        const total = await refreshCounts();
        if (total > 0) {
          await doSync();
          // Register background sync tag so the SW can retry even if tab backgrounds
          registerBackgroundSync();
        }
      }
    } finally {
      if (!ac.signal.aborted) isCheckingRef.current = false;
    }
  }, [doSync, refreshCounts]);

  // ── Public trigger functions ──────────────────────────────────────────
  const triggerSync = useCallback(async () => {
    await handleCameOnline();
  }, [handleCameOnline]);

  const triggerRetryFailed = useCallback(async () => {
    const online = await confirmOnline();
    if (!online || !mountedRef.current) return;
    setIsOnline(true);
    await doRetryFailed();
  }, [doRetryFailed]);

  // ── Main effect: listeners + polling ─────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    // ── BroadcastChannel listener ──────────────────────────────────────
    // When another tab completes a sync, refresh our counts without syncing
    // ourselves (the Web Lock already prevents double-sync, but this avoids
    // even attempting it and keeps the UI counts accurate cross-tab).
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

    // ── Service-worker TRIGGER_SYNC message ───────────────────────────
    // Fired by the SW's Background Sync handler when the OS restores
    // connectivity while all tabs are in the background.
    const swMessageHandler = (e: MessageEvent) => {
      if (e.data?.type === "TRIGGER_SYNC" && mountedRef.current) {
        handleCameOnline();
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", swMessageHandler);
    }

    // ── Initial probe ─────────────────────────────────────────────────
    const initialise = async () => {
      const online = await confirmOnline();
      if (!mountedRef.current) return;
      setIsOnline(online);
      setIsReady(true);
      const total = await refreshCounts();
      if (online && total > 0) await doSync();
    };
    initialise();

    // ── Event listeners ───────────────────────────────────────────────
    const handleOffline = () => {
      if (mountedRef.current) {
        setIsOnline(false);
        consecutiveOnline.current = 0;
        // Slow down polling when we know we're offline
        pollIntervalRef.current = BASE_POLL_MS;
      }
    };

    let debounceTimer: ReturnType<typeof setTimeout>;
    const handleOnline = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { handleCameOnline(); }, 300);
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) {
        if (mountedRef.current) setIsOnline(false);
        return;
      }
      handleCameOnline();
    };

    // ── Adaptive poller ───────────────────────────────────────────────
    // Uses setTimeout (not setInterval) so the interval can change dynamically.
    // When confirmed offline: doubles the interval up to MAX_POLL_MS to reduce
    // unnecessary probes on long-term offline devices.
    // When confirmed online: resets to BASE_POLL_MS and skips the probe every
    // 3rd–5th consecutive success (trust the cached state briefly).
    let consecutiveOffline = 0;

    const schedulePoll = () => {
      if (!mountedRef.current) return;
      pollTimerRef.current = setTimeout(async () => {
        if (!mountedRef.current) return;

        if (!navigator.onLine) {
          consecutiveOffline++;
          consecutiveOnline.current = 0;
          if (mountedRef.current) setIsOnline(false);

          // Exponential back-off: 8s → 16s → 32s → 64s (cap)
          pollIntervalRef.current = Math.min(
            BASE_POLL_MS * 2 ** Math.min(consecutiveOffline - 1, 3),
            MAX_POLL_MS,
          );
          schedulePoll();
          return;
        }

        // Skip the actual HTTP probe occasionally when we've been stably online
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
