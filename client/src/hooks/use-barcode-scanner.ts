/**
 * useBarcodeScanner — global keyboard listener that detects hardware barcode
 * scanner bursts and triggers a product lookup.
 *
 * ── How it works ────────────────────────────────────────────────────────────
 * Hardware USB/wireless scanners operate in HID keyboard-emulation mode: they
 * fire every character of the barcode in very rapid succession (typically 5–90 ms
 * apart depending on scanner quality) and terminate with a configurable suffix
 * key — most commonly Enter (default), but Tab and CR are also common.
 *
 * Human keyboard input averages 150–300 ms between keystrokes, so the two can
 * be reliably distinguished purely by timing.
 *
 * ── Compatibility ───────────────────────────────────────────────────────────
 * ✓ Any USB HID scanner (Zebra, Honeywell, Symbol, Datalogic, Newland, etc.)
 * ✓ Wireless 2.4 GHz dongle scanners
 * ✓ Bluetooth HID scanners
 * ✓ Enter-suffix scanners (most common factory default)
 * ✓ Tab-suffix scanners (Zebra / Honeywell alternative default)
 * ✓ CR-suffix scanners (\r)
 * ✓ GS1-128, EAN-13, EAN-8, Code 128, Code 39, QR, Data Matrix barcodes
 * ✓ Scanners that prepend AIM identifier prefixes (]C1, ]E0, etc.)
 * ✓ Scanners that emit GS (ASCII 29 / \x1D) as GS1 Application Identifier separator
 *
 * ── Dedicated barcode input ─────────────────────────────────────────────────
 * The POS also renders a <input ref={barcodeRef} /> that the scanner can type
 * into directly.  When that input is focused, this global listener defers to
 * the input's own onKeyDown handler to avoid double-processing.
 */
import { useEffect, useRef, useCallback } from "react";
import { BARCODE_BURST_MS, MIN_BARCODE_LENGTH, GS1_AIM_PREFIXES } from "@/constants/pos";

interface BarcodeScannerOptions {
  /**
   * Called with the cleaned barcode string when a valid burst is detected.
   * GS1 AIM prefixes and ASCII control characters are already stripped.
   */
  onScan: (barcode: string) => void;

  /**
   * Called just before onScan so the UI can show a flash / loading indicator.
   * Optional — fires synchronously on the same terminator keydown event.
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

/**
 * Strip GS1 AIM identifier prefixes (e.g. ]C1, ]E0) and any ASCII control
 * characters (including GS \x1D used as GS1 Application Identifier separator).
 * Returns the cleaned barcode string.
 */
function cleanBarcode(raw: string): string {
  let s = raw;

  // Strip leading AIM identifier prefix (up to 3 chars: ] + letter + digit)
  for (const prefix of GS1_AIM_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }

  // Remove any remaining ASCII control characters (incl. GS \x1D, STX \x02, ETX \x03, etc.)
  // but keep printable ASCII and common Unicode
  s = s.replace(/[\x00-\x1F\x7F]/g, "");

  return s.trim();
}

export function useBarcodeScanner({
  onScan,
  onScanStart,
  dedicatedInputRef,
  disabled = false,
}: BarcodeScannerOptions): void {
  // Stable refs so the effect closure always has the latest callbacks without
  // adding them to the dependency array (which would re-attach the listener on
  // every render).
  const onScanRef      = useRef(onScan);
  const onScanStartRef = useRef(onScanStart);
  useEffect(() => { onScanRef.current      = onScan; },      [onScan]);
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

      // Ignore when any dialog/modal is open (prevent ghost scans into forms)
      if (document.querySelector('[role="dialog"]')) return;

      const now = Date.now();
      const gap = now - lastCharAt;

      // ── Terminator key: Enter, Tab, or CR ─────────────────────────────────
      // Virtually all scanners end with one of these.  Tab is the alternative
      // default on many Zebra and Honeywell models.
      const isTerminator = e.key === "Enter" || e.key === "Tab" || e.key === "\r";
      if (isTerminator) {
        if (buffer.length >= MIN_BARCODE_LENGTH) {
          e.preventDefault();
          const raw     = buffer;
          buffer        = "";
          lastCharAt    = 0;
          const cleaned = cleanBarcode(raw);
          if (cleaned.length >= MIN_BARCODE_LENGTH) {
            onScanStartRef.current?.();
            onScanRef.current(cleaned);
          }
        } else {
          // Short buffer — not a barcode, reset and let the key propagate
          buffer     = "";
          lastCharAt = 0;
        }
        return;
      }

      // ── Escape: clear buffer (abort a partial scan) ────────────────────────
      if (e.key === "Escape") {
        buffer     = "";
        lastCharAt = 0;
        return;
      }

      // ── Ignore non-printable / modifier keys ──────────────────────────────
      // e.key.length > 1 means it's a named key like "ArrowUp", "Shift", etc.
      if (e.key.length !== 1) return;

      // ── Slow gap: human is typing, not a scanner burst ────────────────────
      if (gap > BARCODE_BURST_MS && buffer.length > 0) {
        buffer = "";
      }

      const activeTag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      const inInput =
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        !!(document.activeElement as HTMLElement | null)?.isContentEditable;

      if (!inInput || gap < BARCODE_BURST_MS) {
        // Either: no input focused (scanner typing into void), OR
        // rapid-fire burst even though an input is focused (scanner in input field)
        buffer    += e.key;
        lastCharAt = now;
      } else {
        // Human typing into an input — don't accumulate scanner buffer
        buffer     = "";
        lastCharAt = now;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dedicatedInputRef]); // dedicatedInputRef identity is stable after mount

  useEffect(() => {
    if (disabled) return;
    return attach();
  }, [disabled, attach]);
}
