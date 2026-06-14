import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "sileo/styles.css";
import "./i18n";

function dismissSplash() {
  const splash = document.getElementById("app-splash");
  if (!splash) return;
  splash.classList.add("sp-hiding");
  splash.addEventListener("animationend", () => { try { splash.remove(); } catch (_) {} }, { once: true });

  setTimeout(() => { try { splash.remove(); } catch (_) {} }, 3000);
}

function forceDismissSplash() {
  const splash = document.getElementById("app-splash");
  if (splash) { try { splash.remove(); } catch (_) {} }
}

window.addEventListener("pageshow", (event) => {
  if ((event as PageTransitionEvent).persisted) {
    forceDismissSplash();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {

    const root = document.getElementById("root");
    if (root && root.childElementCount > 0) {
      forceDismissSplash();
    }
  }
});

const _swHost = window.location.hostname;
const _isLocalhost = _swHost === "localhost" || _swHost === "127.0.0.1" || _swHost === "0.0.0.0";
// Disable SW in Vite dev mode: it can serve stale cached HTML referencing old
// hashed production assets (which 404 in dev), triggering SW_ASSET_404 reload
// loops.  The SW is only useful in production builds.
const _shouldRegisterSW = "serviceWorker" in navigator && !_isLocalhost && !import.meta.env.DEV;

if ("serviceWorker" in navigator) {
  if (_shouldRegisterSW) {

navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "SW_ASSET_404") {
        const STALE_KEY = "_artix_stale_reload";
        try {
          const attempts = Number(sessionStorage.getItem(STALE_KEY) ?? "0");
          if (attempts >= 3) return;
          sessionStorage.setItem(STALE_KEY, String(attempts + 1));
        } catch { return; }
        const doReload = () => window.location.reload();
        if (window.caches) {
          caches.keys()
            .then((keys) => Promise.all(keys.map((k) => caches.delete(k).catch(() => {}))))
            .catch(() => {})
            .finally(doReload);
        } else {
          doReload();
        }
      }
    });

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {

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

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

const SPLASH_MIN_MS = 2000;
const splashStart = (window as any).__splashStart ?? Date.now();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const elapsed = Date.now() - splashStart;
    const remaining = Math.max(0, SPLASH_MIN_MS - elapsed);
    if (remaining > 0) {
      setTimeout(dismissSplash, remaining);
    } else {
      dismissSplash();
    }
  });
});
