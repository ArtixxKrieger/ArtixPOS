import { useState, useEffect, useCallback } from "react";
import { getQueueCount } from "@/lib/offline-db";
import { syncOfflineData, type SyncResult } from "@/lib/sync";

interface OnlineStatus {
  isOnline: boolean;
  isSyncing: boolean;
  queueCount: number;
  lastSync: SyncResult | null;
  triggerSync: () => Promise<void>;
}

export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  const refreshCount = useCallback(async () => {
    const count = await getQueueCount();
    setQueueCount(count);
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      const result = await syncOfflineData();
      setLastSync(result);
      await refreshCount();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshCount]);

  useEffect(() => {
    refreshCount();

    const handleOnline = async () => {
      setIsOnline(true);
      const count = await getQueueCount();
      setQueueCount(count);
      if (count > 0) {
        setIsSyncing(true);
        try {
          const result = await syncOfflineData();
          setLastSync(result);
          setQueueCount(0);
        } finally {
          setIsSyncing(false);
        }
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshCount]);

  return { isOnline, isSyncing, queueCount, lastSync, triggerSync };
}
