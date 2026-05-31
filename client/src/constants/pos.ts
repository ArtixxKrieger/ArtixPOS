/**
 * POS constants — single source of truth for magic values used across the
 * point-of-sale feature.  Import from here rather than inlining literals.
 */

/** Default payment methods used when the tenant has not configured custom ones. */
export const DEFAULT_PAYMENT_METHODS: ReadonlyArray<{
  id: string;
  label: string;
  isCash: boolean;
}> = [
  { id: "cash",    label: "Cash",     isCash: true  },
  { id: "card",    label: "Card",     isCash: false },
  { id: "ewallet", label: "E-Wallet", isCash: false },
] as const;

/**
 * Food-and-beverage sub-types that follow the Starbucks-style "café" flow:
 * walk-in customers are identified only by a name on the receipt (no stored
 * customer record), identical to how café POS systems typically work.
 */
export const CAFE_STYLE_BUSINESS_SUBTYPES = ["cafe", "bakery", "food_truck"] as const;

/**
 * Maximum gap (in milliseconds) between two consecutive keystrokes that still
 * qualifies as a barcode-scanner burst.
 *
 * 100 ms covers the full compatibility range:
 *   - Fast laser scanners: 5–20 ms between chars   ✓
 *   - Mid-range CCD/linear: 30–60 ms               ✓
 *   - Slow/cheap USB dongle scanners: up to 90 ms   ✓
 *   - Human typing average: 150–300 ms+             → correctly rejected
 */
export const BARCODE_BURST_MS = 100;

/**
 * Minimum number of characters required before a keystroke sequence is
 * treated as a barcode scan (prevents false-positives from short inputs).
 *
 * Set to 4 to support:
 *   - EAN-8 (8 chars)
 *   - Code 39 short internal codes (4+ chars)
 *   - QR / DataMatrix payloads (variable, usually long)
 *   - UPC-E compressed codes (6-8 chars)
 */
export const MIN_BARCODE_LENGTH = 4;

/**
 * GS1-128 / AIM identifier prefixes that scanners prepend to the barcode data.
 * These are stripped before the barcode is sent to the product-lookup API.
 * Reference: https://www.gs1.org/services/verified-by-gs1/symbology-identifiers
 */
export const GS1_AIM_PREFIXES: ReadonlyArray<string> = [
  "]C1",  // GS1-128
  "]C0",  // Code 128
  "]E0",  // EAN-13 / UPC-A
  "]E1",  // EAN-13 + supplement
  "]E2",  // EAN-8
  "]E3",  // EAN-8 + supplement
  "]e0",  // EAN-UCC composite
  "]d1",  // Data Matrix
  "]d2",  // Data Matrix GS1
  "]Q1",  // QR Code
  "]Q3",  // QR Code GS1
  "]I1",  // ITF (Interleaved 2 of 5)
  "]A0",  // Code 39
  "]A1",  // Code 39 full ASCII
  "]F1",  // Codabar
  "]G0",  // Code 93
];
