import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, ShoppingBag, Trash2, ChevronDown, ChevronUp, CheckCircle, XCircle,
  Package, TrendingUp, DollarSign, AlertTriangle, Clock, Calendar,
  CreditCard, Loader2, Search, Filter, BarChart3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import type { Supplier, Product } from "@shared/schema";

type POStatus = "pending" | "received" | "cancelled";
type PaymentStatus = "unpaid" | "partial" | "paid";

interface POItem {
  productId?: number | null;
  productName: string;
  quantity: number;
  unitCost: string;
  totalCost: string;
}

interface PO {
  id: number;
  supplierId?: number | null;
  status: POStatus;
  paymentStatus?: PaymentStatus | null;
  totalAmount: string;
  notes?: string | null;
  expectedDeliveryAt?: string | null;
  orderedAt?: string | null;
  receivedAt?: string | null;
  createdAt?: string | null;
  items: POItem[];
}

interface SupplierProductRow {
  id: number; productId: number; productName: string; unitCost: string; minOrderQty: number; leadDays: number | null; currentStock: number | null;
}

const STATUS_CONFIG: Record<POStatus, { label: string; class: string }> = {
  pending:   { label: "Pending",   class: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  received:  { label: "Received",  class: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  cancelled: { label: "Cancelled", class: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
};

const PAYMENT_CONFIG: Record<PaymentStatus, { label: string; class: string }> = {
  unpaid:  { label: "Unpaid",   class: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
  partial: { label: "Partial",  class: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  paid:    { label: "Paid",     class: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
};

const EMPTY_ITEM: POItem = { productId: null, productName: "", quantity: 1, unitCost: "0", totalCost: "0" };

function StatCard({ label, value, sub, icon: Icon, color = "text-primary" }: { label: string; value: string; sub?: string; icon: any; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg bg-muted ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function PurchasesPage() {
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const currency = settings?.currency ?? "₱";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [supplierId, setSupplierId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [items, setItems] = useState<POItem[]>([{ ...EMPTY_ITEM }]);

  // Filters
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPayment, setFilterPayment] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: pos = [], isLoading } = useQuery<PO[]>({ queryKey: ["/api/purchase-orders"] });
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"] });

  // When a supplier is selected in the create dialog, fetch their product catalog
  const { data: supplierCatalog = [] } = useQuery<SupplierProductRow[]>({
    queryKey: ["/api/suppliers", supplierId, "products"],
    queryFn: () => apiRequest("GET", `/api/suppliers/${supplierId}/products`).then(r => r.json()),
    enabled: !!supplierId && supplierId !== "",
  });

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
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/purchase-orders"] });
      const previous = queryClient.getQueryData<PO[]>(["/api/purchase-orders"]);
      queryClient.setQueryData<PO[]>(["/api/purchase-orders"], (old) => old ? old.map(p => p.id === id ? { ...p, status: "received" as POStatus } : p) : []);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(["/api/purchase-orders"], ctx.previous); toast({ title: "Failed to receive PO", variant: "destructive" }); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Received — stock updated" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/purchase-orders/${id}/cancel`),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/purchase-orders"] });
      const previous = queryClient.getQueryData<PO[]>(["/api/purchase-orders"]);
      queryClient.setQueryData<PO[]>(["/api/purchase-orders"], (old) => old ? old.map(p => p.id === id ? { ...p, status: "cancelled" as POStatus } : p) : []);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(["/api/purchase-orders"], ctx.previous); toast({ title: "Failed to cancel PO", variant: "destructive" }); },
    onSuccess: () => toast({ title: "Purchase order cancelled" }),
  });

  const paymentMutation = useMutation({
    mutationFn: ({ id, paymentStatus }: { id: number; paymentStatus: string }) =>
      apiRequest("PATCH", `/api/purchase-orders/${id}/payment`, { paymentStatus }),
    onMutate: async ({ id, paymentStatus }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/purchase-orders"] });
      const previous = queryClient.getQueryData<PO[]>(["/api/purchase-orders"]);
      queryClient.setQueryData<PO[]>(["/api/purchase-orders"], (old) =>
        old ? old.map(p => p.id === id ? { ...p, paymentStatus: paymentStatus as PaymentStatus } : p) : []
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(["/api/purchase-orders"], ctx.previous); toast({ title: "Failed to update payment", variant: "destructive" }); },
    onSuccess: () => toast({ title: "Payment status updated" }),
  });

  function closeDialog() {
    setDialogOpen(false);
    setSupplierId("");
    setNotes("");
    setExpectedDelivery("");
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
        if (product) {
          next[i].productName = product.name;
          // Auto-fill cost from supplier catalog if available
          const catalogEntry = supplierCatalog.find(c => c.productId === Number(value));
          if (catalogEntry) next[i].unitCost = catalogEntry.unitCost;
          const qty = Number(next[i].quantity);
          const cost = parseFloat(next[i].unitCost);
          next[i].totalCost = (qty * cost).toFixed(2);
        }
      }
      return next;
    });
  }

  // When supplier changes, offer to fill items from catalog
  function handleSupplierChange(val: string) {
    setSupplierId(val === "__none__" ? "" : val);
  }

  function fillFromCatalog() {
    if (supplierCatalog.length === 0) return;
    const catalogItems: POItem[] = supplierCatalog.map(c => ({
      productId: c.productId,
      productName: c.productName,
      quantity: c.minOrderQty,
      unitCost: c.unitCost,
      totalCost: (c.minOrderQty * parseFloat(c.unitCost)).toFixed(2),
    }));
    setItems(catalogItems);
    toast({ title: `Filled ${catalogItems.length} items from ${suppliers.find(s => s.id === Number(supplierId))?.name} catalog` });
  }

  function handleSubmit() {
    const validItems = items.filter(it => it.productName.trim() && Number(it.quantity) > 0);
    if (validItems.length === 0) { toast({ title: "Add at least one item", variant: "destructive" }); return; }
    createMutation.mutate({
      supplierId: supplierId ? Number(supplierId) : null,
      notes: notes || null,
      expectedDeliveryAt: expectedDelivery || null,
      items: validItems,
    });
  }

  const totalAmount = items.reduce((sum, it) => sum + parseFloat(it.totalCost || "0"), 0);
  const supplierMap = Object.fromEntries(suppliers.map(s => [s.id, s.name]));

  // Computed stats
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const pendingTotal = pos.filter(p => p.status === "pending").reduce((s, p) => s + parseFloat(p.totalAmount || "0"), 0);
  const receivedThisMonth = pos.filter(p => p.status === "received" && (p.receivedAt ?? "") >= monthStart)
    .reduce((s, p) => s + parseFloat(p.totalAmount || "0"), 0);
  const unpaidCount = pos.filter(p => p.status === "received" && (!p.paymentStatus || p.paymentStatus === "unpaid")).length;
  const totalOrders = pos.length;

  // Filtered list
  const filtered = useMemo(() => {
    let list = [...pos];
    if (filterSupplier !== "all") list = list.filter(p => String(p.supplierId) === filterSupplier);
    if (filterStatus !== "all") list = list.filter(p => p.status === filterStatus);
    if (filterPayment !== "all") list = list.filter(p => (p.paymentStatus ?? "unpaid") === filterPayment);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        String(p.id).includes(q) ||
        (p.supplierId && supplierMap[p.supplierId]?.toLowerCase().includes(q)) ||
        p.items.some(i => i.productName.toLowerCase().includes(q))
      );
    }
    return list;
  }, [pos, filterSupplier, filterStatus, filterPayment, search, supplierMap]);

  const hasFilters = filterSupplier !== "all" || filterStatus !== "all" || filterPayment !== "all" || search.trim();

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

      {/* Summary stats */}
      {pos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Orders" value={String(totalOrders)} icon={BarChart3} />
          <StatCard label="Pending Value" value={`${currency}${pendingTotal.toFixed(0)}`} icon={Clock} color="text-amber-600" />
          <StatCard label="Received This Month" value={`${currency}${receivedThisMonth.toFixed(0)}`} icon={TrendingUp} color="text-emerald-600" />
          <StatCard label="Awaiting Payment" value={String(unpaidCount)} sub="received, unpaid" icon={CreditCard} color={unpaidCount > 0 ? "text-red-500" : "text-muted-foreground"} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm w-44"
            data-testid="input-po-search"
          />
        </div>
        <Select value={filterSupplier} onValueChange={setFilterSupplier}>
          <SelectTrigger className="h-8 text-xs w-36" data-testid="select-filter-supplier">
            <SelectValue placeholder="All suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 text-xs w-32" data-testid="select-filter-status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPayment} onValueChange={setFilterPayment}>
          <SelectTrigger className="h-8 text-xs w-32" data-testid="select-filter-payment">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setFilterSupplier("all"); setFilterStatus("all"); setFilterPayment("all"); setSearch(""); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{hasFilters ? "No orders match filters" : "No purchase orders yet"}</p>
          <p className="text-sm mt-1">{hasFilters ? "Try adjusting your filters" : "Create a PO to restock your inventory"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(po => {
            const isExpanded = expandedId === po.id;
            const cfg = STATUS_CONFIG[po.status];
            const pmtStatus = (po.paymentStatus ?? "unpaid") as PaymentStatus;
            const pmtCfg = PAYMENT_CONFIG[pmtStatus];
            const isOverdue = po.status === "pending" && po.expectedDeliveryAt && new Date(po.expectedDeliveryAt) < now;

            return (
              <div key={po.id} data-testid={`card-po-${po.id}`}
                className={`bg-card border rounded-2xl overflow-hidden ${isOverdue ? "border-red-500/40" : "border-border"}`}>
                {/* Summary row */}
                <div className="p-4 flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : po.id)}
                    className="flex items-center gap-2 flex-1 min-w-0"
                    data-testid={`button-expand-po-${po.id}`}
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="min-w-0 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">PO #{po.id}</p>
                        {isOverdue && <span className="flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3 w-3" />Overdue</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {po.supplierId ? supplierMap[po.supplierId] ?? "Unknown" : "No supplier"} · {new Date(po.createdAt ?? "").toLocaleDateString()}
                        {po.expectedDeliveryAt && (
                          <span className="ml-2 text-muted-foreground">
                            · Expected {new Date(po.expectedDeliveryAt).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <Badge className={`${cfg.class} border text-xs`}>{cfg.label}</Badge>
                    {po.status === "received" && (
                      <Badge className={`${pmtCfg.class} border text-xs`}>{pmtCfg.label}</Badge>
                    )}
                    <p className="font-bold text-sm">{currency}{parseFloat(po.totalAmount).toFixed(2)}</p>
                  </div>

                  {po.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 h-7 text-xs"
                        onClick={() => receiveMutation.mutate(po.id)} disabled={receiveMutation.isPending}
                        data-testid={`button-receive-po-${po.id}`}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Receive
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 h-7 text-xs"
                        onClick={() => cancelMutation.mutate(po.id)} disabled={cancelMutation.isPending}
                        data-testid={`button-cancel-po-${po.id}`}>
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                      </Button>
                    </div>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/30">
                    {/* Items table */}
                    <div className="p-4 space-y-3">
                      {po.notes && <p className="text-xs text-muted-foreground italic">Note: {po.notes}</p>}
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

                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                        {po.receivedAt && <span>Received: {new Date(po.receivedAt).toLocaleString()}</span>}
                        {po.expectedDeliveryAt && <span>Expected: {new Date(po.expectedDeliveryAt).toLocaleDateString()}</span>}
                      </div>
                    </div>

                    {/* Payment status control (only for received orders) */}
                    {po.status === "received" && (
                      <div className="border-t border-border p-4 flex items-center gap-3">
                        <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="text-sm font-medium">Payment</p>
                        <div className="flex gap-2 ml-auto">
                          {(["unpaid", "partial", "paid"] as PaymentStatus[]).map(ps => (
                            <button
                              key={ps}
                              onClick={() => paymentMutation.mutate({ id: po.id, paymentStatus: ps })}
                              disabled={paymentMutation.isPending}
                              data-testid={`button-payment-${ps}-${po.id}`}
                              className={`px-3 py-1 text-xs rounded-full border transition-all ${
                                pmtStatus === ps
                                  ? PAYMENT_CONFIG[ps].class + " border-current font-semibold"
                                  : "border-border text-muted-foreground hover:border-foreground/30"
                              }`}
                            >
                              {PAYMENT_CONFIG[ps].label}
                            </button>
                          ))}
                          {paymentMutation.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        </div>
                      </div>
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
                <Select value={supplierId || "__none__"} onValueChange={handleSupplierChange}>
                  <SelectTrigger data-testid="select-po-supplier">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No supplier</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Expected Delivery</Label>
                <Input
                  type="date"
                  value={expectedDelivery}
                  onChange={e => setExpectedDelivery(e.target.value)}
                  className="text-sm"
                  data-testid="input-po-delivery"
                />
              </div>
            </div>

            {/* Supplier catalog auto-fill banner */}
            {supplierId && supplierCatalog.length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                <Package className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{suppliers.find(s => s.id === Number(supplierId))?.name} has {supplierCatalog.length} linked products</p>
                  <p className="text-xs text-muted-foreground">Auto-fill items with catalog prices?</p>
                </div>
                <Button size="sm" variant="outline" onClick={fillFromCatalog} className="shrink-0 border-primary/30 text-primary hover:bg-primary/10 text-xs" data-testid="button-fill-catalog">
                  Fill Catalog
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" rows={1} data-testid="input-po-notes" />
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
                    <Select
                      value={item.productId ? String(item.productId) : "__none__"}
                      onValueChange={v => updateItem(i, "productId", v === "__none__" ? null : v)}
                    >
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-po-product-${i}`}>
                        <SelectValue placeholder="Select or type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Custom item</SelectItem>
                        {products.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                            {supplierCatalog.find(c => c.productId === p.id) && " ★"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!item.productId && (
                      <Input className="h-7 text-xs mt-1" placeholder="Item name"
                        value={item.productName}
                        onChange={e => updateItem(i, "productName", e.target.value)}
                        data-testid={`input-po-item-name-${i}`} />
                    )}
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Qty</Label>}
                    <Input className="h-8 text-xs" type="number" min={1} value={item.quantity}
                      onChange={e => updateItem(i, "quantity", e.target.value)}
                      data-testid={`input-po-qty-${i}`} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Cost</Label>}
                    <Input className="h-8 text-xs" type="number" min={0} step="0.01" value={item.unitCost}
                      onChange={e => updateItem(i, "unitCost", e.target.value)}
                      data-testid={`input-po-cost-${i}`} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Total</Label>}
                    <p className="h-8 flex items-center text-xs font-medium px-1">{currency}{parseFloat(item.totalCost).toFixed(2)}</p>
                  </div>
                  <div className="col-span-1 flex items-end justify-end pb-0.5">
                    {items.length > 1 && (
                      <button onClick={() => setItems(p => p.filter((_, idx) => idx !== i))}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        data-testid={`button-remove-po-item-${i}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-3 flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="font-bold text-lg">{currency}{totalAmount.toFixed(2)}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-po">
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              <Package className="h-4 w-4 mr-1" /> Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
