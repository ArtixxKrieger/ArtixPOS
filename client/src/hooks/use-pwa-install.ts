import { useEffect, useState, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __pwaPrompt: BeforeInstallPromptEvent | null;
    __pwaInstalled?: boolean;
  }
}

export type InstallPlatform = "chrome" | "safari-ios" | "safari-mac" | "firefox" | "edge" | "other";

function detectPlatform(): InstallPlatform {
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  if (isIOS) return "safari-ios";
  if (isSafari) return "safari-mac";
  if (/edg\//i.test(ua)) return "edge";
  if (/firefox/i.test(ua)) return "firefox";
  if (/chrome/i.test(ua)) return "chrome";
  return "other";
}

function isAlreadyInstalled() {
  return (
    (window as any).__pwaInstalled === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

const DISMISSED_KEY = "artix_pwa_install_dismissed";
const DISMISSED_UNTIL_KEY = "artix_pwa_install_dismissed_until";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

function wasDismissedForever() {
  try { return localStorage.getItem(DISMISSED_KEY) === "true"; } catch { return false; }
}
function isSnoozed() {
  try {
    const until = localStorage.getItem(DISMISSED_UNTIL_KEY);
    return until ? Date.now() < parseInt(until, 10) : false;
  } catch { return false; }
}

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform] = useState<InstallPlatform>(detectPlatform);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isAlreadyInstalled() || wasDismissedForever() || isSnoozed()) return;

    // Pick up event already captured in index.html before React mounted
    const stored = (window as any).__pwaPrompt as BeforeInstallPromptEvent | null;
    if (stored) {
      setPromptEvent(stored);
      setIsVisible(true);
      return;
    }

    // Listen for the relay event from the early capture
    const onReady = () => {
      const e = (window as any).__pwaPrompt as BeforeInstallPromptEvent | null;
      if (e) { setPromptEvent(e); setIsVisible(true); }
    };
    window.addEventListener("pwa-prompt-ready", onReady);

    // For Safari/Firefox/browsers that don't support beforeinstallprompt,
    // show the instructions banner after a short delay anyway.
    const fallbackTimer = setTimeout(() => {
      if (!(window as any).__pwaPrompt) {
        setIsVisible(true);
      }
    }, 4000);

    return () => {
      window.removeEventListener("pwa-prompt-ready", onReady);
      clearTimeout(fallbackTimer);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return false;
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") {
        setIsVisible(false);
        setPromptEvent(null);
        (window as any).__pwaPrompt = null;
        return true;
      }
    } catch {}
    return false;
  }, [promptEvent]);

  const dismiss = useCallback((forever = false) => {
    setIsVisible(false);
    try {
      if (forever) {
        localStorage.setItem(DISMISSED_KEY, "true");
      } else {
        localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + SNOOZE_MS));
      }
    } catch {}
  }, []);

  return {
    isVisible,
    canInstall: !!promptEvent,
    platform,
    install,
    dismiss,
  };
}
