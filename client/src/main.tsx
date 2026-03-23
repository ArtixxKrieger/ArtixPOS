import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "sileo/styles.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// In development, Vite's HMR WebSocket drops when wifi is lost.
// When wifi returns, Vite polls the server and then calls location.reload()
// to "resync" — causing a full page reload and losing all offline state.
// This intercepts that specific reload so the app stays alive and can
// sync offline-queued sales normally. In production there is no HMR,
// so this block never runs.
if (import.meta.env.DEV) {
  let blockNextReload = false;
  let blockTimer: ReturnType<typeof setTimeout> | null = null;

  const originalReload = Location.prototype.reload;
  Location.prototype.reload = function (this: Location) {
    if (blockNextReload) return;
    originalReload.call(this);
  };

  window.addEventListener("offline", () => {
    blockNextReload = true;
    if (blockTimer) clearTimeout(blockTimer);
    // Safety: lift the block after 2 minutes if nothing happens.
    blockTimer = setTimeout(() => {
      blockNextReload = false;
    }, 120_000);
  });

  window.addEventListener("online", () => {
    // Vite polls then calls reload() a few seconds after the online event.
    // Keep the block for 10 s to catch that call, then lift it so
    // intentional reloads (e.g. manual refresh) still work.
    if (blockTimer) clearTimeout(blockTimer);
    blockTimer = setTimeout(() => {
      blockNextReload = false;
    }, 10_000);
  });
}

createRoot(document.getElementById("root")!).render(<App />);
