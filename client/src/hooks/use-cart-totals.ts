/**
 * useCartTotals — pure financial calculations for the POS cart.
 *
 * Derived from the subtotal + discount + tax logic that previously lived
 * inline in pos.tsx.  Keeping it here makes the formulas easy to unit-test in
 * isolation and prevents the 1 500-line component from growing further.
 */
import { useMemo } from "react";
import { parseNumeric } from "@/lib/format";
import type { CartItem } from "./use-cart";

interface TotalsInput {
  cart: CartItem[];
  discount: number;
  loyaltyDiscount: number;
  globalTaxRate: number;
  isScPwd: boolean;
}

export function useCartTotals({
  cart,
  discount,
  loyaltyDiscount,
  globalTaxRate,
  isScPwd,
}: TotalsInput) {
  return useMemo(() => {
    // ── Subtotal (before any discount / tax) ─────────────────────────────────
    const subtotal = cart.reduce((acc, item) => {
      const basePrice = parseNumeric(item.size?.price || item.product.price);
      const modsPrice = (item.modifiers ?? []).reduce(
        (sum, m) => sum + parseNumeric(m.price),
        0,
      );
      return acc + (basePrice + modsPrice) * item.quantity;
    }, 0);

    // ── SC/PWD discount: 20% of subtotal ─────────────────────────────────────
    const scPwdDiscount = isScPwd ? subtotal * 0.2 : 0;

    // SC/PWD overrides any manual or coupon discount
    const effectiveDiscount = isScPwd ? scPwdDiscount : discount;

    // ── Discounted subtotal ───────────────────────────────────────────────────
    const discountedSubtotal = Math.max(0, subtotal - effectiveDiscount);
    const discountRatio = subtotal > 0 ? discountedSubtotal / subtotal : 1;

    // ── Tax: zero when SC/PWD (VAT-exempt); otherwise per-product or global ──
    const tax = isScPwd
      ? 0
      : cart.reduce((acc, item) => {
          const basePrice = parseNumeric(item.size?.price || item.product.price);
          const modsPrice = (item.modifiers ?? []).reduce(
            (sum, m) => sum + parseNumeric(m.price),
            0,
          );
          const itemSubtotal = (basePrice + modsPrice) * item.quantity * discountRatio;
          const rate =
            item.product.taxRate != null && item.product.taxRate !== ""
              ? parseNumeric(item.product.taxRate)
              : globalTaxRate;
          return acc + itemSubtotal * (rate / 100);
        }, 0);

    // ── Grand total ───────────────────────────────────────────────────────────
    const total = discountedSubtotal + tax - loyaltyDiscount;

    // ── BIR breakdowns ────────────────────────────────────────────────────────
    const vatableSales = isScPwd ? 0 : discountedSubtotal;
    const vatExemptSales = isScPwd ? discountedSubtotal : 0;

    return {
      subtotal,
      scPwdDiscount,
      effectiveDiscount,
      discountedSubtotal,
      discountRatio,
      tax,
      taxRate: globalTaxRate,
      total,
      vatableSales,
      vatExemptSales,
    };
  }, [cart, discount, loyaltyDiscount, globalTaxRate, isScPwd]);
}
