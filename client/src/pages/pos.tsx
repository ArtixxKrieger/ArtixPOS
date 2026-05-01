import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useProducts } from "@/hooks/use-products";
import { useSettings } from "@/hooks/use-settings";
import { useCreatePendingOrder } from "@/hooks/use-pending-orders";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { queueMutation, isNetworkError } from "@/lib/offline-db";
import { type Product, type Customer } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, ShoppingCart, Plus, Minus, Trash2, Tag, Package, ChevronRight, NotebookPen, UserCircle2, X, CheckCircle2, Percent, Barcode, Star, Delete } from "lucide-react";
import { getBusinessFeatures } from "@/lib/business-features";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ReceiptModal } from "@/components/receipt-modal";
import type { ReceiptData } from "@/components/receipt-modal";

const DEFAULT_PAYMENT_METHODS = [
  { id: "cash", label: "Cash", isCash: true },
  { id: "card", label: "Card", isCash: false },
  { id: "gcash", label: "GCash", isCash: false },
  { id: "maya", label: "Maya", isCash: false },
];

function getQuickAmounts(total: number): number[] {
  const units = [5, 10, 20, 50, 100, 200, 500, 1000];
  const results: number[] = [];
  for (const unit of units) {
    const rounded = Math.ceil(total / unit) * unit;
    if (rounded > total && !results.includes(rounded) && results.length < 4) {
      results.push(rounded);
    }
  }
  return results;
}

type CartItem = {
  cartId: string;
  product: Product;
  quantity: number;
  size?: { name: string; price: string };
  modifiers?: { name: string; price: string }[];
  note?: string;
};

