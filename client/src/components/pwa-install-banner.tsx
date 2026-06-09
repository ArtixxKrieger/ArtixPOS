import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

export function PwaInstallBanner() {
  const { isVisible, install, dismiss } = usePwaInstall();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isVisible) {
      const t = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(t);
    } else {
      setShow(false);
    }
  }, [isVisible]);

  if (!show) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm"
      role="dialog"
      aria-label="Install app"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#1c1c2e]/95 backdrop-blur-md px-4 py-3 shadow-2xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600">
          <img
            src="/logo192.png"
            alt="ArtixPOS"
            className="h-7 w-7 rounded-lg object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white leading-tight">Install ArtixPOS</p>
          <p className="text-xs text-white/50 leading-tight mt-0.5">artixpos.com</p>
        </div>

        <button
          onClick={install}
          data-testid="button-pwa-install"
          className="shrink-0 rounded-full bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 active:scale-95 transition-all"
        >
          Install
        </button>

        <button
          onClick={() => dismiss(false)}
          data-testid="button-pwa-dismiss"
          className="shrink-0 rounded-full p-1 text-white/40 hover:text-white/70 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
