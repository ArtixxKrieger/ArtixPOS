import { useState, useMemo } from "react";
import { useProducts } from "@/hooks/use-products";
import { useSettings } from "@/hooks/use-settings";
import { useCreateSale } from "@/hooks/use-sales";
import { useCreatePendingOrder } from "@/hooks/use-pending-orders";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { type Product } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShoppingCart, Plus, Minus, Trash2, Tag, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type CartItem = {
  cartId: string;
  product: Product;
  quantity: number;
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

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      }
      return [...prev, { cartId: Math.random().toString(36), product, quantity: 1 }];
    });
  };

  const updateQuantity = (cartId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) {
        const newQ = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQ };
      }
      return item;
    }));
  };

  const removeFromCart = (cartId: string) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  const subtotal = cart.reduce((acc, item) => acc + (parseNumeric(item.product.price) * item.quantity), 0);
  const taxRate = parseNumeric(settings?.taxRate || 0);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax - discount;

  const handleCheckout = () => {
    if (cart.length === 0) return;
    
    // Finalize order directly to sales (Completed)
    createSale.mutate({
      items: cart,
      subtotal: subtotal.toString(),
      tax: tax.toString(),
      discount: discount.toString(),
      total: total.toString(),
      paymentMethod,
      paymentAmount: total.toString(),
      changeAmount: "0",
    }, {
      onSuccess: () => {
        setCart([]);
        setDiscount(0);
        toast({ title: "Sale Complete", description: "Receipt generated successfully." });
      }
    });
  };

  const handlePayLater = () => {
    if (cart.length === 0) return;
    
    // Send to pending section first
    createPending.mutate({
      items: cart,
      subtotal: subtotal.toString(),
      tax: tax.toString(),
      discount: discount.toString(),
      total: total.toString(),
      status: "pending",
    }, {
      onSuccess: () => {
        setCart([]);
        setDiscount(0);
        toast({ title: "Order Sent to Pending", description: "You can find this order in the Pending section." });
      }
    });
  };

  const handleParkOrder = () => {
    if (cart.length === 0) return;
    
    createPending.mutate({
      items: cart,
      subtotal: subtotal.toString(),
      tax: tax.toString(),
      discount: discount.toString(),
      total: total.toString(),
      status: "parked",
    }, {
      onSuccess: () => {
        setCart([]);
        setDiscount(0);
        toast({ title: "Order Parked", description: "You can resume it from the Pending Orders tab." });
      }
    });
  };

  if (isLoading) return <div className="p-8 text-center animate-pulse">Loading products...</div>;

  const CartContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 p-1">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
            <ShoppingCart className="h-16 w-16 mb-4" />
            <p>Cart is empty</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.cartId} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border/50 shadow-sm">
              <div className="flex-1">
                <p className="font-semibold text-sm line-clamp-1">{item.product.name}</p>
                <p className="text-primary font-bold text-sm">
                  {formatCurrency(item.product.price, settings?.currency)}
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
          ))
        )}
      </div>

      <div className="pt-4 border-t border-border mt-4 space-y-3">
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
        <div className="flex justify-between items-end pt-3 border-t border-border">
          <span className="text-lg font-bold">Total</span>
          <span className="text-2xl font-bold text-primary">{formatCurrency(total, settings?.currency)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="col-span-2 h-12 bg-secondary border-none rounded-xl font-medium">
              <SelectValue placeholder="Payment Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="card">Credit Card</SelectItem>
              <SelectItem value="mobile">Mobile Pay</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            className="rounded-xl font-bold border-2"
            onClick={handleParkOrder}
            disabled={cart.length === 0 || createPending.isPending}
          >
            Park
          </Button>
          <Button 
            variant="outline"
            className="rounded-xl font-bold border-2"
            onClick={handlePayLater}
            disabled={cart.length === 0 || createPending.isPending}
          >
            Pay Later
          </Button>
          <Button 
            className="col-span-2 h-12 rounded-xl font-bold bg-gradient-to-r from-primary to-violet-500 shadow-lg hover:shadow-xl hover:opacity-90 transition-all text-white"
            onClick={handleCheckout}
            disabled={cart.length === 0 || createSale.isPending}
          >
            {createSale.isPending ? "Processing..." : "Finalize Order"}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6 animate-in fade-in duration-500">
      {/* Products Section */}
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
                    {cart.reduce((a,b) => a+b.quantity, 0)}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[90vw] sm:w-[400px] border-l-0 p-6">
              <SheetHeader className="mb-6">
                <SheetTitle>Current Order</SheetTitle>
              </SheetHeader>
              <CartContent />
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
                onClick={() => addToCart(product)}
              >
                <div className="aspect-square bg-secondary/50 flex items-center justify-center p-4 relative">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10" />
                  <Package className="h-16 w-16 text-primary/40 group-hover:scale-110 transition-transform duration-500" />
                </div>
                <CardContent className="p-4 bg-card relative z-20">
                  <h3 className="font-bold text-foreground line-clamp-1">{product.name}</h3>
                  <p className="text-primary font-black mt-1 text-lg">
                    {formatCurrency(product.price, settings?.currency)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop Cart Sidebar */}
      <div className="hidden md:flex w-[380px] flex-col bg-card rounded-3xl shadow-xl border border-border/50 p-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -z-10" />
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <ShoppingCart className="text-primary" /> Order
        </h2>
        <CartContent />
      </div>
    </div>
  );
}
