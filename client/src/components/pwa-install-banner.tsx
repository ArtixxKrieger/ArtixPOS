import { usePwaInstall, type InstallPlatform } from "@/hooks/use-pwa-install";
import { X, Download, Share, MoreVertical } from "lucide-react";
import { useEffect, useState } from "react";

function InstallInstructions({ platform }: { platform: InstallPlatform }) {
  if (platform === "safari-ios") {
    return (
      <div className="flex items-center gap-2 text-xs text-white/60 mt-1">
        <span>Tap</span>
        <span className="inline-flex items-center gap-1 bg-white/10 rounded px-1.5 py-0.5 text-white/80">
          <Share className="w-3 h-3" /> Share
        </span>
        <span>then</span>
        <span className="bg-white/10 rounded px-1.5 py-0.5 text-white/80 whitespace-nowrap">Add to Home Screen</span>
      </div>
    );
  }
  if (platform === "safari-mac") {
    return (
      <div className="text-xs text-white/60 mt-1">
        File menu → <span className="text-white/80">Add to Dock</span>
      </div>
    );
  }
  if (platform === "firefox") {
    return (
      <div className="flex items-center gap-2 text-xs text-white/60 mt-1">
        <span>Click</span>
        <span className="inline-flex items-center gap-1 bg-white/10 rounded px-1.5 py-0.5 text-white/80">
          <MoreVertical className="w-3 h-3" /> Menu
        </span>
        <span>→ Install</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-white/60 mt-1">
      <span>Or click</span>
      <span className="inline-flex items-center gap-1 bg-white/10 rounded px-1.5 py-0.5 text-white/80">
        <Download className="w-3 h-3" />
      </span>
      <span>in your address bar</span>
    </div>
  );
}

export function PwaInstallBanner() {
  const { isVisible, canInstall, platform, install, dismiss } = usePwaInstall();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isVisible) {
      const t = setTimeout(() => setShow(true), 800);
      return () => clearTimeout(t);
    } else {
      setShow(false);
    }
  }, [isVisible]);

  if (!show) return null;

  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm"
      style={{ animation: "pwa-slide-up 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}
      role="dialog"
      aria-label="Install ArtixPOS"
    >
      <style>{`
        @keyframes pwa-slide-up {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <div className="rounded-2xl border border-white/10 bg-[#13131f]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        {}
        <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 shadow-lg">
            <img src="/logo192.png" alt="ArtixPOS" className="h-8 w-8 rounded-lg object-cover" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white leading-tight">Install ArtixPOS</p>
            <p className="text-xs text-white/40 leading-tight mt-0.5">artixpos.com</p>
          </div>

          <button
            onClick={() => dismiss(false)}
            data-testid="button-pwa-dismiss"
            className="shrink-0 p-1 rounded-full text-white/30 hover:text-white/60 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {}
        <div className="px-4 pb-3.5">
          {canInstall ? (
            <button
              onClick={install}
              data-testid="button-pwa-install"
              className="w-full rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-[0.98] transition-all py-2.5 text-sm font-semibold text-white"
            >
              Install App
            </button>
          ) : (
            <InstallInstructions platform={platform} />
          )}
        </div>
      </div>
    </div>
  );
}