export default function POS() {
  const { data: products = [], isLoading } = useProducts();
  const { data: settings } = useSettings();
  const createPending = useCreatePendingOrder();
  const { toast } = useToast();

  const { showBarcode } = getBusinessFeatures(
    (settings as any)?.businessType,
    (settings as any)?.businessSubType,
  );

  // Cafe-style businesses (cafe, bakery, food truck) operate Starbucks-style:
  // walk-in customers aren't stored — only a name on the receipt.
  const businessSubType = (settings as any)?.businessSubType;
  const isCafeStyle =
    (settings as any)?.businessType === "food_beverage" &&
    ["cafe", "bakery", "food_truck"].includes(businessSubType);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [category, setCategory] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [cartOpen, setCartOpen] = useState(false);
  const [receiptName, setReceiptName] = useState<string>("");
  const [tip, setTip] = useState<number>(0);
  const [issueWifi, setIssueWifi] = useState<boolean>(false);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [tempSize, setTempSize] = useState<{ name: string; price: string } | null>(null);
  const [tempNote, setTempNote] = useState("");

  const paymentInputRef = useRef<HTMLInputElement>(null);
  const [isPaymentFocused, setIsPaymentFocused] = useState(false);
  const [showNumpad, setShowNumpad] = useState(false);

  // Customer selection
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  // Discount code
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [appliedCode, setAppliedCode] = useState<{ code: string; discountAmount: number; type: string } | null>(null);

  // Barcode scanner
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanFlash, setScanFlash] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const barcodeLookupMutation = useMutation({
    mutationFn: (barcode: string) => apiRequest("GET", `/api/products/barcode/${encodeURIComponent(barcode)}`).then(r => r.json()),
    onSuccess: (product: Product) => {
      handleProductClick(product);
      setBarcodeInput("");
      toast({ title: `Added: ${product.name}` });
    },
    onError: () => {
      setBarcodeInput("");
      toast({ title: "Product not found for this barcode", variant: "destructive" });
    },
  });

  const handleBarcodeKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && barcodeInput.trim()) {
      barcodeLookupMutation.mutate(barcodeInput.trim());
    }
  }, [barcodeInput]);

  // Global barcode scanner listener — works even when no input is focused.
  // Hardware scanners fire characters very rapidly (< 50 ms apart) and end with Enter.
  useEffect(() => {
    let buffer = "";
    let lastCharTime = 0;
    const BURST_MS = 50;   // max gap between scanner keystrokes
    const MIN_LEN  = 4;    // minimum barcode length

    function onGlobalKeyDown(e: KeyboardEvent) {
      // If the dedicated barcode input has focus, let its own handler deal with it
      if (barcodeRef.current && document.activeElement === barcodeRef.current) return;

      const now = Date.now();
      const gap = now - lastCharTime;

      if (e.key === "Enter") {
        if (buffer.length >= MIN_LEN) {
          e.preventDefault();
          setScanFlash(true);
          barcodeLookupMutation.mutate(buffer);
          buffer = "";
          lastCharTime = 0;
          setTimeout(() => setScanFlash(false), 800);
        }
        return;
      }

      // Only track printable characters
      if (e.key.length !== 1) return;

      // If chars arrive slowly (human typing), reset and don't accumulate
      if (gap > BURST_MS && buffer.length > 0) {
        buffer = "";
      }

      const activeTag = (document.activeElement as HTMLElement)?.tagName ?? "";
      const inInput = activeTag === "INPUT" || activeTag === "TEXTAREA"
        || !!(document.activeElement as HTMLElement)?.isContentEditable;

      // Buffer if: no input is focused, OR chars are coming in at scanner speed
      if (!inInput || gap < BURST_MS) {
        buffer += e.key;
        lastCharTime = now;
      } else {
        // Human typing in an input — reset
        buffer = "";
        lastCharTime = now;
      }
    }

    document.addEventListener("keydown", onGlobalKeyDown);
    return () => document.removeEventListener("keydown", onGlobalKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Receipt
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  // Loyalty points
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);
  const loyaltyRedemptionRate = parseNumeric(settings?.loyaltyRedemptionRate || "100"); // pts per currency unit
  const loyaltyDiscount = selectedCustomer && loyaltyPointsToRedeem > 0
    ? loyaltyPointsToRedeem / loyaltyRedemptionRate
    : 0;
  const validateDiscountMutation = useMutation({
    mutationFn: (params: { code: string; orderTotal: number }) =>
      apiRequest("POST", "/api/discount-codes/validate", params).then(r => r.json()),
    onSuccess: (data: any) => {
      setAppliedCode({ code: data.code, discountAmount: data.discountAmount, type: data.type });
      setDiscount(data.discountAmount);
      toast({ title: `Code applied: ${data.discountAmount > 0 ? formatCurrency(data.discountAmount, currency) + " off" : ""}` });
    },
    onError: async (err: any) => {
      const msg = await (err?.response?.json?.().then((d: any) => d.message).catch(() => null));
      toast({ title: msg || "Invalid discount code" });
    },
  });


  const paymentMethods: { id: string; label: string; isCash: boolean }[] =
    (settings as any)?.paymentMethods?.length ? (settings as any).paymentMethods : DEFAULT_PAYMENT_METHODS;
  const selectedPaymentDef = paymentMethods.find(m => m.id === paymentMethod) ?? paymentMethods[0];
  const isCashPayment = selectedPaymentDef?.isCash ?? false;
  const currency = settings?.currency || "₱";

  const updateQuantity = (cartId: string, change: number) => {
    setCart(prev =>
      prev
        .map(item =>
          item.cartId === cartId
            ? { ...item, quantity: item.quantity + change }
            : item
        )
        .filter(item => item.quantity > 0)
    );
  };

  const removeFromCart = (cartId: string) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || "General"));
    return ["all", ...Array.from(cats)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchCat = category === "all" || p.category === category;
      return matchSearch && matchCat;
    });
  }, [products, debouncedSearch, category]);

  const addToCart = (product: Product, size?: { name: string; price: string }, note?: string) => {
    setCart(prev => {
      const existing = prev.find(item =>
        item.product.id === product.id &&
        item.size?.name === size?.name &&
        !note
      );
      if (existing) {
        return prev.map(item =>
          item.cartId === existing.cartId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        cartId: Math.random().toString(36),
        product,
        quantity: 1,
        size,
        modifiers: [],
        note: note || undefined,
      }];
    });
    setSelectedProduct(null);
    setTempSize(null);
    setTempNote("");
  };

  const updateNote = (cartId: string, note: string) => {
    setCart(prev => prev.map(item =>
      item.cartId === cartId ? { ...item, note: note || undefined } : item
    ));
  };

  const handleProductClick = (product: Product) => {
    if (product.sizes && product.sizes.length > 0) {
      setSelectedProduct(product);
      setTempSize(product.sizes?.[0] || null);
    } else {
      addToCart(product);
    }
  };

  const subtotal = cart.reduce((acc, item) => {
    const basePrice = parseNumeric(item.size?.price || item.product.price);
    const modsPrice = (item.modifiers || []).reduce((sum, m) => sum + parseNumeric(m.price), 0);
    return acc + (basePrice + modsPrice) * item.quantity;
  }, 0);

  const maxRedeemablePoints = selectedCustomer
    ? Math.min(selectedCustomer.loyaltyPoints ?? 0, Math.floor(subtotal * loyaltyRedemptionRate))
    : 0;

  const globalTaxRate = parseNumeric(settings?.taxRate || 0);
  // Apply discount to subtotal BEFORE calculating tax (correct standard behaviour)
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const discountRatio = subtotal > 0 ? discountedSubtotal / subtotal : 1;
  // Per-product tax rate: use product's taxRate if set, else global rate — applied on discounted amount
  const tax = cart.reduce((acc, item) => {
    const basePrice = parseNumeric(item.size?.price || item.product.price);
    const modsPrice = (item.modifiers || []).reduce((sum, m) => sum + parseNumeric(m.price), 0);
    const itemSubtotal = (basePrice + modsPrice) * item.quantity * discountRatio;
    const rate = item.product.taxRate != null && item.product.taxRate !== ""
      ? parseNumeric(item.product.taxRate)
      : globalTaxRate;
    return acc + itemSubtotal * (rate / 100);
  }, 0);
  const taxRate = globalTaxRate; // kept for display purposes
  const total = discountedSubtotal + tax - loyaltyDiscount + tip;
  const cartCount = cart.reduce((a, b) => a + b.quantity, 0);
  const quickAmounts = useMemo(() => getQuickAmounts(total), [total]);

  const numericPayment = isCashPayment ? parseNumeric(paymentAmount || "0") : total;
  const changeAmount = isCashPayment ? Math.max(0, numericPayment - total) : 0;

  useEffect(() => {
    if (!isCashPayment) setPaymentAmount(total.toString());
  }, [isCashPayment, total]);

  // ── Reorder hand-off from AI page ──────────────────────────────────────────
  // The AI's "Reorder" button stashes a payload in sessionStorage then routes
  // here. We pick it up once, populate the cart + selected customer, then
  // clear the key so a refresh doesn't re-apply it.
  const reorderConsumedRef = useRef(false);
  useEffect(() => {
    if (reorderConsumedRef.current) return;
    if (products.length === 0) return; // wait for products so we can refresh stale entries
    let raw: string | null = null;
    try { raw = sessionStorage.getItem("pos:reorder"); } catch { return; }
    if (!raw) return;
    reorderConsumedRef.current = true;
    try { sessionStorage.removeItem("pos:reorder"); } catch {}

    let payload: { customerId?: number; customerName?: string; items?: any[] } | null = null;
    try { payload = JSON.parse(raw); } catch { return; }
    if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) return;

    const productById = new Map(products.map(p => [p.id, p]));
    const productByName = new Map(products.map(p => [p.name.toLowerCase(), p]));

    const restored: CartItem[] = [];
    let missing = 0;
    for (const it of payload.items) {
      const stored = it?.product ?? {};
      // Prefer the live product (current price/stock) over the snapshot.
      const live =
        (stored.id != null && productById.get(stored.id)) ||
        (stored.name && productByName.get(String(stored.name).toLowerCase())) ||
        null;
      const productToUse: Product | null = live ?? (stored.id && stored.name && stored.price ? stored as Product : null);
      if (!productToUse) { missing++; continue; }
      restored.push({
        cartId: Math.random().toString(36),
        product: productToUse,
        quantity: Math.max(1, Number(it?.quantity) || 1),
        size: it?.size && it.size.name ? { name: String(it.size.name), price: String(it.size.price ?? "0") } : undefined,
        modifiers: Array.isArray(it?.modifiers)
          ? it.modifiers.map((m: any) => ({ name: String(m?.name ?? ""), price: String(m?.price ?? "0") })).filter((m: any) => m.name)
          : [],
        note: it?.note ? String(it.note) : undefined,
      });
    }

    if (restored.length === 0) {
      toast({
        title: "Couldn't reorder",
        description: "None of those items still exist in your menu.",
        variant: "destructive",
      });
      return;
    }

    setCart(restored);

    if (payload.customerId != null) {
      const c = customers.find(x => x.id === payload!.customerId) ?? null;
      if (c) setSelectedCustomer(c);
    }

    setCartOpen(true);
    toast({
      title: `Reorder loaded${payload.customerName ? ` for ${payload.customerName}` : ""}`,
      description:
        missing > 0
          ? `${restored.length} item${restored.length !== 1 ? "s" : ""} added — ${missing} not in current menu.`
          : `${restored.length} item${restored.length !== 1 ? "s" : ""} ready to checkout.`,
    });
  }, [products, customers, toast]);

  useEffect(() => {
    if (isCashPayment && isPaymentFocused && paymentInputRef.current) {
      paymentInputRef.current.focus({ preventScroll: true });
    }
  }, [cart, discount, isCashPayment]);

  const handleCheckout = () => {
    if (cart.length === 0) return;
    const actualTotal = Math.max(0, total);

    // Validate cash payment covers the total
    if (isCashPayment && numericPayment < actualTotal) {
      toast({
        title: "Insufficient payment amount",
        description: `Please enter at least ${formatCurrency(actualTotal, currency)}.`,
        variant: "destructive",
      });
      return;
    }

    const loyaltyPointsPerUnit = parseNumeric(settings?.loyaltyPointsPerUnit || "1");
    const pointsEarned = Math.floor(subtotal * loyaltyPointsPerUnit);
    const orderData = {
      items: cart,
      subtotal: subtotal.toString(),
      tax: tax.toString(),
      discount: discount.toString(),
      discountCode: appliedCode?.code ?? null,
      loyaltyDiscount: loyaltyDiscount.toString(),
      tip: tip.toString(),
      total: actualTotal.toString(),
      paymentAmount: numericPayment.toString(),
      changeAmount: changeAmount.toString(),
      status: !isCashPayment || numericPayment >= actualTotal ? "paid" : "unpaid",
      paymentMethod,
      customerId: selectedCustomer?.id ?? null,
      customerName: !selectedCustomer && receiptName.trim() ? receiptName.trim() : null,
      loyaltyPointsUsed: loyaltyPointsToRedeem,
      loyaltyPointsEarned: selectedCustomer ? pointsEarned : 0,
    };

    const snapshotCustomer = selectedCustomer;

    const snapshotName = !selectedCustomer && receiptName.trim() ? receiptName.trim() : undefined;
    const snapshotTip = tip;
    const snapshotIssueWifi = issueWifi;
    const wifiSsid = (settings as any)?.wifiSsid as string | undefined;
    const wifiPassword = (settings as any)?.wifiPassword as string | undefined;
    const wifiDuration = parseNumeric((settings as any)?.wifiDurationMinutes ?? 60) || 60;

    createPending.mutate(orderData, {
      onSuccess: async () => {
        // Award/deduct loyalty points — queue offline if network unavailable
        if (snapshotCustomer) {
          const netDelta = pointsEarned - loyaltyPointsToRedeem;
          if (netDelta !== 0) {
            apiRequest("POST", `/api/customers/${snapshotCustomer.id}/loyalty`, { delta: netDelta })
              .catch((err) => {
                if (isNetworkError(err)) {
                  queueMutation("POST", `/api/customers/${snapshotCustomer.id}/loyalty`, { delta: netDelta }, "loyalty");
                } else {
                  toast({
                    title: "Loyalty points sync failed",
                    description: "Order was saved but loyalty points may not have updated. Please check manually.",
                    variant: "destructive",
                  });
                }
              });
          }
          queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        }

        // Optionally issue a free wifi voucher
        let wifiVoucher: ReceiptData["wifiVoucher"] = undefined;
        if (snapshotIssueWifi && (wifiSsid || wifiPassword)) {
          try {
            const res = await apiRequest("POST", "/api/wifi-vouchers", {
              durationMinutes: wifiDuration,
              customerName: snapshotName ?? snapshotCustomer?.name ?? null,
            });
            const v = await res.json();
            wifiVoucher = {
              code: v.code,
              durationMinutes: v.durationMinutes ?? wifiDuration,
              ssid: wifiSsid,
              password: wifiPassword,
            };
          } catch (e) {
            console.error("Failed to issue wifi voucher:", e);
          }
        }

        // Build receipt data and show receipt modal
        const receipt: ReceiptData = {
          items: cart,
          subtotal,
          tax,
          discount,
          loyaltyDiscount,
          tip: snapshotTip,
          total: actualTotal,
          paymentMethod,
          paymentAmount: numericPayment,
          changeAmount,
          customerName: snapshotCustomer?.name ?? snapshotName,
          storeName: (settings as any)?.storeName,
          receiptFooter: (settings as any)?.receiptFooter,
          currency,
          taxRate: globalTaxRate,
          discountCode: appliedCode?.code ?? null,
          loyaltyPointsEarned: snapshotCustomer && pointsEarned > 0 ? pointsEarned : undefined,
          wifiVoucher,
        };
        setReceiptData(receipt);
        setShowReceipt(true);

        setCart([]);
        setDiscount(0);
        setAppliedCode(null);
        setDiscountCodeInput("");
        setSelectedCustomer(null);
        setLoyaltyPointsToRedeem(0);
        setPaymentAmount("");
        setReceiptName("");
        setTip(0);
        setIssueWifi(false);
        setCartOpen(false);
      },
      onError: () => {
        toast({ title: "Failed to place order", description: "Something went wrong. Please try again.", variant: "destructive" });
      },
    });
  };

  const filteredCustomers = customers.filter(c =>
    customerSearch
      ? c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        (c.phone && c.phone.includes(customerSearch))
      : true
  ).slice(0, 8);

  const CartContent = (
    <div className="flex flex-col h-full">
      {/* Items */}
      <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-hide">
        {cart.length === 0 ? (
          <div className="h-full min-h-[120px] flex flex-col items-center justify-center text-muted-foreground/50 gap-2">
            <ShoppingCart className="h-10 w-10" strokeWidth={1.2} />
            <p className="text-xs font-medium">Cart is empty — tap a product</p>
          </div>
        ) : (
          cart.map((item) => {
            const itemPrice = parseNumeric(item.size?.price || item.product.price) +
              (item.modifiers || []).reduce((sum, m) => sum + parseNumeric(m.price), 0);
            return (
              <div
                key={item.cartId}
                className="flex items-center gap-2 px-2.5 py-1.5 bg-secondary/50 dark:bg-secondary/30 rounded-xl border border-border/30 item-enter"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-xs leading-tight truncate">
                    {item.product.name}
                    {item.size && (
                      <span className="ml-1 text-[9px] font-medium text-muted-foreground bg-secondary px-1 py-0.5 rounded">
                        {item.size.name}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-primary font-bold text-xs tabular-nums">
                      {formatCurrency(itemPrice, currency)}
                    </p>
                    <NotebookPen className="h-2.5 w-2.5 text-muted-foreground/30 shrink-0" />
                    <input
                      type="text"
                      value={item.note || ""}
                      onChange={(e) => updateNote(item.cartId, e.target.value)}
                      placeholder="Note..."
                      className="flex-1 text-[10px] bg-transparent border-none outline-none text-muted-foreground placeholder:text-muted-foreground/30 font-medium min-w-0"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <div className="flex items-center bg-background/80 dark:bg-background/40 rounded-lg border border-border/40 overflow-hidden">
                    <button
                      className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all"
                      onClick={() => updateQuantity(item.cartId, -1)}
                      aria-label={`Decrease quantity of ${item.product.name}`}
                      data-testid={`button-decrease-${item.cartId}`}
                    >
                      <Minus className="h-2.5 w-2.5" />
                    </button>
                    <span className="w-5 text-center text-xs font-bold tabular-nums">{item.quantity}</span>
                    <button
                      className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all"
                      onClick={() => updateQuantity(item.cartId, 1)}
                      aria-label={`Increase quantity of ${item.product.name}`}
                      data-testid={`button-increase-${item.cartId}`}
                    >
                      <Plus className="h-2.5 w-2.5" />
                    </button>
                  </div>
                  <button
                    className="h-6 w-6 flex items-center justify-center text-destructive/50 hover:text-destructive active:scale-90 transition-all"
                    onClick={() => removeFromCart(item.cartId)}
                    aria-label={`Remove ${item.product.name} from cart`}
                    data-testid={`button-remove-${item.cartId}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary */}
      <div className="pt-2 border-t border-border/50 space-y-1.5 shrink-0">

        {/* Customer Selector — hidden for cafe-style businesses (Starbucks-style: name on receipt only) */}
        {!isCafeStyle && (selectedCustomer ? (
          <div className="flex items-center gap-2 bg-primary/8 rounded-xl px-2.5 py-1.5 border border-primary/15">
            <UserCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold leading-none truncate">{selectedCustomer.name}</p>
              {selectedCustomer.phone && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{selectedCustomer.phone}</p>
              )}
            </div>
            <button onClick={() => setSelectedCustomer(null)} className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCustomerPicker(true)}
            className="w-full flex items-center gap-2 text-xs text-muted-foreground/60 hover:text-foreground bg-secondary/40 rounded-xl px-3 py-1.5 border border-border/40 hover:border-border transition-all"
            data-testid="button-select-customer"
          >
            <UserCircle2 className="h-3.5 w-3.5" />
            <span>Add Customer (optional)</span>
          </button>
        ))}

        {/* Receipt name (Starbucks-style) — not stored as a customer */}
        {!selectedCustomer && (
          <Input
            type="text"
            value={receiptName}
            onChange={(e) => setReceiptName(e.target.value.slice(0, 40))}
            placeholder="Name on receipt (optional)"
            className="h-8 rounded-xl bg-secondary/60 border-none text-xs"
            data-testid="input-receipt-name"
          />
        )}

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
        </div>
        {taxRate > 0 && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>VAT ({taxRate}%)</span>
            <span className="tabular-nums">{formatCurrency(tax, currency)}</span>
          </div>
        )}

        {/* Discount Code */}
        {appliedCode ? (
          <div className="flex items-center justify-between gap-2 bg-rose-500/8 rounded-xl px-2.5 py-1.5 border border-rose-500/15">
            <div className="flex items-center gap-1.5 min-w-0">
              <CheckCircle2 className="h-3 w-3 text-rose-500 shrink-0" />
              <code className="text-[11px] font-mono font-bold text-rose-600 dark:text-rose-400">{appliedCode.code}</code>
              <span className="text-[11px] text-rose-500/70">-{formatCurrency(appliedCode.discountAmount, currency)}</span>
            </div>
            <button
              onClick={() => { setAppliedCode(null); setDiscount(0); setDiscountCodeInput(""); }}
              className="text-muted-foreground/40 hover:text-destructive shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <div className="flex-1 relative">
              <Percent className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
              <input
                type="text"
                value={discountCodeInput}
                onChange={e => setDiscountCodeInput(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === "Enter" && discountCodeInput.trim()) {
                    validateDiscountMutation.mutate({ code: discountCodeInput.trim(), orderTotal: subtotal });
                  }
                }}
                placeholder="Discount code"
                className="w-full h-8 rounded-xl bg-secondary/60 border border-border/40 pl-7 pr-2 text-[11px] font-mono font-semibold uppercase outline-none focus:border-primary/40 transition-colors"
                data-testid="input-discount-code-pos"
              />
            </div>
            <button
              onClick={() => {
                if (discountCodeInput.trim()) {
                  validateDiscountMutation.mutate({ code: discountCodeInput.trim(), orderTotal: subtotal });
                }
              }}
              disabled={!discountCodeInput.trim() || validateDiscountMutation.isPending}
              className="h-8 px-2.5 rounded-xl bg-primary/10 text-primary text-[11px] font-bold border border-primary/20 hover:bg-primary/20 transition-all disabled:opacity-40"
              data-testid="button-apply-discount-code"
            >
              {validateDiscountMutation.isPending ? "..." : "Apply"}
            </button>
          </div>
        )}

        {/* Manual discount (only if no code applied) */}
        {!appliedCode && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium flex items-center gap-1 text-muted-foreground shrink-0">
              <Tag className="h-3 w-3 text-primary" /> Discount
            </span>
            <Input
              type="number"
              className="w-20 h-7 text-right bg-secondary/60 border-none rounded-xl text-xs font-semibold"
              value={discount || ""}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
        )}

        {discount > 0 && (
          <div className="flex justify-between text-xs text-rose-600 dark:text-rose-400">
            <span>Discount</span>
            <span className="tabular-nums font-semibold">-{formatCurrency(discount, currency)}</span>
          </div>
        )}

        {/* Loyalty Points Redemption */}
        {selectedCustomer && (selectedCustomer.loyaltyPoints ?? 0) > 0 && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <Star className="h-3 w-3 text-amber-500 shrink-0" />
              <span className="text-xs font-medium truncate">Loyalty ({selectedCustomer.loyaltyPoints} pts)</span>
              {maxRedeemablePoints > 0 && (
                <button
                  onClick={() => setLoyaltyPointsToRedeem(maxRedeemablePoints)}
                  className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline shrink-0"
                  data-testid="button-redeem-all-points"
                >
                  Max
                </button>
              )}
            </div>
            <Input
              type="number"
              min={0}
              max={maxRedeemablePoints}
              className="w-20 h-7 text-right bg-secondary/60 border-none rounded-xl text-xs font-semibold shrink-0"
              value={loyaltyPointsToRedeem || ""}
              onChange={e => setLoyaltyPointsToRedeem(Math.min(Number(e.target.value) || 0, maxRedeemablePoints))}
              placeholder="0"
              data-testid="input-loyalty-points-redeem"
            />
          </div>
        )}

        {loyaltyDiscount > 0 && (
          <div className="flex justify-between text-xs text-amber-600 dark:text-amber-400">
            <span>Loyalty ({loyaltyPointsToRedeem} pts)</span>
            <span className="tabular-nums font-semibold">-{formatCurrency(loyaltyDiscount, currency)}</span>
          </div>
        )}

        {/* Tip selector — single compact row */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground shrink-0">Tip</span>
          {[0.05, 0.10, 0.15].map(pct => (
            <button
              key={pct}
              onClick={() => setTip(tip === parseFloat((discountedSubtotal * pct).toFixed(2)) ? 0 : parseFloat((discountedSubtotal * pct).toFixed(2)))}
              className={[
                "flex-1 h-7 rounded-xl border text-[10px] font-bold transition-all active:scale-95",
                tip > 0 && Math.abs(tip - discountedSubtotal * pct) < 0.01
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-secondary/80 border-border/40 hover:bg-secondary"
              ].join(" ")}
              data-testid={`button-tip-${Math.round(pct * 100)}`}
            >
              {Math.round(pct * 100)}%
            </button>
          ))}
          <button
            onClick={() => setTip(0)}
            className="flex-1 h-7 rounded-xl bg-secondary/40 border border-border/40 text-[10px] font-medium hover:bg-secondary transition-all active:scale-95"
            data-testid="button-tip-clear"
          >
            None
          </button>
          <Input
            type="number"
            min={0}
            className="w-16 h-7 text-right bg-secondary/60 border-none rounded-xl text-xs font-semibold shrink-0"
            value={tip || ""}
            onChange={(e) => setTip(Math.max(0, Number(e.target.value) || 0))}
            placeholder="0"
            data-testid="input-tip-amount"
          />
        </div>

        {/* WiFi voucher toggle (cafés) */}
        {((settings as any)?.wifiSsid || (settings as any)?.wifiPassword) && (
          <label className="flex items-center justify-between text-xs gap-2 cursor-pointer" data-testid="toggle-wifi-voucher">
            <span className="font-medium text-muted-foreground">Issue free WiFi voucher</span>
            <input
              type="checkbox"
              checked={issueWifi}
              onChange={(e) => setIssueWifi(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
          </label>
        )}

        <div className="flex justify-between items-center pt-1 border-t border-border/50">
          <span className="text-sm font-bold">Total</span>
          <span className="text-lg font-black text-primary tabular-nums">
            {formatCurrency(Math.max(0, total), currency)}
          </span>
        </div>

        {isCashPayment && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium shrink-0 text-muted-foreground">Paid</span>

              {/* Mobile: native number keyboard */}
              <Input
                ref={paymentInputRef}
                type="number"
                className="w-28 h-8 text-right bg-secondary/60 border-none rounded-xl text-sm font-bold tabular-nums md:hidden"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                onFocus={() => setIsPaymentFocused(true)}
                onBlur={() => setIsPaymentFocused(false)}
                placeholder="0.00"
              />

              {/* Desktop only: numpad popover */}
              <div className="hidden md:block">
                <Popover open={showNumpad} onOpenChange={(open) => { setShowNumpad(open); setIsPaymentFocused(open); }}>
                  <PopoverTrigger asChild>
                    <button
                      className="w-28 h-8 px-3 text-right bg-secondary/60 rounded-xl text-sm font-bold tabular-nums hover:bg-secondary transition-colors border border-transparent hover:border-border/40"
                      data-testid="button-numpad-trigger"
                    >
                      <span className={paymentAmount ? "text-foreground" : "text-muted-foreground/40"}>
                        {paymentAmount || "0.00"}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="end"
                    className="w-52 p-3 rounded-2xl shadow-xl border border-border/40"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                  >
                    {/* Live display */}
                    <div className="bg-secondary/60 rounded-xl px-3 py-2 mb-2.5 text-right">
                      <p className="text-2xl font-black tabular-nums leading-none">{paymentAmount || "0"}</p>
                      {changeAmount > 0 && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                          Change: {formatCurrency(changeAmount, currency)}
                        </p>
                      )}
                    </div>

                    {/* Exact shortcut */}
                    {total > 0 && (
                      <button
                        onClick={() => setPaymentAmount(total.toFixed(2))}
                        className="w-full h-8 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold mb-2 hover:bg-emerald-500/20 transition-all"
                        data-testid="button-numpad-exact"
                      >
                        Exact — {formatCurrency(total, currency)}
                      </button>
                    )}

                    {/* Digit grid: 7 8 9 / 4 5 6 / 1 2 3 / . 0 ⌫ */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {["7","8","9","4","5","6","1","2","3",".","0","backspace"].map((key) => (
                        <button
                          key={key}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (key === "backspace") {
                              setPaymentAmount((p) => p.slice(0, -1));
                            } else if (key === ".") {
                              setPaymentAmount((p) => p.includes(".") ? p : (p || "0") + ".");
                            } else {
                              setPaymentAmount((p) => p === "0" ? key : p + key);
                            }
                          }}
                          className={[
                            "h-11 rounded-xl font-bold text-sm flex items-center justify-center transition-all active:scale-95 select-none",
                            key === "backspace"
                              ? "bg-destructive/8 text-destructive/70 hover:bg-destructive/15"
                              : "bg-secondary/80 hover:bg-secondary border border-border/30"
                          ].join(" ")}
                          data-testid={`numpad-key-${key}`}
                        >
                          {key === "backspace" ? <Delete className="h-4 w-4" /> : key}
                        </button>
                      ))}
                    </div>

                    {/* Done */}
                    <button
                      onClick={() => setShowNumpad(false)}
                      className="w-full h-9 rounded-xl bg-primary text-white font-bold text-sm mt-2 hover:opacity-90 transition-all active:scale-[0.98]"
                      data-testid="button-numpad-done"
                    >
                      Done
                    </button>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {total > 0 && (
              <div className="flex gap-1">
                <button
                  onClick={() => setPaymentAmount(total.toFixed(2))}
                  className="flex-1 h-7 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold hover:bg-emerald-500/20 transition-all active:scale-95"
                  data-testid="button-quick-exact"
                >
                  Exact
                </button>
                {quickAmounts.map(amount => (
                  <button
                    key={amount}
                    onClick={() => setPaymentAmount(amount.toString())}
                    className="flex-1 h-7 rounded-xl bg-secondary/80 border border-border/40 text-[10px] font-bold hover:bg-secondary transition-all active:scale-95 tabular-nums"
                    data-testid={`button-quick-${amount}`}
                  >
                    {currency}{amount}
                  </button>
                ))}
              </div>
            )}
            {changeAmount > 0 && (
              <div className="flex justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <span>Change</span>
                <span className="tabular-nums">{formatCurrency(changeAmount, currency)}</span>
              </div>
            )}
          </>
        )}

        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
          <SelectTrigger className="w-full h-8 bg-secondary/60 border-none rounded-xl text-xs font-medium" data-testid="select-payment-method">
            <SelectValue placeholder="Payment Method" />
          </SelectTrigger>
          <SelectContent>
            {paymentMethods.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          className="w-full h-10 rounded-2xl font-bold text-white bg-primary shadow-lg shadow-primary/25 hover:opacity-90 transition-all active:scale-[0.98]"
          onClick={handleCheckout}
          disabled={cart.length === 0 || createPending.isPending}
          data-testid="button-checkout"
        >
          {createPending.isPending ? "Processing..." : `Charge · ${formatCurrency(total, currency)}`}
        </Button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-[3/4] bg-muted rounded-3xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-5 page-enter" style={{ height: "calc(100dvh - 8rem)" }}>

      {/* Left: Product grid */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Search + Barcode Scanner */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              className="pl-11 h-12 rounded-2xl bg-card border-none shadow-sm text-sm focus-visible:ring-primary/20"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-products"
            />
          </div>
          {showBarcode && (
            <div className="relative">
              <Barcode className={[
                "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-150",
                scanFlash ? "text-primary" : "text-muted-foreground"
              ].join(" ")} />
              <Input
                ref={barcodeRef}
                placeholder="Scan barcode..."
                className={[
                  "pl-9 h-12 w-40 rounded-2xl bg-card border-none shadow-sm text-sm focus-visible:ring-primary/20 transition-colors duration-150",
                  scanFlash ? "ring-2 ring-primary/30" : ""
                ].join(" ")}
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                data-testid="input-barcode-scan"
              />
              {scanFlash && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-primary animate-pulse pointer-events-none">
                  SCANNING
                </span>
              )}
            </div>
          )}
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-3 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              data-testid={`filter-category-${cat}`}
              className={[
                "shrink-0 rounded-full px-5 h-9 capitalize font-semibold text-sm tracking-tight transition-all duration-200 border",
                category === cat
                  ? "bg-primary text-white border-primary shadow-md shadow-primary/25 scale-[1.02]"
                  : "bg-card border-border/40 text-foreground/60 hover:text-foreground hover:bg-secondary/60"
              ].join(" ")}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Products */}
        <div className="flex-1 overflow-y-auto scrollbar-hide pb-4">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-3 py-16">
              <Package className="h-14 w-14" strokeWidth={1.2} />
              <p className="font-medium">No products found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 stagger-children">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  data-testid={`product-card-${product.id}`}
                  onClick={() => handleProductClick(product)}
                  className="group text-left bg-card rounded-3xl shadow-sm border border-border/30 overflow-hidden hover:shadow-xl hover:-translate-y-1 active:scale-[0.97] transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 animate-fade-scale"
                >
                  {/* Product icon area */}
                  <div className="aspect-square bg-gradient-to-br from-secondary/60 to-muted/30 flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <Package
                      className="h-14 w-14 md:h-16 md:w-16 text-primary/25 group-hover:scale-110 group-hover:text-primary/40 transition-all duration-500"
                      strokeWidth={1.2}
                    />
                    {/* Quick add indicator */}
                    <div className="absolute bottom-2 right-2 h-7 w-7 rounded-full bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-300 shadow-lg">
                      <Plus className="h-3.5 w-3.5 text-white" />
                    </div>
                  </div>

                  {/* Product info */}
                  <div className="p-3">
                    <h3 className="font-bold text-sm leading-tight mb-1.5 group-hover:text-primary transition-colors line-clamp-2">
                      {product.name}
                    </h3>
                    <p className="text-primary font-black text-base tabular-nums">
                      {product.sizes && product.sizes.length > 0
                        ? `${formatCurrency(product.sizes[0].price, currency)}+`
                        : formatCurrency(product.price, currency)}
                    </p>
                    {product.category && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1 font-medium">{product.category}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Desktop Cart Panel */}
      <div className="hidden md:flex w-[380px] flex-col bg-card rounded-3xl shadow-xl border border-border/30 p-6 overflow-hidden relative shrink-0">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -z-10" />
        <div className="flex items-center gap-2.5 mb-5 shrink-0">
          <div className="h-9 w-9 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ShoppingCart className="text-primary h-4.5 w-4.5" />
          </div>
          <h2 className="text-xl font-black">Current Order</h2>
          {cartCount > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="bg-primary text-white text-xs font-bold px-2.5 py-0.5 rounded-full animate-badge-pop" key={cartCount}>
                {cartCount}
              </span>
              <button
                onClick={() => setCart([])}
                className="h-7 w-7 rounded-full bg-destructive/8 hover:bg-destructive/15 flex items-center justify-center text-destructive/60 hover:text-destructive transition-all shrink-0"
                title="Clear cart"
                data-testid="button-clear-cart"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
        {CartContent}
      </div>

      {/* Mobile: Floating cart bar */}
      {cart.length > 0 && (
        <div className="md:hidden fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px))] left-4 right-4 z-40">
          <button
            data-testid="button-open-cart"
            onClick={() => setCartOpen(true)}
            className="w-full glass-cart-bar rounded-2xl px-4 py-3 flex items-center gap-3 active:scale-[0.98] transition-all"
          >
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-md shadow-primary/30 relative">
              <ShoppingCart className="h-4 w-4 text-white" />
              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-black w-[16px] h-[16px] rounded-full flex items-center justify-center border-2 border-background">
                {cartCount > 9 ? "9+" : cartCount}
              </span>
            </div>
            <div className="flex-1 text-left">
              <p className="text-xs font-semibold text-muted-foreground leading-none mb-0.5">{cartCount} item{cartCount !== 1 ? "s" : ""}</p>
              <p className="text-sm font-black tabular-nums">{formatCurrency(total, currency)}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-sm font-bold text-primary">Review</span>
              <ChevronRight className="h-4 w-4 text-primary" />
            </div>
          </button>
        </div>
      )}

      {/* Mobile Cart Sheet */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side="bottom"
          className="h-[92dvh] border-t-0 p-0 flex flex-col rounded-t-[2rem] overflow-hidden"
          data-testid="sheet-cart"
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
          </div>
          <SheetHeader className="px-4 pb-2 pt-1 border-b border-border/40 shrink-0">
            <SheetTitle className="text-base font-black flex items-center gap-2">
              <ShoppingCart className="text-primary h-4 w-4" /> Order Summary
              {cartCount > 0 && (
                <span className="ml-auto bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {cartCount}
                </span>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 px-4 py-2">
            {CartContent}
          </div>
        </SheetContent>
      </Sheet>

      {/* Product customization dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => { if (!open) { setSelectedProduct(null); setTempNote(""); } }}>
        <DialogContent className="sm:max-w-[420px] max-w-[calc(100vw-32px)] rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-5 bg-primary text-white">
            <DialogTitle className="text-xl font-black">{selectedProduct?.name}</DialogTitle>
            <p className="text-white/65 text-xs font-medium mt-1">Customize your order</p>
          </DialogHeader>

          <div className="p-6 space-y-6">
            {selectedProduct?.sizes && selectedProduct.sizes.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-bold text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Select Size</h4>
                <div className="grid grid-cols-3 gap-2">
                  {selectedProduct.sizes.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => setTempSize(s)}
                      className={[
                        "rounded-2xl py-3 px-2 flex flex-col items-center gap-1 border-2 transition-all duration-200 active:scale-[0.97]",
                        tempSize?.name === s.name
                          ? "border-primary bg-primary/5 text-primary shadow-md shadow-primary/10"
                          : "border-border/40 bg-secondary/50 text-foreground/70 hover:border-border"
                      ].join(" ")}
                    >
                      <span className="font-bold text-sm">{s.name}</span>
                      <span className="text-[10px] font-semibold opacity-60">{formatCurrency(s.price, currency)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="font-bold text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1.5">
                <NotebookPen className="h-3 w-3" /> Note
              </h4>
              <input
                type="text"
                value={tempNote}
                onChange={(e) => setTempNote(e.target.value)}
                placeholder="Add a note for this item"
                className="w-full rounded-2xl border border-border/40 bg-secondary/50 px-4 py-3 text-sm outline-none focus:border-primary/40 transition-colors placeholder:text-muted-foreground/40 font-medium"
              />
            </div>

            <Button
              className="w-full h-14 rounded-2xl font-black text-base bg-primary shadow-xl shadow-primary/20 hover:opacity-90 transition-all active:scale-[0.98]"
              onClick={() => selectedProduct && addToCart(selectedProduct, tempSize || undefined, tempNote || undefined)}
              data-testid="button-add-to-cart"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add to Order
              {tempSize && (
                <span className="ml-1.5 opacity-80 text-sm font-semibold">
                  · {formatCurrency(tempSize.price, currency)}
                </span>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      <ReceiptModal
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        receipt={receiptData}
      />

      {/* Customer Picker Dialog */}
      <Dialog open={showCustomerPicker} onOpenChange={setShowCustomerPicker}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Select Customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <Input
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Search by name or phone..."
                className="pl-9 h-10 rounded-xl"
                data-testid="input-customer-search"
              />
            </div>
            {filteredCustomers.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">No customers found</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {filteredCustomers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedCustomer(c); setShowCustomerPicker(false); setCustomerSearch(""); }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left"
                    data-testid={`customer-option-${c.id}`}
                  >
                    <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">{c.name[0].toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.phone || c.email || "No contact info"}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
