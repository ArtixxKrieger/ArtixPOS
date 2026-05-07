import { useState, useEffect, useRef } from "react";
import { WifiOff, RefreshCw, CloudOff, AlertTriangle, CheckCircle2, X } from "lucide-react";
import type { OnlineStatus } from "@/hooks/use-online-status";

interface OfflineSyncBannerProps {
  status: OnlineStatus;
}

type BannerState =
  | "hidden"
  | "offline"          // no internet
  | "syncing"          // uploading queued data
  | "sync-done"        // just finished — brief "All synced" flash
  | "failed"           // has permanently failed items
  | "offline-queued";  // offline + has pending sales

const DONE_DISPLAY_MS = 3000; // how long to show "All synced" before hiding

export function OfflineSyncBanner({ status }: OfflineSyncBannerProps) {
  const {
    isOnline,
    isSyncing,
    salesQueueCount,
    totalQueueCount,
    failedQueueCount,
    lastSync,
    triggerSync,
    triggerRetryFailed,
  } = status;

  const [bannerState, setBannerState] = useState<BannerState>("hidden");
  const [dismissedFailed, setDismissedFailed] = useState(false);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSyncingRef = useRef(isSyncing);

  useEffect(() => {
    // Detect sync completion (isSyncing: true → false)
    if (prevSyncingRef.current && !isSyncing && lastSync) {
      prevSyncingRef.current = false;
      if (lastSync.permanentlyFailed > 0 || failedQueueCount > 0) {
        setBannerState("failed");
        setDismissedFailed(false);
      } else if (lastSync.synced > 0 && lastSync.failed === 0) {
        setBannerState("sync-done");
        if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
        doneTimerRef.current = setTimeout(() => {
          setBannerState("hidden");
        }, DONE_DISPLAY_MS);
      }
      return;
    }
    prevSyncingRef.current = isSyncing;

    if (isSyncing) {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
      setBannerState("syncing");
      return;
    }

    if (!isOnline) {
      if (salesQueueCount > 0 || totalQueueCount > 0) {
        setBannerState("offline-queued");
      } else {
        setBannerState("offline");
      }
      return;
    }

    if (failedQueueCount > 0 && !dismissedFailed) {
      setBannerState("failed");
      return;
    }

    // Online, not syncing, no failures, no queue — hide
    if (bannerState !== "sync-done") {
      setBannerState("hidden");
    }
  }, [isOnline, isSyncing, salesQueueCount, totalQueueCount, failedQueueCount, lastSync, dismissedFailed]);

  useEffect(() => {
    return () => {
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, []);

  if (bannerState === "hidden") return null;

  // ── Banner variants ──────────────────────────────────────────────────────
  if (bannerState === "syncing") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white"
        style={{
          background: "linear-gradient(90deg, #7c3aed, #4f46e5)",
          boxShadow: "0 2px 12px rgba(124,58,237,0.35)",
        }}
      >
        <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
        <span>
          Syncing{" "}
          {salesQueueCount > 0
            ? `${salesQueueCount} sale${salesQueueCount !== 1 ? "s" : ""}`
            : totalQueueCount > 0
            ? `${totalQueueCount} change${totalQueueCount !== 1 ? "s" : ""}`
            : "offline data"}
          …
        </span>
      </div>
    );
  }

  if (bannerState === "sync-done") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white"
        style={{
          background: "linear-gradient(90deg, #059669, #10b981)",
          boxShadow: "0 2px 12px rgba(5,150,105,0.3)",
        }}
      >
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        <span>All synced — data is up to date</span>
      </div>
    );
  }

  if (bannerState === "failed") {
    return (
      <div
        role="alert"
        className="fixed top-0 inset-x-0 z-50 flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white"
        style={{
          background: "linear-gradient(90deg, #dc2626, #b91c1c)",
          boxShadow: "0 2px 12px rgba(220,38,38,0.3)",
        }}
      >
        <AlertTriangle className="h-3 w-3 shrink-0" />
        <span className="flex-1">
          {failedQueueCount} item{failedQueueCount !== 1 ? "s" : ""} failed to sync.
        </span>
        <button
          onClick={triggerRetryFailed}
          className="underline underline-offset-2 hover:no-underline shrink-0 mr-2"
        >
          Retry
        </button>
        <button
          onClick={() => {
            setDismissedFailed(true);
            setBannerState("hidden");
          }}
          aria-label="Dismiss"
          className="shrink-0 opacity-80 hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (bannerState === "offline-queued") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold"
        style={{
          background: "rgba(245,158,11,0.95)",
          color: "#1c1917",
          boxShadow: "0 2px 12px rgba(245,158,11,0.35)",
        }}
      >
        <CloudOff className="h-3 w-3 shrink-0" />
        <span>
          Offline —{" "}
          {salesQueueCount > 0
            ? `${salesQueueCount} sale${salesQueueCount !== 1 ? "s" : ""} queued`
            : `${totalQueueCount} change${totalQueueCount !== 1 ? "s" : ""} queued`}{" "}
          (will sync when reconnected)
        </span>
      </div>
    );
  }

  // bannerState === "offline"
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold"
      style={{
        background: "rgba(71,85,105,0.95)",
        color: "#f1f5f9",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      }}
    >
      <WifiOff className="h-3 w-3 shrink-0" />
      <span>No internet connection — working offline</span>
      <button
        onClick={triggerSync}
        className="ml-2 underline underline-offset-2 hover:no-underline opacity-80 hover:opacity-100"
      >
        Check
      </button>
    </div>
  );
}
