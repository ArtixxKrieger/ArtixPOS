import { useState } from "react";
import { useProducts, useUpdateProduct } from "@/hooks/use-products";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertCircle, Package, Plus, Minus, BarChart3, TrendingDown } from "lucide-react";

export default function Inventory() {
  const { data: products = [], isLoading } = useProducts();
  const { data: settings } = useSettings();
  const updateProduct = useUpdateProduct();
  const [search, setSearch] = useState("");
  const [adjustId, setAdjustId] = useState<number | null>(null);
  const [adjustQty, setAdjustQty] = useState<string>("");

  const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  const lowStock = products.filter(p => (p.stock || 0) <= (p.minStock || 10));
  const outOfStock = products.filter(p => (p.stock || 0) === 0);

  const handleAdjustStock = (productId: number, adjustment: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    const newStock = Math.max(0, (product.stock || 0) + adjustment);
    updateProduct.mutate({
      id: productId,
      stock: newStock
    });
  };

  const handleSetStock = (productId: number, newQty: string) => {
    const qty = parseInt(newQty) || 0;
    updateProduct.mutate({
      id: productId,
      stock: Math.max(0, qty)
    }, {
      onSuccess: () => {
        setAdjustId(null);
        setAdjustQty("");
      }
    });
  };

  if (isLoading) return <div className="p-8 text-center animate-pulse">Loading inventory...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-10">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white shadow-xl">
          <BarChart3 className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-3xl font-black tracking-tight">Inventory Management</h2>
          <p className="text-sm text-muted-foreground font-medium">Monitor stock levels and manage inventory</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="rounded-3xl border-none shadow-sm bg-gradient-to-br from-emerald-500/10 to-transparent border border-border/50 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Package className="h-12 w-12" /></div>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total Products</p>
            <h3 className="text-3xl font-black mt-1">{products.length}</h3>
            <p className="text-xs text-muted-foreground mt-2">In catalog</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm bg-gradient-to-br from-yellow-500/10 to-transparent border border-border/50 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10"><AlertCircle className="h-12 w-12" /></div>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Low Stock</p>
            <h3 className="text-3xl font-black mt-1 text-amber-600">{lowStock.length}</h3>
            <p className="text-xs text-muted-foreground mt-2">Need replenishment</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-sm bg-gradient-to-br from-red-500/10 to-transparent border border-border/50 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingDown className="h-12 w-12" /></div>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Out of Stock</p>
            <h3 className="text-3xl font-black mt-1 text-destructive">{outOfStock.length}</h3>
            <p className="text-xs text-muted-foreground mt-2">Requires immediate action</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl border-none shadow-xl overflow-hidden bg-card">
        <CardHeader className="bg-muted/20 border-b border-border/50 py-6 px-8">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-black">Stock Levels</CardTitle>
            <Input
              placeholder="Search products..."
              className="w-64 h-11 rounded-xl bg-background border-none text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/30 border-b border-border/50 sticky top-0">
                <tr>
                  <th className="px-8 py-4 text-left font-black text-xs uppercase tracking-wider">Product</th>
                  <th className="px-6 py-4 text-left font-black text-xs uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-4 text-center font-black text-xs uppercase tracking-wider">Current</th>
                  <th className="px-6 py-4 text-center font-black text-xs uppercase tracking-wider">Min</th>
                  <th className="px-6 py-4 text-center font-black text-xs uppercase tracking-wider">Status</th>
                  <th className="px-8 py-4 text-right font-black text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.map((product) => {
                  const current = product.stock || 0;
                  const min = product.minStock || 10;
                  const isLow = current <= min;
                  const isEmpty = current === 0;

                  return (
                    <tr key={product.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-8 py-5 font-bold text-foreground">{product.name}</td>
                      <td className="px-6 py-5 text-sm text-muted-foreground font-mono">{product.sku || "N/A"}</td>
                      <td className="px-6 py-5 text-center font-black text-lg">{current}</td>
                      <td className="px-6 py-5 text-center text-muted-foreground font-semibold">{min}</td>
                      <td className="px-6 py-5 text-center">
                        <span className={`px-3 py-1.5 rounded-full text-[10px] font-black tracking-tight uppercase ${
                          isEmpty ? "bg-destructive/10 text-destructive" :
                          isLow ? "bg-amber-500/10 text-amber-600" :
                          "bg-emerald-500/10 text-emerald-600"
                        }`}>
                          {isEmpty ? "Out" : isLow ? "Low" : "Good"}
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex justify-end items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-lg hover:bg-primary/10 hover:text-primary"
                            onClick={() => handleAdjustStock(product.id, -1)}
                            disabled={current === 0}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>

                          <Dialog open={adjustId === product.id} onOpenChange={(open) => !open && setAdjustId(null)}>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                className="h-9 px-3 text-xs font-black rounded-lg border-border/50"
                                onClick={() => {
                                  setAdjustId(product.id);
                                  setAdjustQty(current.toString());
                                }}
                              >
                                Set
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[300px] rounded-2xl">
                              <DialogHeader>
                                <DialogTitle className="font-black">Set Stock Level</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 pt-4">
                                <p className="text-sm text-muted-foreground">{product.name}</p>
                                <Input
                                  type="number"
                                  min="0"
                                  value={adjustQty}
                                  onChange={(e) => setAdjustQty(e.target.value)}
                                  className="h-12 text-center text-lg font-black rounded-xl border-border/50"
                                  autoFocus
                                />
                                <Button
                                  className="w-full h-11 font-black rounded-xl bg-primary"
                                  onClick={() => handleSetStock(product.id, adjustQty)}
                                  disabled={updateProduct.isPending}
                                >
                                  Confirm
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-lg hover:bg-primary/10 hover:text-primary"
                            onClick={() => handleAdjustStock(product.id, 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="p-16 text-center text-muted-foreground">
              <Package className="h-16 w-16 mx-auto mb-4 opacity-10" />
              <p>No products found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
