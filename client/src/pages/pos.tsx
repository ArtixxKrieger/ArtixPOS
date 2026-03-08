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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShoppingCart, Plus, Minus, Trash2, Tag, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CartItem = {
  cartId: string;
  product: Product;
  quantity: number;
  size?: { name: string; price: string };
  modifiers?: { name: string; price: string }[];
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

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [tempSize, setTempSize] = useState<{ name: string; price: string } | null>(null);
  const [tempModifiers, setTempModifiers] = useState<{ name: string; price: string }[]>([]);

  const paymentInputRef = useRef<HTMLInputElement>(null);
  const [isPaymentFocused, setIsPaymentFocused] = useState(false);

  const isOnlinePayment = paymentMethod === "online";

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

  const addToCart = (product: Product, size?: { name: string; price: string }, modifiers?: { name: string; price: string }[]) => {
    setCart(prev => {
      const existing = prev.find(item =>
        item.product.id === product.id &&
        item.size?.name === size?.name &&
        JSON.stringify(item.modifiers) === JSON.stringify(modifiers)
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
        modifiers
      }];
    });
    setSelectedProduct(null);
    setTempSize(null);
    setTempModifiers([]);
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

  const subtotal = cart.reduce(
    (acc, item) => {
      const basePrice = parseNumeric(item.size?.price || item.product.price);
      const modsPrice = (item.modifiers || []).reduce((sum, m) => sum + parseNumeric(m.price), 0);
      return acc + (basePrice + modsPrice) * item.quantity;
    },
    0
  );

  const taxRate = parseNumeric(settings?.taxRate || 0);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax - discount;

  const numericPayment = isOnlinePayment
    ? total
    : parseNumeric(paymentAmount || "0");

  const changeAmount = isOnlinePayment
    ? 0
    : Math.max(0, numericPayment - total);

  useEffect(() => {
    if (isOnlinePayment) {
      setPaymentAmount(total.toString());
    }
  }, [isOnlinePayment, total]);

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
          toast({
            title: "Order Created",
            description: "Order has been sent to the Pending section.",
          });
        },
      }
    );
  };

  useEffect(() => {
    if (!isOnlinePayment && isPaymentFocused && paymentInputRef.current) {
      paymentInputRef.current.focus({ preventScroll: true });
    }
  }, [cart, discount, isOnlinePayment]);

  const CartContent = useMemo(() => (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 p-1">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
            <ShoppingCart className="h-16 w-16 mb-4" />
            <p>Cart is empty</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.cartId} className="flex flex-col p-3 bg-card rounded-xl border border-border/50 shadow-sm gap-2">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-sm break-words max-h-12 overflow-y-auto">
                    {item.product.name}
                    {item.size && <span className="ml-1 text-xs opacity-60">({item.size.name})</span>}
                  </p>
                  <p className="text-primary font-bold text-sm">
                    {formatCurrency(
                      (parseNumeric(item.size?.price || item.product.price) +
                        (item.modifiers || []).reduce((sum, m) => sum + parseNumeric(m.price), 0)),
                      settings?.currency
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-secondary rounded-lg p-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md" onClick={() => updateQuantity(item.cartId, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md" onClick={() => updateQuantity(item.cartId, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => removeFromCart(item.cartId)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {item.modifiers && item.modifiers.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.modifiers.map(m => (
                    <span key={m.name} className="text-[10px] bg-secondary px-2 py-0.5 rounded-full opacity-70">
                      + {m.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="pt-4 border-t border-border mt-4 space-y-3 pb-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal, settings?.currency)}</span>
        </div>

        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Tax ({taxRate}%)</span>
          <span>{formatCurrency(tax, settings?.currency)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" /> Discount
          </span>
          <Input
            type="number"
            className="w-24 h-8 text-right bg-secondary border-none"
            value={discount || ""}
            onChange={(e) => setDiscount(Number(e.target.value) || 0)}
          />
        </div>

        <div className="flex justify-between items-end pt-2 border-t border-border">
          <span className="text-lg font-bold">Total</span>
          <span className="text-xl font-bold text-primary">
            {formatCurrency(total, settings?.currency)}
          </span>
        </div>

        {!isOnlinePayment && (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">Amount Paid</span>
              <Input
                ref={paymentInputRef}
                type="number"
                className="w-32 h-10 text-right bg-secondary border-none font-bold"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                onFocus={() => setIsPaymentFocused(true)}
                onBlur={() => setIsPaymentFocused(false)}
              />
            </div>

            <div className="flex justify-between text-sm font-bold text-green-600 dark:text-green-400">
              <span>Change</span>
              <span>{formatCurrency(changeAmount, settings?.currency)}</span>
            </div>
          </>
        )}

        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
          <SelectTrigger className="w-full h-10 bg-secondary border-none rounded-xl font-medium mb-2">
            <SelectValue placeholder="Payment Method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="online">Online Payment</SelectItem>
          </SelectContent>
        </Select>

        <div className="pb-4">
          <Button
            className="w-full h-12 rounded-xl font-bold bg-gradient-to-r from-primary to-violet-500 shadow-lg hover:shadow-xl hover:opacity-90 transition-all text-white"
            onClick={handleCheckout}
            disabled={cart.length === 0 || createPending.isPending}
          >
            {createPending.isPending ? "Processing..." : "Finalize Order"}
          </Button>
        </div>
      </div>
    </div>
  ), [cart, discount, paymentAmount, settings?.currency, taxRate, total, changeAmount, isOnlinePayment]);

  if (isLoading) return <div className="p-8 text-center animate-pulse">Loading products...</div>;

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6 animate-in fade-in duration-500">
      <div className="flex-1 flex flex-col min-w-0">

        <div className="flex gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              className="pl-10 h-12 rounded-2xl bg-card border-none shadow-sm text-base"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button className="md:hidden h-12 px-4 rounded-2xl bg-primary text-white shadow-md relative">
                <ShoppingCart className="h-5 w-5 mr-2" />
                Cart
                {cart.length > 0 && (
                  <span className="absolute -top-2 -right-2 bg-destructive text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-background">
                    {cart.reduce((a, b) => a + b.quantity, 0)}
                  </span>
                )}
              </Button>
            </SheetTrigger>

            <SheetContent className="w-[90vw] sm:w-[400px] border-l-0 p-6 flex flex-col h-full">
              <SheetHeader className="mb-6">
                <SheetTitle>Current Order</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto">
                {CartContent}
                <div className="h-6" />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {categories.map(cat => (
            <Button
              key={cat}
              variant={category === cat ? "default" : "secondary"}
              className={`rounded-full px-6 capitalize font-semibold tracking-wide transition-all ${
                category === cat ? "shadow-md shadow-primary/20" : ""
              }`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pb-20">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map(product => (
              <Card
                key={product.id}
                className="cursor-pointer group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-none bg-card shadow-md overflow-hidden rounded-2xl"
                onClick={() => handleProductClick(product)}
              >
                <div className="aspect-square bg-secondary/50 flex items-center justify-center p-4 relative">
                  <Package className="h-16 w-16 text-primary/40 group-hover:scale-110 transition-transform duration-500" />
                </div>
                <CardContent className="p-4 bg-card relative z-20">
                  <h3 className="font-bold text-foreground">{product.name}</h3>
                  <p className="text-primary font-black mt-1 text-lg">
                    {product.sizes && product.sizes.length > 0
                      ? `${formatCurrency(product.sizes[0].price, settings?.currency)}+`
                      : formatCurrency(product.price, settings?.currency)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
          <DialogContent className="sm:max-w-[425px] rounded-2xl">
            <DialogHeader>
              <DialogTitle>{selectedProduct?.name}</DialogTitle>
            </DialogHeader>

            <div className="space-y-6 pt-4">

              {selectedProduct?.sizes && selectedProduct.sizes.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Select Size</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedProduct.sizes.map((s) => (
                      <Button
                        key={s.name}
                        variant={tempSize?.name === s.name ? "default" : "secondary"}
                        className="rounded-xl h-auto py-3 flex flex-col gap-1"
                        onClick={() => setTempSize(s)}
                      >
                        <span className="font-bold">{s.name}</span>
                        <span className="text-[10px] opacity-70">{formatCurrency(s.price, settings?.currency)}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {selectedProduct?.modifiers && selectedProduct.modifiers.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Add-ons</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedProduct.modifiers.map((m) => {
                      const isActive = tempModifiers.some(tm => tm.name === m.name);
                      return (
                        <Button
                          key={m.name}
                          variant={isActive ? "default" : "secondary"}
                          className="rounded-xl h-auto py-3 justify-between px-3"
                          onClick={() => toggleModifier(m)}
                        >
                          <span className="font-bold text-xs">{m.name}</span>
                          <span className="text-[10px] opacity-70">+{formatCurrency(m.price, settings?.currency)}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              <Button
                className="w-full h-12 rounded-xl font-bold bg-gradient-to-r from-primary to-violet-500 shadow-lg"
                onClick={() => selectedProduct && addToCart(selectedProduct, tempSize || undefined, tempModifiers)}
              >
                Add to Cart
              </Button>

            </div>
          </DialogContent>
        </Dialog>

      </div>

      <div className="hidden md:flex w-[380px] flex-col bg-card rounded-3xl shadow-xl border border-border/50 p-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -z-10" />
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <ShoppingCart className="text-primary" /> Order
        </h2>
        {CartContent}
      </div>

    </div>
  );
}