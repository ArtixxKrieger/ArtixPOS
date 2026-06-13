

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

    const subtotal = cart.reduce((acc, item) => {
      const basePrice = parseNumeric(item.size?.price || item.product.price);
      const modsPrice = (item.modifiers ?? []).reduce(
        (sum, m) => sum + parseNumeric(m.price),
        0,
      );
      return acc + (basePrice + modsPrice) * item.quantity;
    }, 0);

const scPwdDiscount = isScPwd ? subtotal * 0.2 : 0;

const effectiveDiscount = isScPwd ? scPwdDiscount : discount;

const discountedSubtotal = Math.max(0, subtotal - effectiveDiscount);
    const discountRatio = subtotal > 0 ? discountedSubtotal / subtotal : 1;

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

const total = discountedSubtotal + tax - loyaltyDiscount;

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
