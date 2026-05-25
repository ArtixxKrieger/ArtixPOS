import { useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Truck, Phone, Mail, MapPin, Pencil, Trash2, User, Loader2, Plus, Package,
  ShoppingBag, TrendingUp, Clock, AlertTriangle, ChevronRight, X,
  Calendar, BoxSelect, ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { useTranslation } from "react-i18next";
import type { Supplier, Product } from "@shared/schema";

interface SupplierForm {
  name: string; contactPerson: string; phone: string; email: string; address: string; notes: string;
}
const DEFAULT_FORM: SupplierForm = { name: "", contactPerson: "", phone: "", email: "", address: "", notes: "" };

interface SupplierStats { totalOrders: number; totalSpent: number; pendingAmount: number; lastOrderAt: string | null }
interface SupplierProductRow {
  id: number; supplierId: number; productId: number; unitCost: string;
  minOrderQty: number; leadDays: number | null; productName: string;
  productSku: string | null; currentStock: number | null;
}

function StatCard({ label, value, sub, icon: Icon, iconText, color = "text-primary" }: {
  label: string; value: string; sub?: string; icon?: any; iconText?: string; color?: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className={`p-2 rounded-lg bg-muted ${color} flex items-center justify-center min-w-[32px] min-h-[32px]`}>
        {Icon ? <Icon className="h-4 w-4" /> : <span className="text-xs font-bold leading-none">{iconText}</span>}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SupplierDetailSheet({
  supplier, open, onClose, onEdit, onNewOrder, currency,
}: {
  supplier: Supplier; open: boolean; onClose: () => void;
  onEdit: () => void; onNewOrder: () => void; currency: string;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addForm, setAddForm] = useState({ productId: "", unitCost: "", minOrderQty: "1", leadDays: "" });

  const { data: stats, isLoading: statsLoading } = useQuery<SupplierStats>({
    queryKey: ["/api/suppliers", supplier.id, "stats"],
    queryFn: () => apiRequest("GET", `/api/suppliers/${supplier.id}/stats`).then(r => r.json()),
    enabled: open,
  });

  const { data: spRows = [], isLoading: spLoading } = useQuery<SupplierProductRow[]>({
    queryKey: ["/api/suppliers", supplier.id, "products"],
    queryFn: () => apiRequest("GET", `/api/suppliers/${supplier.id}/products`).then(r => r.json()),
    enabled: open,
  });

  const { data: allProducts = [] } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: allPOs = [] } = useQuery<any[]>({ queryKey: ["/api/purchase-orders"] });

  const supplierPOs = allPOs.filter(p => p.supplierId === supplier.id).slice(0, 8);

  const linkedProductIds = new Set(spRows.map(r => r.productId));
  const availableProducts = allProducts.filter(p => !linkedProductIds.has(p.id));

  const addProductMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/suppliers/${supplier.id}/products`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplier.id, "products"] });
      toast({ title: t("suppliers.linkProduct") });
      setAddProductOpen(false);
      setAddForm({ productId: "", unitCost: "", minOrderQty: "1", leadDays: "" });
    },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
  });

  const removeProductMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/supplier-products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplier.id, "products"] });
      toast({ title: t("common.success") });
    },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
  });

  function handleAddProduct() {
    if (!addForm.productId) { toast({ title: t("suppliers.selectProduct"), variant: "destructive" }); return; }
    addProductMutation.mutate({
      productId: Number(addForm.productId),
      unitCost: addForm.unitCost || "0",
      minOrderQty: Number(addForm.minOrderQty) || 1,
      leadDays: addForm.leadDays ? Number(addForm.leadDays) : null,
    });
  }

  const lowStockItems = spRows.filter(r => r.currentStock !== null && r.currentStock <= r.minOrderQty);

  const STATUS_CFG: Record<string, { label: string; class: string }> = {
    pending:   { label: t("purchases.statusPending"),   class: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
    received:  { label: t("purchases.statusReceived"),  class: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    cancelled: { label: t("purchases.statusCancelled"), class: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0" side="right">
        {/* Header */}
        <div className="p-5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <SheetHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Truck className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-left leading-tight truncate">{supplier.name}</SheetTitle>
                  {supplier.contactPerson && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5 min-w-0">
                      <User className="h-3 w-3 shrink-0" />
                      <span className="truncate">{supplier.contactPerson}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={onEdit} data-testid="button-sheet-edit-supplier">
                  <Pencil className="h-3.5 w-3.5 mr-1" /> {t("common.edit")}
                </Button>
                <Button size="sm" onClick={onNewOrder} data-testid="button-sheet-new-order">
                  <Plus className="h-3.5 w-3.5 mr-1" /> {t("suppliers.newOrder")}
                </Button>
              </div>
            </div>
          </SheetHeader>

          {/* Contact row */}
          <div className="flex flex-wrap gap-3 mt-4">
            {supplier.phone && (
              <a href={`tel:${supplier.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Phone className="h-3 w-3" />{supplier.phone}
              </a>
            )}
            {supplier.email && (
              <a href={`mailto:${supplier.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Mail className="h-3 w-3" />{supplier.email}
              </a>
            )}
            {supplier.address && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />{supplier.address}
              </span>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          {(
            <>
              <div className="p-4 text-center">
                <p className="text-xl font-bold">{stats?.totalOrders ?? 0}</p>
                <p className="text-xs text-muted-foreground">{t("suppliers.totalOrders")}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xl font-bold text-emerald-600">{currency}{(stats?.totalSpent ?? 0).toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">{t("suppliers.totalSpent")}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xl font-bold text-amber-600">{currency}{(stats?.pendingAmount ?? 0).toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">{t("suppliers.pendingValue")}</p>
              </div>
            </>
          )}
        </div>

        {/* Low stock alert */}
        {lowStockItems.length > 0 && (
          <div className="mx-4 mt-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {lowStockItems.length} {t("suppliers.runningLow")}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                {lowStockItems.map(i => i.productName).join(", ")}
              </p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 border-amber-500/30 text-amber-700 hover:bg-amber-500/10 text-xs" onClick={onNewOrder}>
              {t("suppliers.reorder")}
            </Button>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="products" className="mt-4">
          <TabsList className="w-full rounded-none border-b border-border bg-transparent h-auto p-0">
            <TabsTrigger value="products" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-sm">
              <Package className="h-3.5 w-3.5 mr-1.5" />{t("suppliers.tabProducts")} ({spRows.length})
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-sm">
              <ShoppingBag className="h-3.5 w-3.5 mr-1.5" />{t("suppliers.tabOrders")} ({supplierPOs.length})
            </TabsTrigger>
            <TabsTrigger value="info" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-2.5 text-sm">
              <User className="h-3.5 w-3.5 mr-1.5" />{t("suppliers.tabInfo")}
            </TabsTrigger>
          </TabsList>

          {/* Products tab */}
          <TabsContent value="products" className="p-4 space-y-3 mt-0">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{t("suppliers.productsCarried")}</p>
              <Button size="sm" variant="outline" onClick={() => setAddProductOpen(true)} data-testid="button-link-product">
                <Plus className="h-3.5 w-3.5 mr-1" /> {t("suppliers.linkProduct")}
              </Button>
            </div>

            {spRows.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("suppliers.noProductsLinked")}</p>
                <p className="text-xs mt-1">{t("suppliers.linkProductsHint")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {spRows.map(row => {
                  const isLow = row.currentStock !== null && row.currentStock <= row.minOrderQty;
                  return (
                    <div key={row.id} data-testid={`row-supplier-product-${row.id}`}
                      className={`flex items-center gap-3 p-3 rounded-xl border ${isLow ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{row.productName}</p>
                          {isLow && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>{t("purchases.cost")}: <span className="font-medium text-foreground">{currency}{parseFloat(row.unitCost).toFixed(2)}</span></span>
                          <span>{t("suppliers.minOrder")}: {row.minOrderQty}</span>
                          {row.leadDays != null && <span>{t("suppliers.leadDays")}: {row.leadDays}d</span>}
                          {row.currentStock != null && (
                            <span className={isLow ? "text-amber-600 font-medium" : ""}>{t("suppliers.stock")}: {row.currentStock}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removeProductMutation.mutate(row.id)}
                        disabled={removeProductMutation.isPending}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 shrink-0"
                        data-testid={`button-remove-sp-${row.id}`}
                      >
                        {removeProductMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add product dialog */}
            <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>{t("suppliers.linkProductTo")} {supplier.name}</DialogTitle></DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1.5">
                    <Label>{t("purchases.product")}</Label>
                    <Select value={addForm.productId} onValueChange={v => setAddForm(f => ({ ...f, productId: v }))}>
                      <SelectTrigger data-testid="select-link-product">
                        <SelectValue placeholder={t("suppliers.selectProduct")} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableProducts.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("suppliers.unitCost")}</Label>
                      <Input type="number" min={0} step="0.01" value={addForm.unitCost}
                        onChange={e => setAddForm(f => ({ ...f, unitCost: e.target.value }))}
                        placeholder="0.00" className="h-8 text-xs" data-testid="input-sp-cost" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("suppliers.minOrder")}</Label>
                      <Input type="number" min={1} value={addForm.minOrderQty}
                        onChange={e => setAddForm(f => ({ ...f, minOrderQty: e.target.value }))}
                        className="h-8 text-xs" data-testid="input-sp-min" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("suppliers.leadDays")}</Label>
                      <Input type="number" min={0} value={addForm.leadDays}
                        onChange={e => setAddForm(f => ({ ...f, leadDays: e.target.value }))}
                        placeholder="—" className="h-8 text-xs" data-testid="input-sp-lead" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddProductOpen(false)}>{t("common.cancel")}</Button>
                  <Button onClick={handleAddProduct} disabled={addProductMutation.isPending} data-testid="button-save-sp">
                    {addProductMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                    {t("suppliers.linkProduct")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Orders tab */}
          <TabsContent value="orders" className="p-4 space-y-3 mt-0">
            {supplierPOs.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("suppliers.noSupplierOrders")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {supplierPOs.map(po => {
                  const cfg = STATUS_CFG[po.status as string] ?? STATUS_CFG.pending;
                  const pmtColor = po.paymentStatus === "paid" ? "text-emerald-600" : po.paymentStatus === "partial" ? "text-amber-600" : "text-muted-foreground";
                  return (
                    <div key={po.id} data-testid={`row-supplier-po-${po.id}`}
                      className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">PO #{po.id}</p>
                          <Badge className={`${cfg.class} border text-xs`}>{cfg.label}</Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          <span>{new Date(po.createdAt).toLocaleDateString()}</span>
                          <span className={pmtColor}>{po.paymentStatus ?? t("purchases.paymentUnpaid").toLowerCase()}</span>
                        </div>
                      </div>
                      <p className="font-bold text-sm shrink-0">{currency}{parseFloat(po.totalAmount).toFixed(2)}</p>
                    </div>
                  );
                })}
              </div>
            )}
            <Button variant="outline" className="w-full" size="sm" onClick={onNewOrder} data-testid="button-new-order-from-orders">
              <Plus className="h-3.5 w-3.5 mr-1" /> {t("suppliers.newPurchaseOrder")}
            </Button>
          </TabsContent>

          {/* Info tab */}
          <TabsContent value="info" className="p-4 space-y-4 mt-0">
            <div className="space-y-3">
              {supplier.contactPerson && (
                <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-xl">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("suppliers.contactPerson")}</p>
                    <p className="text-sm font-medium">{supplier.contactPerson}</p>
                  </div>
                </div>
              )}
              {supplier.phone && (
                <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-xl">
                  <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("common.phone")}</p>
                    <a href={`tel:${supplier.phone}`} className="text-sm font-medium text-primary">{supplier.phone}</a>
                  </div>
                </div>
              )}
              {supplier.email && (
                <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-xl">
                  <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("common.email")}</p>
                    <a href={`mailto:${supplier.email}`} className="text-sm font-medium text-primary">{supplier.email}</a>
                  </div>
                </div>
              )}
              {supplier.address && (
                <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-xl">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("common.address")}</p>
                    <p className="text-sm font-medium">{supplier.address}</p>
                  </div>
                </div>
              )}
              {supplier.notes && (
                <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-xl">
                  <BoxSelect className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("suppliers.notes")}</p>
                    <p className="text-sm">{supplier.notes}</p>
                  </div>
                </div>
              )}
              {stats?.lastOrderAt && (
                <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-xl">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t("suppliers.lastOrder")}</p>
                    <p className="text-sm font-medium">{new Date(stats.lastOrderAt).toLocaleDateString()}</p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {supplier.notes && (
          <p className="text-xs text-muted-foreground italic px-4 pb-4 border-t border-border pt-3 mt-2">{supplier.notes}</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function SuppliersPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const currency = settings?.currency ?? "₱";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(DEFAULT_FORM);
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [newOrderForSupplier, setNewOrderForSupplier] = useState<Supplier | null>(null);
  const debouncedSearch = useDebounce(search);

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const { data: allPOs = [] } = useQuery<any[]>({ queryKey: ["/api/purchase-orders"] });

  const createMutation = useMutation({
    mutationFn: (data: SupplierForm) => apiRequest("POST", "/api/suppliers", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] }); toast({ title: t("common.success") }); closeDialog(); },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SupplierForm> }) => apiRequest("PUT", `/api/suppliers/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] }); toast({ title: t("common.success") }); closeDialog(); },
    onError: () => toast({ title: t("common.error"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/suppliers/${id}`),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/suppliers"] });
      const previous = queryClient.getQueryData<any[]>(["/api/suppliers"]);
      queryClient.setQueryData<any[]>(["/api/suppliers"], (old) => old ? old.filter(s => s.id !== id) : []);
      return { previous };
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) queryClient.setQueryData(["/api/suppliers"], ctx.previous); toast({ title: t("common.error"), variant: "destructive" }); },
    onSuccess: () => { setDeleteTarget(null); setSelectedSupplier(null); toast({ title: t("common.success") }); },
  });

  function openCreate() { setEditing(null); setForm(DEFAULT_FORM); setDialogOpen(true); }
  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({ name: s.name, contactPerson: s.contactPerson ?? "", phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "", notes: s.notes ?? "" });
    setDialogOpen(true);
  }
  function closeDialog() { setDialogOpen(false); setEditing(null); setForm(DEFAULT_FORM); }

  function handleSubmit() {
    if (!form.name.trim()) { toast({ title: t("suppliers.businessName") + " required", variant: "destructive" }); return; }
    const data = { name: form.name, contactPerson: form.contactPerson || undefined, phone: form.phone || undefined, email: form.email || undefined, address: form.address || undefined, notes: form.notes || undefined };
    if (editing) updateMutation.mutate({ id: editing.id, data });
    else createMutation.mutate(form);
  }

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (s.contactPerson ?? "").toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (s.phone ?? "").includes(debouncedSearch)
  );

  const totalPending = allPOs.filter(p => p.status === "pending").reduce((s: number, p: any) => s + parseFloat(p.totalAmount || "0"), 0);
  const totalSpentAllTime = allPOs.filter(p => p.status === "received").reduce((s: number, p: any) => s + parseFloat(p.totalAmount || "0"), 0);
  const pendingCount = allPOs.filter(p => p.status === "pending").length;

  const supplierOrderMap = new Map<number, { count: number; lastAt: string | null; pending: number }>();
  for (const po of allPOs) {
    if (!po.supplierId) continue;
    const existing = supplierOrderMap.get(po.supplierId) ?? { count: 0, lastAt: null, pending: 0 };
    existing.count++;
    if (po.status === "pending") existing.pending++;
    if (!existing.lastAt || po.createdAt > existing.lastAt) existing.lastAt = po.createdAt;
    supplierOrderMap.set(po.supplierId, existing);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" /> {t("nav.suppliers")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{suppliers.length} {t("nav.suppliers").toLowerCase()}</p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-supplier">
          <Plus className="h-4 w-4 mr-1" /> {t("suppliers.addSupplier")}
        </Button>
      </div>

      {/* Summary stat cards */}
      {suppliers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={t("suppliers.totalSuppliers")} value={String(suppliers.length)} icon={Truck} />
          <StatCard label={t("suppliers.totalSpent")} value={`${currency}${totalSpentAllTime.toFixed(0)}`} icon={TrendingUp} color="text-emerald-600" />
          <StatCard label={t("suppliers.pendingValue")} value={`${currency}${totalPending.toFixed(0)}`} iconText={currency} color="text-amber-600" />
          <StatCard label={t("suppliers.openOrders")} value={String(pendingCount)} sub={t("suppliers.awaitingReceipt")} icon={ShoppingBag} color="text-blue-600" />
        </div>
      )}

      {/* Search */}
      <Input
        placeholder={t("suppliers.searchPlaceholder")}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-sm"
        data-testid="input-supplier-search"
      />

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search ? t("suppliers.noMatchSearch") : t("suppliers.noSuppliersYet")}</p>
          {!search && <p className="text-sm mt-1">{t("suppliers.noSuppliersHint")}</p>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(supplier => {
            const stats = supplierOrderMap.get(supplier.id);
            return (
              <button
                key={supplier.id}
                data-testid={`card-supplier-${supplier.id}`}
                onClick={() => setSelectedSupplier(supplier)}
                className="bg-card border border-border rounded-2xl p-4 space-y-3 hover:shadow-md hover:border-primary/30 transition-all text-left w-full group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-base truncate group-hover:text-primary transition-colors">{supplier.name}</p>
                    {supplier.contactPerson && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                        <User className="h-3 w-3 shrink-0" /><span className="truncate">{supplier.contactPerson}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {stats && stats.pending > 0 && (
                      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 border text-xs">{stats.pending} {t("suppliers.pendingValue").toLowerCase()}</Badge>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); openEdit(supplier); }}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      aria-label={`Edit ${supplier.name}`}
                      data-testid={`button-edit-supplier-${supplier.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(supplier); }}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      aria-label={`Delete ${supplier.name}`}
                      data-testid={`button-delete-supplier-${supplier.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>

                <div className="space-y-1">
                  {supplier.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /><span>{supplier.phone}</span>
                    </div>
                  )}
                  {supplier.email && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" /><span className="truncate">{supplier.email}</span>
                    </div>
                  )}
                </div>

                {/* Quick stats footer */}
                {stats ? (
                  <div className="flex items-center gap-3 pt-1 border-t border-border text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><ShoppingBag className="h-3 w-3" />{stats.count} {t("suppliers.tabOrders").toLowerCase()}</span>
                    {stats.lastAt && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(stats.lastAt).toLocaleDateString()}</span>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground border-t border-border pt-1">{t("suppliers.noOrdersYet")}</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Supplier Detail Sheet */}
      {selectedSupplier && (
        <SupplierDetailSheet
          supplier={selectedSupplier}
          open={!!selectedSupplier}
          onClose={() => setSelectedSupplier(null)}
          onEdit={() => { openEdit(selectedSupplier); setSelectedSupplier(null); }}
          onNewOrder={() => { setNewOrderForSupplier(selectedSupplier); setSelectedSupplier(null); }}
          currency={currency}
        />
      )}

      {/* New Order redirect dialog */}
      <Dialog open={!!newOrderForSupplier} onOpenChange={(v) => !v && setNewOrderForSupplier(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("suppliers.createPurchaseOrder")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Head to <strong>{t("nav.purchases")}</strong> to create a new order for <strong>{newOrderForSupplier?.name}</strong>.
            The supplier will be pre-selectable there.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOrderForSupplier(null)}>{t("common.cancel")}</Button>
            <Button onClick={() => { setNewOrderForSupplier(null); window.location.href = "/purchases"; }} data-testid="button-goto-purchases">
              <ExternalLink className="h-4 w-4 mr-1.5" /> {t("suppliers.goPurchases")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Supplier Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? t("suppliers.editSupplier") : t("suppliers.addSupplier")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>{t("suppliers.businessName")} *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Supplier Co." data-testid="input-supplier-name" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("suppliers.contactPerson")}</Label>
              <Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} placeholder="John Smith" data-testid="input-supplier-contact" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("common.phone")}</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555-0000" data-testid="input-supplier-phone" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.email")}</Label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@supplier.com" data-testid="input-supplier-email" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.address")}</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Supply St" data-testid="input-supplier-address" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("suppliers.notes")}</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes..." rows={2} data-testid="input-supplier-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-supplier">
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? t("suppliers.saveChanges") : t("suppliers.createSupplier")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("suppliers.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <><strong>{deleteTarget.name}</strong> {t("suppliers.deleteDesc")}</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-supplier"
            >
              {deleteMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />...</> : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
