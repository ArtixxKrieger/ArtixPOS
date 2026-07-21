import { Component, type ErrorInfo, type ReactNode } from "react";
import { queryClient } from "@/lib/queryClient";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
  /** True while a silent auto-recovery reload is in flight — suppresses the error UI. */
  reloading: boolean;
}

// ── Error classifiers ─────────────────────────────────────────────────────────

/**
 * Stale/corrupted IndexedDB or React Query cache returned a non-array where an
 * array method (.filter, .map, …) was called. Always recovers after cache clear + reload.
 */
const isStaleDataError = (err: Error) => {
  const msg = String(err?.message ?? "");
  return (
    err instanceof TypeError &&
    // Match "St.filter is not a function", "t.map is not a function", etc.
    /\.(filter|map|find|findIndex|forEach|reduce|reduceRight|some|every|flatMap|flat|indexOf|includes)\s+is not a function/.test(msg)
  );
};

const isChunkLoadError = (err: Error) => {
  const msg = String(err?.message ?? "");
  const name = String(err?.name ?? "");
  return (
    name === "ChunkLoadError" ||
    /Loading (chunk|CSS chunk) [\d]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
};

const isNetworkError = (err: Error) => {
  const msg = String(err?.message ?? "");
  return /fetch|network|net::|Failed to fetch|NetworkError/i.test(msg);
};

/**
 * Returns a plain-English description of the error suitable for showing to a
 * non-technical user. Falls back to the raw message when nothing matches.
 */
function friendlyDescription(err: Error): { title: string; hint: string } {
  if (isStaleDataError(err)) {
    return {
      title: "Stale data from cache",
      hint: "The app loaded outdated data when your session resumed. The cache has been cleared and the page is refreshing automatically.",
    };
  }
  if (isChunkLoadError(err)) {
    return {
      title: "App update required",
      hint: "A new version of the app was deployed. The page will reload to fetch the latest files.",
    };
  }
  if (isNetworkError(err)) {
    return {
      title: "Network error",
      hint: "A request failed. Check your connection, then try again.",
    };
  }
  if (err instanceof TypeError) {
    return {
      title: "Unexpected data format",
      hint: "The app received data in an unexpected shape. Reloading usually fixes this.",
    };
  }
  if (err instanceof RangeError) {
    return {
      title: "Value out of range",
      hint: "A numeric value exceeded its valid bounds. Try again or reload.",
    };
  }
  // Generic fallback — still friendlier than a raw stack trace
  return {
    title: "Unexpected error",
    hint: "Something went wrong on this page. You can try again or reload.",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null, reloading: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Mark reloading immediately for stale-data errors so render() never shows
    // the error UI — componentDidCatch will trigger the actual reload shortly after.
    return { error, componentStack: null, reloading: isStaleDataError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
    this.setState({ componentStack: info.componentStack ?? null });

    // Forward to automatic error capture (fire-and-forget)
    import("@/lib/error-capture").then(({ captureError }) => {
      captureError(
        "react_boundary",
        error.message,
        (error.stack ?? "") + "\n\nComponent Stack:" + (info.componentStack ?? ""),
      );
    }).catch(() => {});

    // ── Auto-recovery: stale cache ───────────────────────────────────────────
    // "X.filter is not a function" means a non-array came back from cache.
    // Clear React Query + IDB API cache, then reload. SessionStorage guard
    // prevents an infinite loop if the fresh data is also somehow bad.
    if (isStaleDataError(error)) {
      const key = "artixpos_stale_reload_at";
      const last = Number(sessionStorage.getItem(key) ?? "0");
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(key, String(Date.now()));
        try {
          queryClient.clear();
          import("@/lib/offline-db")
            .then(({ clearApiCache }) =>
              clearApiCache().catch(() => {}).finally(() => window.location.reload())
            )
            .catch(() => window.location.reload());
        } catch {
          window.location.reload();
        }
        return; // page is reloading — nothing else to do
      }
      // Guard tripped (second crash within 60 s) — show error UI so the user
      // can act rather than looping. Un-suppress the reloading flag.
      this.setState({ reloading: false });
      return;
    }

    // ── Auto-recovery: stale JS chunk (production only) ──────────────────────
    if (isChunkLoadError(error) && navigator.onLine && import.meta.env.PROD) {
      const key = "artixpos_chunk_reload_at";
      const last = Number(sessionStorage.getItem(key) ?? "0");
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(key, String(Date.now()));
        const doReload = () => window.location.reload();
        try {
          const unregisterSW = "serviceWorker" in navigator
            ? navigator.serviceWorker
                .getRegistrations()
                .then((regs) => Promise.all(regs.map((r) => r.unregister().catch(() => false))))
                .catch(() => {})
            : Promise.resolve();
          const wipeCaches = window.caches
            ? caches.keys()
                .then((keys) => Promise.all(keys.map((k) => caches.delete(k).catch(() => false))))
                .catch(() => {})
            : Promise.resolve();
          Promise.all([unregisterSW, wipeCaches]).finally(doReload);
        } catch {
          doReload();
        }
      }
    }
  }

  reset = () => this.setState({ error: null, componentStack: null, reloading: false });

  hardReload = () => {
    try {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((r) => r.unregister().catch(() => false))))
          .catch(() => {})
          .finally(() => {
            if (window.caches) {
              caches
                .keys()
                .then((keys) => Promise.all(keys.map((k) => caches.delete(k).catch(() => false))))
                .catch(() => {})
                .finally(() => window.location.reload());
            } else {
              window.location.reload();
            }
          });
        return;
      }
    } catch {}
    window.location.reload();
  };

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;

    // Silent auto-recovery in progress — render nothing visible
    if (reloading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#080810]">
          <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-white/50">
            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <p className="text-sm">Refreshing…</p>
          </div>
        </div>
      );
    }

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    const isOfflineChunk = isChunkLoadError(error) && !navigator.onLine;
    const { title, hint } = friendlyDescription(error);

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#080810] px-6 py-12">
        <div className="max-w-md w-full text-center space-y-4">

          {/* Icon */}
          <div className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center ${
            isOfflineChunk ? "bg-amber-100 dark:bg-amber-900/30" : "bg-red-100 dark:bg-red-900/30"
          }`}>
            {isOfflineChunk ? (
              <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M12 8v4m0 4h.01" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>

          {/* Heading + human-readable hint */}
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              {isOfflineChunk ? "You're offline" : title}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
              {isOfflineChunk
                ? "This page hasn't been downloaded yet. Connect to the internet once and it will be available offline from then on."
                : hint}
            </p>
          </div>

          {/* Offline chunk: minimal actions */}
          {isOfflineChunk && (
            <div className="flex gap-2 justify-center pt-1">
              <button type="button" onClick={() => window.history.back()}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-white/15 text-sm font-medium text-slate-700 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                Go back
              </button>
              <button type="button" onClick={this.reset}
                className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
                data-testid="button-error-retry">
                Retry
              </button>
            </div>
          )}

          {/* Technical detail — collapsed by default, useful for bug reports */}
          {!isOfflineChunk && (
            <div className="text-left bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-3 text-xs">
              <details>
                <summary className="cursor-pointer text-slate-500 dark:text-white/50 select-none list-none flex items-center gap-1.5">
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Technical details
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="font-mono break-all text-rose-700 dark:text-rose-400" data-testid="text-error-message">
                    {error.name}: {error.message || "(no message)"}
                  </p>
                  {(error.stack || this.state.componentStack) && (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-slate-600 dark:text-white/60 border-t border-slate-200 dark:border-white/10 pt-2 mt-2">
{error.stack ?? ""}
{this.state.componentStack ? `\n\nComponent stack:${this.state.componentStack}` : ""}
                    </pre>
                  )}
                </div>
              </details>
            </div>
          )}

          {/* Action buttons */}
          {!isOfflineChunk && (
            <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
              <button type="button" onClick={this.reset}
                className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
                data-testid="button-error-retry">
                Try again
              </button>
              <button type="button" onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-white/15 text-slate-700 dark:text-white/80 text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                data-testid="button-error-reload">
                Reload page
              </button>
              <button type="button" onClick={this.hardReload}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-white/15 text-slate-700 dark:text-white/80 text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                data-testid="button-error-clear-cache"
                title="Clears the app cache and reloads — fixes most stale-version issues.">
                Clear cache &amp; reload
              </button>
            </div>
          )}

        </div>
      </div>
    );
  }
}
