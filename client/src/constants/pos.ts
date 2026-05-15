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
  { id: "cash",  label: "Cash",  isCash: true  },
  { id: "card",  label: "Card",  isCash: false },
  { id: "gcash", label: "GCash", isCash: false },
  { id: "maya",  label: "Maya",  isCash: false },
] as const;

/**
 * Food-and-beverage sub-types that follow the Starbucks-style "café" flow:
 * walk-in customers are identified only by a name on the receipt (no stored
 * customer record), identical to how café POS systems typically work.
 */
export const CAFE_STYLE_BUSINESS_SUBTYPES = ["cafe", "bakery", "food_truck"] as const;

/**
 * Maximum gap (in milliseconds) between two consecutive keystrokes that still
 * qualifies as a barcode-scanner burst.  Hardware scanners fire characters in
 * < 50 ms intervals; human typing is far slower.
 */
export const BARCODE_BURST_MS = 80;

/**
 * Minimum number of characters required before a keystroke sequence is
 * treated as a barcode scan (prevents false-positives from short inputs).
 */
export const MIN_BARCODE_LENGTH = 6;
