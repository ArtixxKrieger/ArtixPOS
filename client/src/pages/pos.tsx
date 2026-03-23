import { useState, useMemo, useRef, useEffect } from "react";
import { useProducts } from "@/hooks/use-products";
import { useSettings } from "@/hooks/use-settings";
import { useCreateSale } from "@/hooks/use-sales";
import { useCreatePendingOrder } from "@/hooks/use-pending-orders";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { type Product } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShoppingCart, Plus, Minus, Trash2, Tag, Package, ChevronRight, NotebookPen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const createSale = useCreateSale();
  const createPending = useCreatePendingOrder();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [cartOpen, setCartOpen] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [tempSize, setTempSize] = useState<{ name: string; price: string } | null>(null);
  const [tempModifiers, setTempModifiers] = useState<{ name: string; price: string }[]>([]);
  const [tempNote, setTempNote] = useState("");

  const paymentInputRef = useRef<HTMLInputElement>(null);
  const [isPaymentFocused, setIsPaymentFocused] = useState(false);

  const isOnlinePayment = paymentMethod === "online";
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
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = category === "all" || p.category === category;
      return matchSearch && matchCat;
    });
  }, [products, search, category]);

  const addToCart = (product: Product, size?: { name: string; price: string }, modifiers?: { name: string; price: string }[], note?: string) => {
    setCart(prev => {
      const existing = prev.find(item =>
        item.product.id === product.id &&
        item.size?.name === size?.name &&
        JSON.stringify(item.modifiers) === JSON.stringify(modifiers) &&
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
        modifiers,
        note: note || undefined,
      }];
    });
    setSelectedProduct(null);
    setTempSize(null);
    setTempModifiers([]);
    setTempNote("");
  };

  const updateNote = (cartId: string, note: string) => {
    setCart(prev => prev.map(item =>
      item.cartId === cartId ? { ...item, note: note || undefined } : item
    ));
  };

  const handleProductClick = (product: Product) => {
    if ((product.sizes && product.sizes.length > 0) || (product.modifiers && product.modifiers.length > 0)) {
      setSelectedProduct(product);
      setTempSize(product.sizes?.[0] || null);
      setTempModifiers([]);
    } else {
      addToCart(product);
    }
  };

  const toggleModifier = (mod: { name: string; price: string }) => {
    setTempModifiers(prev =>
      prev.find(m => m.name === mod.name)
        ? prev.filter(m => m.name !== mod.name)
        : [...prev, mod]
    );
  };

  const subtotal = cart.reduce((acc, item) => {
    const basePrice = parseNumeric(item.size?.price || item.product.price);
    const modsPrice = (item.modifiers || []).reduce((sum, m) => sum + parseNumeric(m.price), 0);
    return acc + (basePrice + modsPrice) * item.quantity;
  }, 0);

  const taxRate = parseNumeric(settings?.taxRate || 0);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax - discount;
  const cartCount = cart.reduce((a, b) => a + b.quantity, 0);
  const quickAmounts = useMemo(() => getQuickAmounts(total), [total]);

  const numericPayment = isOnlinePayment ? total : parseNumeric(paymentAmount || "0");
  const changeAmount = isOnlinePayment ? 0 : Math.max(0, numericPayment - total);

  useEffect(() => {
    if (isOnlinePayment) setPaymentAmount(total.toString());
  }, [isOnlinePayment, total]);

  useEffect(() => {
    if (!isOnlinePayment && isPaymentFocused && paymentInputRef.current) {
      paymentInputRef.current.focus({ preventScroll: true });
    }
  }, [cart, discount, isOnlinePayment]);

  const handleCheckout = () => {
    if (cart.length === 0) return;
    createPending.mutate(
      {
        items: cart,
        subtotal: subtotal.toString(),
        tax: tax.toString(),
        discount: discount.toString(),
        total: total.toString(),
        paymentAmount: numericPayment.toString(),
        changeAmount: changeAmount.toString(),
        status: isOnlinePayment || numericPayment >= total ? "paid" : "unpaid",
        paymentMethod,
      },
      {
        onSuccess: () => {
          setCart([]);
          setDiscount(0);
          setPaymentAmount("");
          setCartOpen(false);
          toast({ title: "Order Created", description: "Order sent to Pending." });
        },
      }
    );
  };

  const CartContent = (
    <div className="flex flex-col h-full">
      {/* Items */}
      <div className="flex-1 overflow-y-auto space-y-2.5 scrollbar-hide p-1">
        {cart.length === 0 ? (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-muted-foreground/50 gap-3">
            <ShoppingCart className="h-14 w-14" strokeWidth={1.2} />
            <p className="text-sm font-medium">Your cart is empty</p>
            <p className="text-xs opacity-70">Tap a product to add it</p>
          </div>
        ) : (
          cart.map((item) => {
            const itemPrice = parseNumeric(item.size?.price || item.product.price) +
              (item.modifiers || []).reduce((sum, m) => sum + parseNumeric(m.price), 0);
            return (
              <div
                key={item.cartId}
                className="flex flex-col p-3 bg-secondary/50 dark:bg-secondary/30 rounded-2xl gap-2 border border-border/30 item-enter"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight truncate">
                      {item.product.name}
                      {item.size && (
                        <span className="ml-1.5 text-[10px] font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-md">
                          {item.size.name}
                        </span>
                      )}
                    </p>
                    <p className="text-primary font-bold text-sm mt-0.5 tabular-nums">
                      {formatCurrency(itemPrice, currency)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="flex items-center bg-background/80 dark:bg-background/40 rounded-xl border border-border/40 overflow-hidden">
                      <button
                        className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all"
                        onClick={() => updateQuantity(item.cartId, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold tabular-nums">{item.quantity}</span>
                      <button
                        className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all"
                        onClick={() => updateQuantity(item.cartId, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      className="h-7 w-7 flex items-center justify-center text-destructive/60 hover:text-destructive active:scale-90 transition-all"
                      onClick={() => removeFromCart(item.cartId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {item.modifiers && item.modifiers.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.modifiers.map(m => (
                      <span key={m.name} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                        + {m.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <NotebookPen className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  <input
                    type="text"
                    value={item.note || ""}
                    onChange={(e) => updateNote(item.cartId, e.target.value)}
                    placeholder="Add a note..."
                    className="flex-1 text-[11px] bg-transparent border-none outline-none text-muted-foreground placeholder:text-muted-foreground/35 font-medium"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary */}
      <div className="pt-4 border-t border-border/50 space-y-2.5 shrink-0">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal, currency)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Tax ({taxRate}%)</span>
          <span className="tabular-nums">{formatCurrency(tax, currency)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-primary" /> Discount
          </span>
          <Input
            type="number"
            className="w-24 h-8 text-right bg-secondary/60 border-none rounded-xl text-sm font-semibold"
            value={discount || ""}
            onChange={(e) => setDiscount(Number(e.target.value) || 0)}
            placeholder="0"
          />
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-border/50">
          <span className="text-base font-bold">Total</span>
          <span className="text-xl font-black text-primary tabular-nums">
            {formatCurrency(total, currency)}
          </span>
        </div>

        {!isOnlinePayment && (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium shrink-0">Amount Paid</span>
              <Input
                ref={paymentInputRef}
                type="number"
                className="w-32 h-10 text-right bg-secondary/60 border-none rounded-xl font-bold tabular-nums"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                onFocus={() => setIsPaymentFocused(true)}
                onBlur={() => setIsPaymentFocused(false)}
                placeholder="0.00"
              />
            </div>
            {total > 0 && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => setPaymentAmount(total.toFixed(2))}
                  className="flex-1 h-8 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold hover:bg-emerald-500/20 transition-all active:scale-95"
                  data-testid="button-quick-exact"
                >
                  Exact
                </button>
                {quickAmounts.map(amount => (
                  <button
                    key={amount}
                    onClick={() => setPaymentAmount(amount.toString())}
                    className="flex-1 h-8 rounded-xl bg-secondary/80 border border-border/40 text-[11px] font-bold hover:bg-secondary transition-all active:scale-95 tabular-nums"
                    data-testid={`button-quick-${amount}`}
                  >
                    {currency}{amount}
                  </button>
                ))}
              </div>
            )}
            {changeAmount > 0 && (
              <div className="flex justify-between text-sm font-bold text-emerald-600 dark:text-emerald-400">
                <span>Change</span>
                <span className="tabular-nums">{formatCurrency(changeAmount, currency)}</span>
              </div>
            )}
          </>
        )}

        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
          <SelectTrigger className="w-full h-10 bg-secondary/60 border-none rounded-xl font-medium">
            <SelectValue placeholder="Payment Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="online">Online Payment</SelectItem>
          </SelectContent>
        </Select>

        <Button
          className="w-full h-12 rounded-2xl font-bold text-white bg-primary shadow-lg shadow-primary/25 hover:opacity-90 transition-all active:scale-[0.98]"
          onClick={handleCheckout}
          disabled={cart.length === 0 || createPending.isPending}
        >
          {createPending.isPending ? "Processing..." : `Finalize · ${formatCurrency(total, currency)}`}
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

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            className="pl-11 h-12 rounded-2xl bg-card border-none shadow-sm text-sm focus-visible:ring-primary/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-products"
          />
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
          <SheetHeader className="px-5 pb-4 pt-2 border-b border-border/40 shrink-0">
            <SheetTitle className="text-xl font-black flex items-center gap-2">
              <ShoppingCart className="text-primary h-5 w-5" /> Order Summary
              {cartCount > 0 && (
                <span className="ml-auto bg-primary text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {cartCount} items
                </span>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-hide">
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

            {selectedProduct?.modifiers && selectedProduct.modifiers.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-bold text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Add-ons</h4>
                <div className="grid grid-cols-2 gap-2">
                  {selectedProduct.modifiers.map((m) => {
                    const isActive = tempModifiers.some(tm => tm.name === m.name);
                    return (
                      <button
                        key={m.name}
                        onClick={() => toggleModifier(m)}
                        className={[
                          "rounded-2xl py-3 px-4 flex flex-col gap-1 border-2 transition-all duration-200 active:scale-[0.97] text-left",
                          isActive
                            ? "border-primary bg-primary/5 text-primary shadow-md shadow-primary/10"
                            : "border-border/40 bg-secondary/50 text-foreground/70 hover:border-border"
                        ].join(" ")}
                      >
                        <span className="font-bold text-xs">{m.name}</span>
                        <span className="text-[10px] font-semibold opacity-60">+{formatCurrency(m.price, currency)}</span>
                      </button>
                    );
                  })}
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
              onClick={() => selectedProduct && addToCart(selectedProduct, tempSize || undefined, tempModifiers, tempNote || undefined)}
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

    </div>
  );
}
