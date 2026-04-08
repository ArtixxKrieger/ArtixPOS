import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ShoppingBag, Trash2, ChevronDown, ChevronUp, CheckCircle, XCircle, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import type { Supplier, Product } from "@shared/schema";

type POStatus = "pending" | "received" | "cancelled";
interface POItem { productId?: number | null; productName: string; quantity: number; unitCost: string; totalCost: string }
interface PO { id: number; supplierId?: number | null; status: POStatus; totalAmount: string; notes?: string | null; orderedAt?: string | null; receivedAt?: string | null; createdAt?: string | null; items: POItem[] }

const STATUS_CONFIG: Record<POStatus, { label: string; class: string }> = {
  pending:   { label: "Pending",   class: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  received:  { label: "Received",  class: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  cancelled: { label: "Cancelled", class: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
};

const EMPTY_ITEM: POItem = { productId: null, productName: "", quantity: 1, unitCost: "0", totalCost: "0" };

export default function PurchasesPage() {
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const currency = settings?.currency ?? "₱";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [supplierId, setSupplierId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POItem[]>([{ ...EMPTY_ITEM }]);

  const { data: pos = [], isLoading } = useQuery<PO[]>({ queryKey: ["/api/purchase-orders"] });
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/purchase-orders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Purchase order created" });
      closeDialog();
    },
    onError: () => toast({ title: "Failed to create PO", variant: "destructive" }),
  });

  const receiveMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/purchase-orders/${id}/receive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Purchase order marked as received — stock updated" });
    },
    onError: () => toast({ title: "Failed to receive PO", variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/purchase-orders/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Purchase order cancelled" });
    },
    onError: () => toast({ title: "Failed to cancel PO", variant: "destructive" }),
  });

  function closeDialog() {
    setDialogOpen(false);
    setSupplierId("");
    setNotes("");
    setItems([{ ...EMPTY_ITEM }]);
  }

  function updateItem(i: number, field: keyof POItem, value: any) {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === "quantity" || field === "unitCost") {
        const qty = field === "quantity" ? Number(value) : Number(next[i].quantity);
        const cost = field === "unitCost" ? Number(value) : Number(next[i].unitCost);
        next[i].totalCost = (qty * cost).toFixed(2);
      }
      if (field === "productId") {
        const product = products.find(p => p.id === Number(value));
        if (product) next[i].productName = product.name;
      }
      return next;
    });
  }

  function handleSubmit() {
    const validItems = items.filter(it => it.productName.trim() && Number(it.quantity) > 0);
    if (validItems.length === 0) { toast({ title: "Add at least one item", variant: "destructive" }); return; }
    createMutation.mutate({
      supplierId: supplierId ? Number(supplierId) : null,
      notes: notes || null,
      items: validItems,
    });
  }

  const totalAmount = items.reduce((sum, it) => sum + parseFloat(it.totalCost || "0"), 0);
  const supplierMap = Object.fromEntries(suppliers.map(s => [s.id, s.name]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" /> Purchase Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{pos.length} order{pos.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-create-po">
          <Plus className="h-4 w-4 mr-1" /> New Order
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}
        </div>
      ) : pos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No purchase orders yet</p>
          <p className="text-sm mt-1">Create a PO to restock your inventory</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pos.map(po => {
            const isExpanded = expandedId === po.id;
            const cfg = STATUS_CONFIG[po.status];
            return (
              <div key={po.id} data-testid={`card-po-${po.id}`} className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Summary row */}
                <div className="p-4 flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : po.id)}
                    className="flex items-center gap-2 flex-1 min-w-0"
                    data-testid={`button-expand-po-${po.id}`}
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="min-w-0 text-left">
                      <p className="font-semibold text-sm">PO #{po.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {po.supplierId ? supplierMap[po.supplierId] ?? "Unknown Supplier" : "No supplier"} · {new Date(po.createdAt ?? "").toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                  <Badge className={`${cfg.class} border text-xs shrink-0`}>{cfg.label}</Badge>
                  <p className="font-bold text-sm shrink-0">{currency}{parseFloat(po.totalAmount).toFixed(2)}</p>
                  {po.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10" onClick={() => receiveMutation.mutate(po.id)} disabled={receiveMutation.isPending} data-testid={`button-receive-po-${po.id}`}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Receive
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => cancelMutation.mutate(po.id)} disabled={cancelMutation.isPending} data-testid={`button-cancel-po-${po.id}`}>
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                    </div>
                  )}
                </div>

                {/* Expanded items */}
                {isExpanded && (
                  <div className="border-t border-border p-4 bg-muted/30 space-y-2">
                    {po.notes && <p className="text-xs text-muted-foreground italic mb-3">Note: {po.notes}</p>}
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border">
                          <th className="text-left py-1.5 font-medium">Product</th>
                          <th className="text-right py-1.5 font-medium">Qty</th>
                          <th className="text-right py-1.5 font-medium">Unit Cost</th>
                          <th className="text-right py-1.5 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {po.items.map((item, i) => (
                          <tr key={i} className="border-b border-border/50 last:border-0">
                            <td className="py-1.5">{item.productName}</td>
                            <td className="text-right py-1.5">{item.quantity}</td>
                            <td className="text-right py-1.5">{currency}{parseFloat(item.unitCost).toFixed(2)}</td>
                            <td className="text-right py-1.5 font-medium">{currency}{parseFloat(item.totalCost).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {po.receivedAt && (
                      <p className="text-xs text-muted-foreground pt-1">Received: {new Date(po.receivedAt).toLocaleString()}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create PO Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Supplier (optional)</Label>
                <Select value={supplierId} onValueChange={v => setSupplierId(v === "__none__" ? "" : v)}>
                  <SelectTrigger data-testid="select-po-supplier">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No supplier</SelectItem>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" rows={1} data-testid="input-po-notes" />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items</Label>
                <Button variant="ghost" size="sm" onClick={() => setItems(p => [...p, { ...EMPTY_ITEM }])} data-testid="button-add-po-item">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                </Button>
              </div>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5 space-y-1">
                    {i === 0 && <Label className="text-xs">Product</Label>}
                    <Select value={item.productId ? String(item.productId) : "__none__"} onValueChange={v => { updateItem(i, "productId", v === "__none__" ? null : v); }}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-po-product-${i}`}>
                        <SelectValue placeholder="Select or type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Custom item</SelectItem>
                        {products.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!item.productId && (
                      <Input
                        className="h-7 text-xs mt-1"
                        placeholder="Item name"
                        value={item.productName}
                        onChange={e => updateItem(i, "productName", e.target.value)}
                        data-testid={`input-po-item-name-${i}`}
                      />
                    )}
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Qty</Label>}
                    <Input className="h-8 text-xs" type="number" min={1} value={item.quantity} onChange={e => updateItem(i, "quantity", e.target.value)} data-testid={`input-po-qty-${i}`} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Cost</Label>}
                    <Input className="h-8 text-xs" type="number" min={0} step="0.01" value={item.unitCost} onChange={e => updateItem(i, "unitCost", e.target.value)} data-testid={`input-po-cost-${i}`} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Total</Label>}
                    <p className="h-8 flex items-center text-xs font-medium px-1">{currency}{parseFloat(item.totalCost).toFixed(2)}</p>
                  </div>
                  <div className="col-span-1 flex items-end justify-end pb-0.5">
                    {items.length > 1 && (
                      <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive transition-colors" data-testid={`button-remove-po-item-${i}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-3 flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="font-bold">{currency}{totalAmount.toFixed(2)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-po">
              <Package className="h-4 w-4 mr-1" /> Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
