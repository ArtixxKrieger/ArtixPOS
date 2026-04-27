import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
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

/**
 * Catches render errors anywhere below it so a single broken component (or a
 * failed dynamic chunk import after a deploy) doesn't unmount the entire app
 * to a blank white screen. Stale-chunk errors auto-recover by reloading once.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);

    if (isChunkLoadError(error)) {
      const key = "artixpos_chunk_reload_at";
      const last = Number(sessionStorage.getItem(key) ?? "0");
      // Only auto-reload once per minute to avoid an infinite reload loop
      // if the new bundle itself is broken.
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#080810] px-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Something went wrong</h1>
          <p className="text-sm text-slate-500 dark:text-white/60">
            {isChunkLoadError(error)
              ? "We're loading a fresh version of the app — please wait a moment."
              : "An unexpected error happened. You can try again, or refresh the page."}
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
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
          </div>
        </div>
      </div>
    );
  }
}
