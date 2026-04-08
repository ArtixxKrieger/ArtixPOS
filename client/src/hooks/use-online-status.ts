import { useState, useEffect, useCallback, useRef } from "react";
import { getSalesQueueCount, getQueueCount } from "@/lib/offline-db";
import { syncOfflineData, type SyncResult } from "@/lib/sync";
import { nativeFetch } from "@/lib/queryClient";

interface OnlineStatus {
  isOnline: boolean;
  isSyncing: boolean;
  salesQueueCount: number;
  lastSync: SyncResult | null;
  triggerSync: () => Promise<void>;
}

// Only used to *confirm* we're back online (prevents false-positive from
// a WiFi portal that returns 200 for everything). Not used for going offline —
// that should be immediate via the browser "offline" event.
async function confirmOnline(): Promise<boolean> {
  if (!navigator.onLine) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await nativeFetch("/api/settings", {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    // Always clear the timer — even if the fetch throws — to avoid a
    // dangling timeout firing on an unmounted component.
    clearTimeout(timer);
  }
}

export function useOnlineStatus(): OnlineStatus {
  // Initialise instantly from the browser's own knowledge — no async needed.
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [salesQueueCount, setSalesQueueCount] = useState(0);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const isSyncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const count = await getSalesQueueCount();
    setSalesQueueCount(count);
    return await getQueueCount();
  }, []);

  const doSync = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const result = await syncOfflineData();
      setLastSync(result);
      await refreshCount();
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [refreshCount]);

  const triggerSync = useCallback(async () => {
    const online = await confirmOnline();
    if (!online) return;
    setIsOnline(true);
    await doSync();
  }, [doSync]);

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval>;

    const initialise = async () => {
      // navigator.onLine already set the initial state; just confirm with a real
      // request and kick off any queued sync if needed.
      const online = navigator.onLine ? await confirmOnline() : false;
      setIsOnline(online);
      const totalCount = await refreshCount();
      if (online && totalCount > 0) await doSync();
    };

    initialise();

    // Going OFFLINE: mark immediately — no network round-trip needed.
    const handleOffline = () => {
      setIsOnline(false);
    };

    // Coming ONLINE: confirm with a real request first to avoid false positives
    // (e.g. captive WiFi portals that return 200 for everything).
    const handleOnline = async () => {
      const online = await confirmOnline();
      setIsOnline(online);
      if (online) {
        const totalCount = await refreshCount();
        if (totalCount > 0) await doSync();
      }
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) {
        setIsOnline(false);
        return;
      }
      const online = await confirmOnline();
      setIsOnline(online);
      if (online) {
        // Only sync if there are queued mutations — don't blast-invalidate
        // all cached data just because the user switched tabs or apps.
        const totalCount = await refreshCount();
        if (totalCount > 0) await doSync();
      }
    };

    // Poll every 10 s to catch transitions the browser events might miss.
    pollInterval = setInterval(async () => {
      // Quick check first — skip the network request when already known offline.
      if (!navigator.onLine) {
        setIsOnline(false);
        return;
      }
      const online = await confirmOnline();
      setIsOnline((prev) => (prev !== online ? online : prev));
      if (online) {
        const totalCount = await refreshCount();
        if (totalCount > 0) await doSync();
      }
    }, 10_000);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(pollInterval);
    };
  }, [refreshCount, doSync]);

  return { isOnline, isSyncing, salesQueueCount, lastSync, triggerSync };
}
