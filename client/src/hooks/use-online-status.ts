import { useState, useEffect, useCallback, useRef } from "react";
import { getSalesQueueCount, getQueueCount } from "@/lib/offline-db";
import { syncOfflineData, refreshAllData, type SyncResult } from "@/lib/sync";

interface OnlineStatus {
  isOnline: boolean;
  isSyncing: boolean;
  salesQueueCount: number;
  lastSync: SyncResult | null;
  triggerSync: () => Promise<void>;
}

async function checkRealConnectivity(): Promise<boolean> {
  if (!navigator.onLine) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch("/api/settings", {
        method: "HEAD",
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);
      return res.ok || res.status < 500;
    } catch {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
  }
  return false;
}

export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [salesQueueCount, setSalesQueueCount] = useState(0);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const isSyncingRef = useRef(false);
  const offlineDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const online = await checkRealConnectivity();
    if (!online) return;
    setIsOnline(true);
    await doSync();
  }, [doSync]);

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval>;

    const initialise = async () => {
      const online = await checkRealConnectivity();
      setIsOnline(online);
      const totalCount = await refreshCount();
      if (online && totalCount > 0) {
        await doSync();
      }
    };

    initialise();

    const handleOnline = async () => {
      if (offlineDebounceRef.current) {
        clearTimeout(offlineDebounceRef.current);
        offlineDebounceRef.current = null;
      }
      const online = await checkRealConnectivity();
      setIsOnline(online);
      if (online) {
        const totalCount = await refreshCount();
        if (totalCount > 0) await doSync();
      }
    };

    const handleOffline = () => {
      offlineDebounceRef.current = setTimeout(async () => {
        const online = await checkRealConnectivity();
        setIsOnline(online);
      }, 1200);
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      const online = await checkRealConnectivity();
      setIsOnline(online);
      if (online) {
        const totalCount = await refreshCount();
        if (totalCount > 0) {
          await doSync();
        } else {
          await refreshAllData();
        }
      }
    };

    pollInterval = setInterval(async () => {
      const online = await checkRealConnectivity();
      setIsOnline((prev) => {
        if (prev !== online) return online;
        return prev;
      });
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
      if (offlineDebounceRef.current) clearTimeout(offlineDebounceRef.current);
    };
  }, [refreshCount, doSync]);

  return { isOnline, isSyncing, salesQueueCount, lastSync, triggerSync };
}
