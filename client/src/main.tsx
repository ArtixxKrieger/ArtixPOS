import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "sileo/styles.css";

// ── Splash screen dismissal ───────────────────────────────────────────────
// The #app-splash div is rendered in raw HTML and shows instantly before any
// JS downloads. Once React has painted its first frame we fade it out and
// remove it from the DOM so it no longer consumes memory or GPU layers.
function dismissSplash() {
  const splash = document.getElementById("app-splash");
  if (!splash) return;
  splash.classList.add("sp-hiding");
  splash.addEventListener("animationend", () => { splash.remove(); }, { once: true });
  // Safety fallback — remove even if animation doesn't fire (e.g. reduced motion)
  setTimeout(() => { try { splash.remove(); } catch (_) {} }, 600);
}

// ── Service worker ────────────────────────────────────────────────────────
// Register only in production. In development the SW caches Vite's dev
// modules and causes stale-chunk white screens after HMR restarts.
// Returning dev/preview users get any lingering SW proactively unregistered.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Tell a waiting SW to activate immediately
          if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (installing) {
              installing.addEventListener("statechange", () => {
                if (installing.state === "installed" && navigator.serviceWorker.controller) {
                  installing.postMessage("SKIP_WAITING");
                }
              });
            }
          });
        })
        .catch(() => {});
    });
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister().catch(() => {})))
      .catch(() => {});
    if (window.caches) {
      caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {});
    }
  }
}

// ── Vite HMR ping interceptor (dev only) ─────────────────────────────────
// Vite's HMR WebSocket drops when wifi is lost. On reconnect Vite polls
// with a ping and, upon success, calls location.reload() — discarding any
// offline-queued POS sales. We intercept that ping during the reconnect
// window so Vite never triggers a reload.
if (import.meta.env.DEV) {
  let blockPing = false;
  let unblockTimer: ReturnType<typeof setTimeout> | null = null;

  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const isVitePing = blockPing && init != null && (init as RequestInit).mode === "no-cors";
    if (isVitePing) return new Promise<Response>(() => {});
    return originalFetch(input, init);
  };

  window.addEventListener("offline", () => {
    blockPing = true;
    if (unblockTimer) clearTimeout(unblockTimer);
    unblockTimer = setTimeout(() => { blockPing = false; }, 120_000);
  });

  window.addEventListener("online", () => {
    if (unblockTimer) clearTimeout(unblockTimer);
    unblockTimer = setTimeout(() => { blockPing = false; }, 12_000);
  });
}

// ── Mount React ───────────────────────────────────────────────────────────
const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// Dismiss the splash on the frame after React paints.
// Double-rAF ensures the browser has composited at least one real frame.
requestAnimationFrame(() => {
  requestAnimationFrame(dismissSplash);
});
