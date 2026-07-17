

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

  // Keep a ref in sync so stock-check callbacks can always read the latest
  // cart without listing `cart` as a dependency.  Listing `cart` as a dep on
  // addToCart/updateQuantity causes new callback references every time an item
  // is added, which breaks the ProductCard memo() and forces the entire product
  // grid to re-render on every add-to-cart.
  const cartRef = useRef<CartItem[]>(cart);
  cartRef.current = cart;

  const [lastRemoved, setLastRemoved] = useState<{ item: CartItem; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

const addToCart = useCallback(
    (
      product: Product,
      size?: { name: string; price: string },
      note?: string,
      onAdded?: () => void,
    ) => {
      if (product.trackStock && typeof product.stock === "number") {
        const totalInCart = cartRef.current.reduce(
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
    [toast], // cart intentionally omitted — read via cartRef to keep callback stable
  );

const updateQuantity = useCallback(
    (cartId: string, change: number) => {
      if (change > 0) {
        const item = cartRef.current.find((i) => i.cartId === cartId);
        if (item && item.product.trackStock && typeof item.product.stock === "number") {
          const totalInCart = cartRef.current.reduce(
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
    [toast], // cart intentionally omitted — read via cartRef to keep callback stable
  );

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

const updateNote = useCallback((cartId: string, note: string) => {
    setCart((prev) =>
      prev.map((item) =>
        item.cartId === cartId ? { ...item, note: note || undefined } : item,
      ),
    );
  }, []);

const replaceCart = useCallback((items: CartItem[]) => {
    setCart(items);
  }, []);

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
