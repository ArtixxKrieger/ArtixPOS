import { useEffect, useState, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "artix_pwa_install_dismissed";
const DISMISSED_UNTIL_KEY = "artix_pwa_install_dismissed_until";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function isAlreadyInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function wasDismissedForever() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function isSnoozed() {
  try {
    const until = localStorage.getItem(DISMISSED_UNTIL_KEY);
    if (!until) return false;
    return Date.now() < parseInt(until, 10);
  } catch {
    return false;
  }
}

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isAlreadyInstalled() || wasDismissedForever() || isSnoozed()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") {
      setIsVisible(false);
      setPromptEvent(null);
    }
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

  return { isVisible, install, dismiss };
}
