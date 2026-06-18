/**
 * Automatic client-side error capture.
 * Hooks into window.onerror, unhandledrejection, console.error, and React
 * boundaries. Batches payloads and flushes them to POST /api/client-errors
 * using navigator.sendBeacon (works even on tab close) with a fetch fallback.
 *
 * Call initErrorCapture() once, as early as possible (main.tsx).
 */

const ENDPOINT = "/api/client-errors";
const FLUSH_INTERVAL_MS = 5_000;
const MAX_QUEUE = 50;

type ErrorType =
  | "uncaught_error"
  | "unhandled_rejection"
  | "console_error"
  | "react_boundary"
  | "api_error";

interface ErrorPayload {
  type: ErrorType;
  message: string;
  stack?: string;
  url?: string;
  userId?: string;
  sessionId?: string;
  extra?: Record<string, unknown>;
}

let _userId: string | null = null;
let _sessionId: string | null = null;
let _queue: ErrorPayload[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _initialized = false;

export function setErrorCaptureUser(id: string | null) {
  _userId = id;
}

function getSessionId(): string {
  if (_sessionId) return _sessionId;
  try {
    let id = sessionStorage.getItem("artixpos_session_id");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("artixpos_session_id", id);
    }
    _sessionId = id;
    return id;
  } catch {
    _sessionId = "unknown";
    return _sessionId;
  }
}

function enqueue(payload: ErrorPayload) {
  if (_queue.length >= MAX_QUEUE) return;
  _queue.push({
    ...payload,
    userId: _userId ?? undefined,
    sessionId: getSessionId(),
    url: payload.url ?? window.location.pathname,
  });
}

export function captureError(
  type: ErrorType,
  message: string,
  stack?: string,
  extra?: Record<string, unknown>,
) {
  enqueue({ type, message, stack, extra });
}

function flush() {
  if (_queue.length === 0) return;
  const batch = _queue.splice(0, _queue.length);
  const body = JSON.stringify(batch);

  // navigator.sendBeacon works during page unload; fetch for normal flushes
  if (typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    const sent = navigator.sendBeacon(ENDPOINT, blob);
    if (sent) return;
  }

  // Fallback: silent fetch (fire-and-forget, don't await)
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function truncate(s: string, max = 1000) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function initErrorCapture() {
  if (_initialized) return;
  _initialized = true;

  // ── 1. Uncaught JS errors ─────────────────────────────────────────────────
  const prevOnError = window.onerror;
  window.onerror = function (msg, src, line, col, err) {
    const message = String(msg ?? "Unknown error");
    // Ignore noisy browser-extension / cross-origin noise
    if (message === "Script error." || message === "ResizeObserver loop limit exceeded") {
      return false;
    }
    enqueue({
      type: "uncaught_error",
      message: truncate(message),
      stack: err?.stack ? truncate(err.stack, 3000) : `${src}:${line}:${col}`,
    });
    if (typeof prevOnError === "function") return prevOnError.call(this, msg, src, line, col, err);
    return false;
  };

  // ── 2. Unhandled promise rejections ──────────────────────────────────────
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    // Skip AbortErrors (cancelled fetch) — those are intentional
    if (reason instanceof DOMException && reason.name === "AbortError") return;
    enqueue({
      type: "unhandled_rejection",
      message: truncate(message),
      stack: reason instanceof Error ? truncate(reason.stack ?? "", 3000) : undefined,
    });
  });

  // ── 3. console.error patch ────────────────────────────────────────────────
  const origConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    origConsoleError(...args);
    // Skip React DevTools noise and our own [ErrorBoundary] logs (captured separately)
    const first = String(args[0] ?? "");
    if (
      first.startsWith("%c") ||
      first.startsWith("[ErrorBoundary]") ||
      first.startsWith("[vite]")
    ) return;
    const message = args
      .map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    enqueue({ type: "console_error", message: truncate(message) });
  };

  // ── 4. Periodic flush ─────────────────────────────────────────────────────
  _flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

  // ── 5. Flush on tab close / navigation ───────────────────────────────────
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

export function flushErrorCapture() {
  flush();
}
