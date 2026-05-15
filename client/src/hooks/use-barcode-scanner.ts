/**
 * useBarcodeScanner — global keyboard listener that detects hardware barcode
 * scanner bursts and triggers a product lookup.
 *
 * Hardware scanners fire characters in very rapid succession (< BARCODE_BURST_MS
 * apart) and terminate with an Enter keystroke.  Human keyboard input is much
 * slower, so the two can be reliably distinguished by timing.
 *
 * The hook attaches one `keydown` listener to `document` and tears it down on
 * unmount — safe to call from any component; multiple instances will each
 * register their own listener (idempotent because each manages its own buffer).
 */
import { useEffect, useRef, useCallback } from "react";
import { BARCODE_BURST_MS, MIN_BARCODE_LENGTH } from "@/constants/pos";

interface BarcodeScannerOptions {
  /**
   * Called with the scanned barcode string when a valid burst is detected.
   * The consumer is responsible for the actual product lookup.
   */
  onScan: (barcode: string) => void;

  /**
   * Called just before onScan so the UI can show a flash / loading indicator.
   * Optional — fires synchronously on the same Enter keydown event.
   */
  onScanStart?: () => void;

  /**
   * Ref to a dedicated barcode <input> element.  When that input has focus the
   * global listener defers to the input's own handler instead of intercepting.
   */
  dedicatedInputRef?: React.RefObject<HTMLInputElement | null>;

  /**
   * When true the listener is disabled (e.g. while a modal is open).
   * The effect re-runs whenever this value changes.
   */
  disabled?: boolean;
}

export function useBarcodeScanner({
  onScan,
  onScanStart,
  dedicatedInputRef,
  disabled = false,
}: BarcodeScannerOptions): void {
  // Stable refs so the effect closure always has the latest callbacks without
  // having to add them to the dependency array (which would re-attach the
  // listener on every render).
  const onScanRef     = useRef(onScan);
  const onScanStartRef = useRef(onScanStart);
  useEffect(() => { onScanRef.current     = onScan; },     [onScan]);
  useEffect(() => { onScanStartRef.current = onScanStart; }, [onScanStart]);

  const attach = useCallback(() => {
    let buffer     = "";
    let lastCharAt = 0;

    function onKeyDown(e: KeyboardEvent) {
      // Defer to the dedicated barcode input if it has focus
      if (
        dedicatedInputRef?.current &&
        document.activeElement === dedicatedInputRef.current
      ) return;

      // Ignore when any dialog/modal is open — prevents ghost scans
      if (document.querySelector('[role="dialog"]')) return;

      const now = Date.now();
      const gap = now - lastCharAt;

      if (e.key === "Enter") {
        if (buffer.length >= MIN_BARCODE_LENGTH) {
          e.preventDefault();
          onScanStartRef.current?.();
          const captured = buffer;
          buffer     = "";
          lastCharAt = 0;
          onScanRef.current(captured);
        }
        return;
      }

      // Ignore non-printable keys
      if (e.key.length !== 1) return;

      // Slow gap after previous char → this is human typing; reset buffer
      if (gap > BARCODE_BURST_MS && buffer.length > 0) {
        buffer = "";
      }

      const activeTag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      const inInput =
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        !!(document.activeElement as HTMLElement | null)?.isContentEditable;

      if (!inInput || gap < BARCODE_BURST_MS) {
        // Either no input focused, or rapid-fire scanner burst
        buffer    += e.key;
        lastCharAt = now;
      } else {
        // Human typing in an input — don't accumulate
        buffer     = "";
        lastCharAt = now;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dedicatedInputRef]); // dedicatedInputRef identity is stable

  useEffect(() => {
    if (disabled) return;
    return attach();
  }, [disabled, attach]);
}
