import { useState, useEffect, useCallback, useRef } from "react";

const KIOSK_ENABLED_KEY   = "artixpos_kiosk_enabled";
const KIOSK_PIN_KEY       = "artixpos_kiosk_pin";
const KIOSK_IDLE_KEY      = "artixpos_kiosk_idle_mins";

export const DEFAULT_KIOSK_PIN  = "1234";
export const DEFAULT_IDLE_MINS  = 5;

function readEnabled()  { try { return localStorage.getItem(KIOSK_ENABLED_KEY) === "1"; } catch { return false; } }
function readIdleMins() { try { return parseInt(localStorage.getItem(KIOSK_IDLE_KEY) || String(DEFAULT_IDLE_MINS), 10) || DEFAULT_IDLE_MINS; } catch { return DEFAULT_IDLE_MINS; } }

export function useKioskMode() {
  const [isEnabled, setIsEnabled] = useState<boolean>(readEnabled);
  // Always start locked when kiosk is enabled (covers page-refresh case)
  const [isLocked, setIsLocked] = useState<boolean>(readEnabled);
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getPin      = useCallback((): string => { try { return localStorage.getItem(KIOSK_PIN_KEY) || DEFAULT_KIOSK_PIN; } catch { return DEFAULT_KIOSK_PIN; } }, []);
  const setPin      = useCallback((p: string) => { try { localStorage.setItem(KIOSK_PIN_KEY, p); } catch {} }, []);
  const getIdleMins = useCallback((): number  => readIdleMins(), []);
  const setIdleMins = useCallback((m: number) => { try { localStorage.setItem(KIOSK_IDLE_KEY, String(m)); } catch {} }, []);

  // ── Lock immediately ───────────────────────────────────────────────────────
  const lock = useCallback(() => { setIsLocked(true); }, []);

  // ── Fullscreen change listener ─────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── Idle timer + visibility auto-lock (only when enabled AND unlocked) ─────
  useEffect(() => {
    if (!isEnabled || isLocked) return;

    const idleMs = getIdleMins() * 60 * 1000;

    const resetIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(lock, idleMs);
    };

    const onVisibilityChange = () => { if (document.hidden) lock(); };

    resetIdle();

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"] as const;
    events.forEach(ev => window.addEventListener(ev, resetIdle, { passive: true }));
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach(ev => window.removeEventListener(ev, resetIdle));
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isEnabled, isLocked, lock, getIdleMins]);

  // ── Keyboard / navigation blocking (when kiosk enabled, locked or not) ─────
  useEffect(() => {
    if (!isEnabled) return;

    const blockKeys = (e: KeyboardEvent) => {
      if (["F5", "F11"].includes(e.key)) { e.preventDefault(); return; }
      if (e.ctrlKey || e.metaKey) {
        if (["r","R","w","W","t","T","n","N","l","L"].includes(e.key)) { e.preventDefault(); return; }
        if (e.shiftKey && ["n","N","t","T"].includes(e.key)) { e.preventDefault(); return; }
      }
      if (e.altKey && ["F4","Left","Right"].includes(e.key)) { e.preventDefault(); return; }
      if (e.key === "Escape") { e.preventDefault(); return; }
    };

    const blockPopstate    = () => window.history.pushState(null, "", window.location.href);
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();
    const blockUnload      = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };

    window.addEventListener("keydown", blockKeys, { capture: true });
    window.addEventListener("popstate", blockPopstate);
    document.addEventListener("contextmenu", blockContextMenu);
    window.addEventListener("beforeunload", blockUnload);
    window.history.pushState(null, "", window.location.href);

    return () => {
      window.removeEventListener("keydown", blockKeys, { capture: true });
      window.removeEventListener("popstate", blockPopstate);
      document.removeEventListener("contextmenu", blockContextMenu);
      window.removeEventListener("beforeunload", blockUnload);
    };
  }, [isEnabled]);

  // ── Public actions ─────────────────────────────────────────────────────────

  /** Enable kiosk mode and lock immediately. */
  const enterKioskMode = useCallback(() => {
    try { localStorage.setItem(KIOSK_ENABLED_KEY, "1"); } catch {}
    setIsEnabled(true);
    setIsLocked(true);
  }, []);

  /** Validate PIN → unlock screen, kiosk mode stays enabled. */
  const unlock = useCallback((pin: string): boolean => {
    if (pin !== getPin()) return false;
    setIsLocked(false);
    return true;
  }, [getPin]);

  /** Unlock without PIN check — used after successful staff PIN auth. */
  const forceUnlock = useCallback(() => {
    setIsLocked(false);
  }, []);

  /** Fully disable kiosk without PIN check — used after server-verified manager PIN. */
  const forceDisableKiosk = useCallback(() => {
    try { localStorage.removeItem(KIOSK_ENABLED_KEY); } catch {}
    setIsEnabled(false);
    setIsLocked(false);
  }, []);

  /** Validate PIN → fully disable kiosk mode. */
  const disableKioskMode = useCallback((pin: string): boolean => {
    if (pin !== getPin()) return false;
    try { localStorage.removeItem(KIOSK_ENABLED_KEY); } catch {}
    setIsEnabled(false);
    setIsLocked(false);
    return true;
  }, [getPin]);

  /** Fullscreen toggle — independent of kiosk lock. */
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  // Legacy alias so Settings page (which calls exitKioskMode) still works
  const exitKioskMode = disableKioskMode;

  return {
    isEnabled, isLocked, isFullscreen,
    enterKioskMode, lock, unlock, forceUnlock, forceDisableKiosk, disableKioskMode, exitKioskMode,
    toggleFullscreen,
    getPin, setPin,
    getIdleMins, setIdleMins,
    // Legacy aliases
    isActive: isEnabled,
  };
}
