import { useState, useEffect, useRef } from "react";
import { RefreshCw, CloudOff, AlertTriangle, CheckCircle2, WifiOff, Database } from "lucide-react";
import type { OnlineStatus } from "@/hooks/use-online-status";

interface OfflineSyncBannerProps {
  status: OnlineStatus;
  lastPrefetch?: Date | null;
  isPrefetching?: boolean;
  onPrefetch?: () => void;
}

function formatAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type PillState =
  | "hidden"
  | "offline"
  | "syncing"
  | "sync-done"
  | "failed"
  | "offline-queued";

const DONE_DISPLAY_MS = 2500;

export function OfflineSyncBanner({ status, lastPrefetch, isPrefetching = false, onPrefetch }: OfflineSyncBannerProps) {
  const {
    isOnline,
    isReady,
    isSyncing,
    salesQueueCount,
    totalQueueCount,
    failedQueueCount,
    lastSync,
    triggerRetryFailed,
  } = status;

  // Tick every minute so the "cached Xm ago" label stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const [pillState, setPillState] = useState<PillState>("hidden");
  const [dismissedFailed, setDismissedFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSyncingRef = useRef(isSyncing);

  useEffect(() => {
    if (!isReady) return;

    if (prevSyncingRef.current && !isSyncing && lastSync) {
      prevSyncingRef.current = false;
      if (lastSync.permanentlyFailed > 0 || failedQueueCount > 0) {
        setPillState("failed");
        setDismissedFailed(false);
      } else if (lastSync.synced > 0 && lastSync.failed === 0) {
        setPillState("sync-done");
        if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
        doneTimerRef.current = setTimeout(() => setPillState("hidden"), DONE_DISPLAY_MS);
      }
      return;
    }
    prevSyncingRef.current = isSyncing;

    if (isSyncing) {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
      setPillState("syncing");
      return;
    }

    if (!isOnline) {
      setPillState(salesQueueCount > 0 || totalQueueCount > 0 ? "offline-queued" : "offline");
      return;
    }

    if (failedQueueCount > 0 && !dismissedFailed) {
      setPillState("failed");
      return;
    }

    if (pillState !== "sync-done") {
      setPillState("hidden");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, isOnline, isSyncing, salesQueueCount, totalQueueCount, failedQueueCount, lastSync, dismissedFailed]); // pillState intentionally omitted — read-only peek to avoid reset loop

  // Animate in/out
  useEffect(() => {
    if (visTimerRef.current) clearTimeout(visTimerRef.current);
    if (pillState !== "hidden") {
      visTimerRef.current = setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
    }
  }, [pillState]);

  useEffect(() => {
    return () => {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
      if (visTimerRef.current) clearTimeout(visTimerRef.current);
    };
  }, []);

  if (pillState === "hidden" && !visible) return null;

  const baseClass = [
    "flex items-center gap-1.5 rounded-full text-[10.5px] font-semibold border transition-all duration-300 shrink-0",
    visible && pillState !== "hidden" ? "opacity-100 scale-100" : "opacity-0 scale-95",
  ].join(" ");

  if (pillState === "syncing") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`${baseClass} px-2.5 py-1 bg-primary/10 text-primary border-primary/25`}
      >
        <RefreshCw className="h-2.5 w-2.5 shrink-0" />
        <span className="hidden sm:inline">
          {salesQueueCount > 0
            ? `Syncing ${salesQueueCount} sale${salesQueueCount !== 1 ? "s" : ""}…`
            : totalQueueCount > 0
            ? `Syncing ${totalQueueCount} change${totalQueueCount !== 1 ? "s" : ""}…`
            : "Syncing…"}
        </span>
        <span className="sm:hidden">Syncing…</span>
      </div>
    );
  }

  if (pillState === "sync-done") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`${baseClass} px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25`}
      >
        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
        <span>Synced</span>
      </div>
    );
  }

  if (pillState === "failed") {
    return (
      <div
        role="alert"
        className={`${baseClass} px-2.5 py-1 bg-destructive/10 text-destructive border-destructive/25`}
      >
        <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
        <span className="hidden sm:inline">
          {failedQueueCount} failed
        </span>
        <button
          onClick={triggerRetryFailed}
          className="underline underline-offset-1 hover:no-underline shrink-0 font-bold"
        >
          Retry
        </button>
        <button
          onClick={() => {
            setDismissedFailed(true);
            setPillState("hidden");
          }}
          aria-label="Dismiss"
          className="opacity-60 hover:opacity-100 transition-opacity ml-0.5 font-bold"
        >
          ×
        </button>
      </div>
    );
  }

  if (pillState === "offline-queued") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`${baseClass} px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25`}
      >
        <CloudOff className="h-2.5 w-2.5 shrink-0" />
        <span className="hidden sm:inline">
          {salesQueueCount > 0
            ? `${salesQueueCount} sale${salesQueueCount !== 1 ? "s" : ""} queued`
            : `${totalQueueCount} queued`}
        </span>
        <span className="sm:hidden">
          {(salesQueueCount || totalQueueCount)} queued
        </span>
      </div>
    );
  }

  if (pillState === "offline") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`${baseClass} px-2.5 py-1 bg-muted text-muted-foreground border-border/50`}
      >
        <WifiOff className="h-2.5 w-2.5 shrink-0" />
        <span className="hidden sm:inline">
          {lastPrefetch ? `Offline · cached ${formatAge(lastPrefetch)}` : "Offline"}
        </span>
        <span className="sm:hidden">Offline</span>
      </div>
    );
  }

  // When online and actively refreshing cached data in the background
  if (isPrefetching) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`${baseClass} px-2.5 py-1 bg-primary/8 text-primary/70 border-primary/15`}
      >
        <Database className="h-2.5 w-2.5 shrink-0 animate-pulse" />
        <span className="hidden sm:inline">Caching data…</span>
      </div>
    );
  }

  // When online and there's cached data — show a subtle "refresh data" button
  if (isOnline && lastPrefetch && onPrefetch && pillState === "hidden") {
    return (
      <button
        onClick={onPrefetch}
        title={`Data cached ${formatAge(lastPrefetch)} · Click to refresh`}
        className={`${baseClass} px-2 py-1 bg-transparent text-muted-foreground/50 border-transparent hover:bg-muted/60 hover:text-muted-foreground hover:border-border/40 transition-all duration-150`}
        aria-label="Refresh cached data"
      >
        <Database className="h-3 w-3 shrink-0" />
      </button>
    );
  }

  return null;
}
