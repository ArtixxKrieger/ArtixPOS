

import { useEffect, useRef, useCallback } from "react";
import { BARCODE_BURST_MS, MIN_BARCODE_LENGTH, GS1_AIM_PREFIXES } from "@/constants/pos";

interface BarcodeScannerOptions {

onScan: (barcode: string) => void;

onScanStart?: () => void;

dedicatedInputRef?: React.RefObject<HTMLInputElement | null>;

disabled?: boolean;
}

function cleanBarcode(raw: string): string {
  let s = raw;

for (const prefix of GS1_AIM_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }

s = s.replace(/[\x00-\x1F\x7F]/g, "");

  return s.trim();
}

export function useBarcodeScanner({
  onScan,
  onScanStart,
  dedicatedInputRef,
  disabled = false,
}: BarcodeScannerOptions): void {

const onScanRef      = useRef(onScan);
  const onScanStartRef = useRef(onScanStart);
  useEffect(() => { onScanRef.current      = onScan; },      [onScan]);
  useEffect(() => { onScanStartRef.current = onScanStart; }, [onScanStart]);

  const attach = useCallback(() => {
    let buffer     = "";
    let lastCharAt = 0;

    function onKeyDown(e: KeyboardEvent) {

      if (
        dedicatedInputRef?.current &&
        document.activeElement === dedicatedInputRef.current
      ) return;

if (document.querySelector('[role="dialog"]')) return;

      const now = Date.now();
      const gap = now - lastCharAt;

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

          buffer     = "";
          lastCharAt = 0;
        }
        return;
      }

if (e.key === "Escape") {
        buffer     = "";
        lastCharAt = 0;
        return;
      }

if (e.key.length !== 1) return;

if (gap > BARCODE_BURST_MS && buffer.length > 0) {
        buffer = "";
      }

      const activeTag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      const inInput =
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        !!(document.activeElement as HTMLElement | null)?.isContentEditable;

      if (!inInput || gap < BARCODE_BURST_MS) {

buffer    += e.key;
        lastCharAt = now;
      } else {

        buffer     = "";
        lastCharAt = now;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dedicatedInputRef]);

  useEffect(() => {
    if (disabled) return;
    return attach();
  }, [disabled, attach]);
}
