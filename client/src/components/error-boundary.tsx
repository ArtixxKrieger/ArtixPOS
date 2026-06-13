import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

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

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, componentStack: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
    this.setState({ componentStack: info.componentStack ?? null });

if (isChunkLoadError(error) && navigator.onLine) {
      const key = "artixpos_chunk_reload_at";
      const last = Number(sessionStorage.getItem(key) ?? "0");

if (Date.now() - last > 60_000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    }
  }

  reset = () => {
    this.setState({ error: null, componentStack: null });
  };

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
    } catch {

    }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    const isOfflineChunk = isChunkLoadError(error) && !navigator.onLine;

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#080810] px-6 py-12">
        <div className="max-w-md w-full text-center space-y-4">
          <div className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center ${
            isOfflineChunk
              ? "bg-amber-100 dark:bg-amber-900/30"
              : "bg-red-100 dark:bg-red-900/30"
          }`}>
            {isOfflineChunk ? (
              <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M12 8v4m0 4h.01" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            {isOfflineChunk ? "You're offline" : "Something went wrong"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-white/60">
            {isOfflineChunk
              ? "This page hasn't been downloaded yet. Connect to the internet once and it will be available offline from then on."
              : isChunkLoadError(error)
              ? "We're loading a fresh version of the app — please wait a moment."
              : "An unexpected error happened. You can try again, or refresh the page."}
          </p>
          {isOfflineChunk && (
            <div className="flex gap-2 justify-center pt-1">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-white/15 text-sm font-medium text-slate-700 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={this.reset}
                className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
                data-testid="button-error-retry"
              >
                Retry
              </button>
            </div>
          )}

          {}
          {!isOfflineChunk && <div className="text-left bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-3 text-xs">
            <p className="font-mono break-words text-rose-700 dark:text-rose-400" data-testid="text-error-message">
              {error.name}: {error.message || "(no message)"}
            </p>
            {(error.stack || this.state.componentStack) && (
              <details className="mt-2">
                <summary className="cursor-pointer text-slate-500 dark:text-white/50 select-none">
                  Show details
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-slate-600 dark:text-white/60">
{error.stack ?? ""}
{this.state.componentStack ? `\n\nComponent stack:${this.state.componentStack}` : ""}
                </pre>
              </details>
            )}
          </div>}

          {!isOfflineChunk && (
          <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
            <button
              type="button"
              onClick={this.reset}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
              data-testid="button-error-retry"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-white/15 text-slate-700 dark:text-white/80 text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              data-testid="button-error-reload"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={this.hardReload}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-white/15 text-slate-700 dark:text-white/80 text-sm font-medium hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              data-testid="button-error-clear-cache"
              title="Clears the app cache and reloads — fixes most stale-version issues."
            >
              Clear cache &amp; reload
            </button>
          </div>
          )}
        </div>
      </div>
    );
  }
}
