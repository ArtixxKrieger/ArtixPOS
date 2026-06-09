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

const DISMISSED_KEY = "artix_pwa_install_dismissed";
const DISMISSED_UNTIL_KEY = "artix_pwa_install_dismissed_until";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function isAlreadyInstalled() {
  return (
    (window as any).__pwaInstalled === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function wasDismissedForever() {
  try { return localStorage.getItem(DISMISSED_KEY) === "true"; } catch { return false; }
}

function isSnoozed() {
  try {
    const until = localStorage.getItem(DISMISSED_UNTIL_KEY);
    if (!until) return false;
    return Date.now() < parseInt(until, 10);
  } catch { return false; }
}

function getStoredPrompt(): BeforeInstallPromptEvent | null {
  return (window as any).__pwaPrompt ?? null;
}

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isAlreadyInstalled() || wasDismissedForever() || isSnoozed()) return;

    // Check if the event was already captured before React mounted
    const stored = getStoredPrompt();
    if (stored) {
      setPromptEvent(stored);
      setIsVisible(true);
      return;
    }

    // Listen for the custom event fired by the early capture in index.html
    const onReady = () => {
      const e = getStoredPrompt();
      if (e) {
        setPromptEvent(e);
        setIsVisible(true);
      }
    };

    window.addEventListener("pwa-prompt-ready", onReady);
    return () => window.removeEventListener("pwa-prompt-ready", onReady);
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") {
        setIsVisible(false);
        setPromptEvent(null);
        (window as any).__pwaPrompt = null;
      }
    } catch {}
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

  const canInstall = !!promptEvent && !isAlreadyInstalled();

  return { isVisible, canInstall, install, dismiss, promptEvent };
}
