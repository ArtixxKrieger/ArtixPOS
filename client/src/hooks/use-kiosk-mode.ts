import { useState, useEffect, useCallback } from "react";

const KIOSK_PIN_KEY = "artixpos_kiosk_pin";
const KIOSK_ACTIVE_KEY = "artixpos_kiosk_active";

export const DEFAULT_KIOSK_PIN = "1234";

export function useKioskMode() {
  const [isActive, setIsActive] = useState(() => {
    try { return localStorage.getItem(KIOSK_ACTIVE_KEY) === "1"; } catch { return false; }
  });
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);

  const getPin = useCallback((): string => {
    try { return localStorage.getItem(KIOSK_PIN_KEY) || DEFAULT_KIOSK_PIN; } catch { return DEFAULT_KIOSK_PIN; }
  }, []);

  const setPin = useCallback((newPin: string) => {
    try { localStorage.setItem(KIOSK_PIN_KEY, newPin); } catch {}
  }, []);

  useEffect(() => {
    function onChange() { setIsFullscreen(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (isActive && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, [isActive, isFullscreen]);

  useEffect(() => {
    if (!isActive) return;

    function blockKeys(e: KeyboardEvent) {
      const alwaysBlock = ["F5", "F11"];
      if (alwaysBlock.includes(e.key)) { e.preventDefault(); return; }

      if (e.ctrlKey || e.metaKey) {
        const blocked = ["r", "R", "w", "W", "t", "T", "n", "N", "l", "L"];
        if (blocked.includes(e.key)) { e.preventDefault(); return; }
        if (e.shiftKey && ["n", "N", "t", "T"].includes(e.key)) { e.preventDefault(); return; }
      }

      if (e.altKey) {
        if (e.key === "F4" || e.key === "Left" || e.key === "Right") {
          e.preventDefault(); return;
        }
      }

      if (e.key === "Escape") {
        e.preventDefault(); return;
      }
    }

    function blockPopstate() {
      window.history.pushState(null, "", window.location.href);
    }

    function blockContextMenu(e: MouseEvent) {
      e.preventDefault();
    }

    function blockBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    window.addEventListener("keydown", blockKeys, { capture: true });
    window.addEventListener("popstate", blockPopstate);
    document.addEventListener("contextmenu", blockContextMenu);
    window.addEventListener("beforeunload", blockBeforeUnload);
    window.history.pushState(null, "", window.location.href);

    return () => {
      window.removeEventListener("keydown", blockKeys, { capture: true });
      window.removeEventListener("popstate", blockPopstate);
      document.removeEventListener("contextmenu", blockContextMenu);
      window.removeEventListener("beforeunload", blockBeforeUnload);
    };
  }, [isActive]);

  const enterKioskMode = useCallback(() => {
    try { localStorage.setItem(KIOSK_ACTIVE_KEY, "1"); } catch {}
    setIsActive(true);
    document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  const exitKioskMode = useCallback((pin: string): boolean => {
    if (pin !== getPin()) return false;
    try { localStorage.removeItem(KIOSK_ACTIVE_KEY); } catch {}
    setIsActive(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    return true;
  }, [getPin]);

  return { isActive, isFullscreen, enterKioskMode, exitKioskMode, getPin, setPin };
}
