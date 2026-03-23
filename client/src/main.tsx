import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "sileo/styles.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// In development, Vite's HMR WebSocket drops when wifi is lost. When wifi
// returns, Vite polls the dev server with a special ping request, and upon
// success immediately calls location.reload(). This causes a full page reload
// that discards all offline-queued sales.
//
// Fix: intercept that ping request so it never resolves during the reconnect
// window. Without a successful ping, Vite never calls location.reload().
// After 12 s we unblock, so HMR still works for normal code changes.
// In production there is no HMR, so this block never runs.
if (import.meta.env.DEV) {
  let blockPing = false;
  let unblockTimer: ReturnType<typeof setTimeout> | null = null;

  const originalFetch = window.fetch.bind(window);

  window.fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    // Detect Vite's server-availability ping.
    // Vite sends it with Accept: text/x-vite-ping and mode: no-cors.
    const isVitePing =
      blockPing &&
      init != null &&
      (init as RequestInit).mode === "no-cors";

    if (isVitePing) {
      // Return a promise that never resolves → Vite never calls reload().
      return new Promise<Response>(() => {});
    }

    return originalFetch(input, init);
  };

  window.addEventListener("offline", () => {
    blockPing = true;
    if (unblockTimer) clearTimeout(unblockTimer);
    // Safety valve: unblock after 2 min even if online event never fires.
    unblockTimer = setTimeout(() => {
      blockPing = false;
    }, 120_000);
  });

  window.addEventListener("online", () => {
    // Keep blocking for 12 s so Vite's ping (which fires a few seconds after
    // the online event) is still intercepted, then release.
    if (unblockTimer) clearTimeout(unblockTimer);
    unblockTimer = setTimeout(() => {
      blockPing = false;
    }, 12_000);
  });
}

createRoot(document.getElementById("root")!).render(<App />);
