/**
 * useCart — manages POS cart state and all cart operations.
 *
 * Extracted from pos.tsx so the component stays focused on rendering.
 * Depends on useToast for stock-guard feedback.
 */
import { useState, useCallback, useRef } from "react";
import { nanoid } from "nanoid";
import type { Product } from "@shared/schema";

export type CartItem = {
  cartId: string;
  product: Product;
  quantity: number;
  size?: { name: string; price: string };
  modifiers?: { name: string; price: string }[];
  note?: string;
};

type ToastFn = (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;

export function useCart(toast: ToastFn) {
  const [cart, setCart] = useState<CartItem[]>([]);

  // ── Undo-remove support ──────────────────────────────────────────────────
  const [lastRemoved, setLastRemoved] = useState<{ item: CartItem; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Add a product to the cart, respecting stock limits. */
  const addToCart = useCallback(
    (
      product: Product,
      size?: { name: string; price: string },
      note?: string,
      onAdded?: () => void,
    ) => {
      if (product.trackStock && typeof product.stock === "number") {
        const totalInCart = cart.reduce(
          (sum, i) => (i.product.id === product.id ? sum + i.quantity : sum),
          0,
        );
        if (totalInCart >= product.stock) {
          toast({
            title:
              product.stock === 0
                ? `${product.name} is out of stock`
                : `Only ${product.stock} in stock`,
            description:
              product.stock > 0
                ? `You already have all ${product.stock} unit${product.stock !== 1 ? "s" : ""} in the cart.`
                : undefined,
            variant: "destructive",
          });
          return;
        }
      }

      setCart((prev) => {
        const existing = prev.find(
          (item) =>
            item.product.id === product.id &&
            item.size?.name === size?.name &&
            !note,
        );
        if (existing) {
          return prev.map((item) =>
            item.cartId === existing.cartId
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          );
        }
        return [
          ...prev,
          {
            cartId: nanoid(),
            product,
            quantity: 1,
            size,
            modifiers: [],
            note: note || undefined,
          },
        ];
      });
      onAdded?.();
    },
    [cart, toast],
  );

  /** Increment or decrement a cart-item's quantity, respecting stock limits. */
  const updateQuantity = useCallback(
    (cartId: string, change: number) => {
      if (change > 0) {
        const item = cart.find((i) => i.cartId === cartId);
        if (item && item.product.trackStock && typeof item.product.stock === "number") {
          const totalInCart = cart.reduce(
            (sum, i) => (i.product.id === item.product.id ? sum + i.quantity : sum),
            0,
          );
          if (totalInCart >= item.product.stock) {
            toast({
              title:
                item.product.stock === 0
                  ? `${item.product.name} is out of stock`
                  : `Only ${item.product.stock} in stock`,
              description:
                item.product.stock > 0
                  ? `You already have all ${item.product.stock} unit${item.product.stock !== 1 ? "s" : ""} in the cart.`
                  : undefined,
              variant: "destructive",
            });
            return;
          }
        }
      }
      setCart((prev) =>
        prev
          .map((item) =>
            item.cartId === cartId
              ? { ...item, quantity: item.quantity + change }
              : item,
          )
          .filter((item) => item.quantity > 0),
      );
    },
    [cart, toast],
  );

  /** Remove a cart item — stores it for 5-second undo window. */
  const removeFromCart = useCallback((cartId: string) => {
    setCart((prev) => {
      const index = prev.findIndex((i) => i.cartId === cartId);
      if (index !== -1) {
        const item = prev[index];
        setLastRemoved({ item, index });
        if (undoTimer.current) clearTimeout(undoTimer.current);
        undoTimer.current = setTimeout(() => setLastRemoved(null), 5000);
      }
      return prev.filter((i) => i.cartId !== cartId);
    });
  }, []);

  /** Restore the last removed item within the undo window. */
  const undoLastRemove = useCallback(() => {
    if (!lastRemoved) return;
    setCart((prev) => {
      const next = [...prev];
      next.splice(lastRemoved.index, 0, lastRemoved.item);
      return next;
    });
    setLastRemoved(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, [lastRemoved]);

  /** Update the per-item kitchen note. */
  const updateNote = useCallback((cartId: string, note: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.cartId === cartId ? { ...item, note: note || undefined } : item,
      ),
    );
  }, []);

  /** Replace the entire cart (e.g. after a reorder hand-off). */
  const replaceCart = useCallback((items: CartItem[]) => {
    setCart(items);
  }, []);

  /** Reset the cart to empty. */
  const clearCart = useCallback(() => setCart([]), []);

  const cartCount = cart.reduce((a, b) => a + b.quantity, 0);

  return {
    cart,
    cartCount,
    addToCart,
    updateQuantity,
    removeFromCart,
    undoLastRemove,
    lastRemoved,
    updateNote,
    replaceCart,
    clearCart,
  };
}
