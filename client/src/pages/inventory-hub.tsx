import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { useBranchBusiness } from "@/hooks/use-branch-business";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";
import {
  Package, Trash2, ArrowRightLeft, ShoppingCart, Plus, CheckCircle2,
  XCircle, AlertTriangle, TrendingDown, TrendingUp, ChevronRight,
  Flame, Clock, AlertCircle, Zap, BarChart3, Box,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type WasteEntry = {
  id: number; itemName: string; quantity: string; unit: string | null;
  reason: string; costImpact: string; note: string | null; createdAt: string;
  productId: number | null; ingredientId: number | null;
};

type Transfer = {
  id: number; fromBranchId: number | null; toBranchId: number | null;
  status: string; notes: string | null; createdAt: string;
  items: { id: number; productId: number; productName: string; quantity: number; note: string | null }[];
};

type ReorderSuggestion = {
  productId: number; productName: string; currentStock: number;
  lowStockThreshold: number; soldLast30Days: number; avgDailySales: number;
  daysOfStockLeft: number; suggestedOrderQty: number;
  preferredSupplierId: number | null; preferredSupplierName: string | null;
  unitCost: string | null;
};

type Product = { id: number; name: string; stock: number | null; trackStock: boolean; lowStockThreshold: number | null; price: string; };
type Ingredient = { id: number; name: string; unit: string; stockQty: string; lowStockThreshold: string | null; costPerUnit: string; };

const WASTE_REASONS = [
  { value: "expired", label: "Expired", color: "text-red-500" },
  { value: "damaged", label: "Damaged", color: "text-orange-500" },
  { value: "theft", label: "Theft / Loss", color: "text-rose-500" },
  { value: "sample", label: "Sample / Demo", color: "text-blue-500" },
  { value: "cooking_loss", label: "Cooking Loss", color: "text-amber-500" },
  { value: "other", label: "Other", color: "text-gray-500" },
];

const REASON_ICONS: Record<string, string> = {
  expired: "⏰", damaged: "💥", theft: "🔓", sample: "🧪", cooking_loss: "🍳", other: "📋",
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  in_transit: { label: "In Transit", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  received: { label: "Received", color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  rejected: { label: "Rejected", color: "bg-red-500/10 text-red-600 dark:text-red-400" },
};

type Tab = "overview" | "waste" | "transfers" | "reorder" | "ingredients";

export default function InventoryHub() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showWasteForm, setShowWasteForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const { businessType } = useBranchBusiness();
  const isFoodBeverage = businessType === "food_beverage";
  const currency = (settings as { currency?: string })?.currency || "₱";

  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: ingredients = [] } = useQuery<Ingredient[]>({ queryKey: ["/api/ingredients"] });
  const { data: wasteLogs = [], isLoading: wasteLoading } = useQuery<WasteEntry[]>({ queryKey: ["/api/waste-log"] });
  const { data: transfers = [], isLoading: transferLoading } = useQuery<Transfer[]>({ queryKey: ["/api/stock-transfers"] });

  // For food_beverage: fetch ingredient-based reorder suggestions
  // For retail: fetch product-based reorder suggestions
  const reorderQueryKey = isFoodBeverage
    ? ["/api/inventory/ingredient-reorder-suggestions"]
    : ["/api/inventory/reorder-suggestions"];
  const { data: reorderSuggestions = [], isLoading: reorderLoading } = useQuery<ReorderSuggestion[]>({ queryKey: reorderQueryKey });

  const trackedProducts = products.filter(p => p.trackStock);
  const lowStockCount = isFoodBeverage
    ? ingredients.filter(i => Number(i.stockQty || "0") <= Number(i.lowStockThreshold || "0")).length
    : trackedProducts.filter(p => (p.stock ?? 0) <= (p.lowStockThreshold ?? 10)).length;
  const outOfStockCount = isFoodBeverage
    ? ingredients.filter(i => Number(i.stockQty || "0") === 0).length
    : trackedProducts.filter(p => (p.stock ?? 0) === 0).length;
  const totalWasteCost = wasteLogs.reduce((s, e) => s + Number(e.costImpact || 0), 0);
  const pendingTransfers = transfers.filter(t => t.status === "pending" || t.status === "in_transit").length;

  // For food_beverage: tabs are Overview, Waste Log, Transfers, Ingredients (with reorder inside)
  // For retail: tabs are Overview, Waste Log, Transfers, Reorder
  const adjustStockMutation = useMutation({
    mutationFn: ({ id, delta }: { id: number; delta: number }) =>
      apiRequest("POST", `/api/ingredients/${id}/stock`, { delta }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] });
    },
    onError: () => toast({ title: "Failed to adjust stock", variant: "destructive" }),
  });

  const TABS: { id: Tab; label: string; icon: typeof Package; badge?: number }[] = isFoodBeverage
    ? [
        { id: "overview", label: "Overview", icon: BarChart3 },
        { id: "waste", label: "Waste Log", icon: Trash2, badge: wasteLogs.length },
        { id: "transfers", label: "Transfers", icon: ArrowRightLeft, badge: pendingTransfers || undefined },
        { id: "ingredients", label: "Ingredients", icon: Package, badge: lowStockCount || undefined },
      ]
    : [
        { id: "overview", label: "Overview", icon: BarChart3 },
        { id: "waste", label: "Waste Log", icon: Trash2, badge: wasteLogs.length },
        { id: "transfers", label: "Transfers", icon: ArrowRightLeft, badge: pendingTransfers || undefined },
        { id: "reorder", label: "Reorder", icon: ShoppingCart, badge: reorderSuggestions.length || undefined },
      ];

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Box className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
              <span>Inventory Hub</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-snug">
              Stock management, waste tracking &amp; smart reordering
            </p>
          </div>
        </div>

        {/* Tabs — horizontally scrollable on mobile */}
        <div className="overflow-x-auto -mx-3 sm:-mx-4 lg:-mx-6 px-3 sm:px-4 lg:px-6 scrollbar-none">
          <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit min-w-full sm:min-w-0">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  data-testid={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all relative whitespace-nowrap flex-1 justify-center sm:flex-none sm:justify-start",
                    activeTab === tab.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{tab.label}</span>
                  {tab.badge != null && tab.badge > 0 && (
                    <span className="ml-0.5 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <div className="space-y-4 sm:space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              {isFoodBeverage ? (
                <>
                  <KpiCard icon={Package} label="Ingredients" value={String(ingredients.length)} color="blue" />
                  <KpiCard icon={AlertTriangle} label="Low Stock" value={String(lowStockCount)} color="amber" urgent={lowStockCount > 0} />
                  <KpiCard icon={XCircle} label="Out of Stock" value={String(outOfStockCount)} color="red" urgent={outOfStockCount > 0} />
                  <KpiCard icon={Trash2} label="Waste Cost" value={formatCurrency(totalWasteCost, currency)} color="orange" />
                </>
              ) : (
                <>
                  <KpiCard icon={Package} label="Tracked Items" value={String(trackedProducts.length)} color="blue" />
                  <KpiCard icon={AlertTriangle} label="Low Stock" value={String(lowStockCount)} color="amber" urgent={lowStockCount > 0} />
                  <KpiCard icon={XCircle} label="Out of Stock" value={String(outOfStockCount)} color="red" urgent={outOfStockCount > 0} />
                  <KpiCard icon={Trash2} label="Waste Cost" value={formatCurrency(totalWasteCost, currency)} color="orange" />
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {/* Stock List — ingredients for food_beverage, products for retail */}
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-primary shrink-0" /> {isFoodBeverage ? "All Ingredients" : "Low Stock Items"}
                  </h3>
                  <button onClick={() => setActiveTab("reorder")} className="text-xs text-primary flex items-center gap-0.5 hover:underline shrink-0">
                    Reorder <ChevronRight className="h-3 w-3" />
                  </button>
                </div>

                {isFoodBeverage ? (
                  <>
                    {ingredients.slice(0, isFoodBeverage ? 20 : 6).map(i => {
                      const stock = Number(i.stockQty || "0");
                      const thresh = Number(i.lowStockThreshold || "0");
                      const isLow = thresh > 0 && stock <= thresh;
                      const isOut = stock === 0;
                      return (
                        <div key={i.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 gap-2">
                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <span className="text-sm truncate">{i.name}</span>
                            {(isOut || isLow) && (
                              <span className={["text-[10px] font-bold shrink-0", isOut ? "text-rose-500" : "text-amber-500"].join(" ")}>
                                {isOut ? "OUT" : "LOW"}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0 mr-1">{i.unit}</span>
                          <span className={["text-xs font-mono font-bold tabular-nums shrink-0 min-w-[30px] text-right", isOut ? "text-rose-500" : isLow ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"].join(" ")}>
                            {i.stockQty}
                          </span>
                        </div>
                      );
                    })}
                    {ingredients.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No ingredients yet. Add them from More → Ingredients.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {trackedProducts.filter(p => (p.stock ?? 0) <= (p.lowStockThreshold ?? 10)).slice(0, 6).map(p => (
                      <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 gap-2">
                        <span className="text-sm truncate flex-1 min-w-0">{p.name}</span>
                        <span className={["text-xs font-mono font-bold tabular-nums shrink-0", (p.stock ?? 0) === 0 ? "text-red-500" : "text-amber-500"].join(" ")}>
                          {p.stock ?? 0} left
                        </span>
                      </div>
                    ))}
                    {trackedProducts.filter(p => (p.stock ?? 0) <= (p.lowStockThreshold ?? 10)).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">All items adequately stocked</p>
                    )}
                  </>
                )}
              </div>

              {/* Recent waste */}
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-1.5">
                    <Trash2 className="h-4 w-4 text-rose-500 shrink-0" /> Recent Waste
                  </h3>
                  <button onClick={() => setActiveTab("waste")} className="text-xs text-primary flex items-center gap-0.5 hover:underline shrink-0">
                    View All <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {wasteLogs.slice(0, 5).map(e => (
                  <div key={e.id} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-base shrink-0">{REASON_ICONS[e.reason] ?? "📋"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{e.itemName}</p>
                      <p className="text-xs text-muted-foreground">{e.quantity} {e.unit} · {e.reason}</p>
                    </div>
                    <span className="text-sm font-mono text-rose-500 shrink-0">-{formatCurrency(e.costImpact, currency)}</span>
                  </div>
                ))}
                {wasteLogs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No waste logged yet</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── WASTE LOG TAB ── */}
        {activeTab === "waste" && (
          <WasteTab
            logs={wasteLogs}
            isLoading={wasteLoading}
            products={products}
            ingredients={ingredients}
            currency={currency}
            onAdd={() => setShowWasteForm(true)}
          />
        )}

        {/* ── TRANSFERS TAB ── */}
        {activeTab === "transfers" && (
          <TransfersTab
            transfers={transfers}
            isLoading={transferLoading}
            onAdd={() => setShowTransferForm(true)}
          />
        )}

        {/* ── INGREDIENTS TAB (food_beverage only) — with reorder embedded */}
        {activeTab === "ingredients" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {ingredients.length} ingredient{ingredients.length !== 1 ? "s" : ""} · {lowStockCount} low, {outOfStockCount} out
              </p>
              <Button
                onClick={() => setShowAddIngredient(true)}
                size="sm"
                className="shrink-0"
                data-testid="button-add-ingredient-tab"
              >
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>

            {/* Full ingredient list with quick adjust */}
            <div className="space-y-1.5">
              {ingredients.length === 0 && (
                <div className="glass-card rounded-2xl p-8 text-center">
                  <Package className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No ingredients yet. Tap Add to start tracking your stock.</p>
                </div>
              )}
              {ingredients.map(i => {
                const stock = Number(i.stockQty || "0");
                const thresh = Number(i.lowStockThreshold || "0");
                const isLow = thresh > 0 && stock <= thresh;
                const isOut = stock === 0;
                return (
                  <div key={i.id} className="bg-card rounded-xl border border-border/30 px-3.5 py-3 flex items-center gap-3 shadow-sm">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm truncate">{i.name}</span>
                        {(isOut || isLow) && (
                          <span className={["text-[10px] font-bold shrink-0", isOut ? "text-rose-500" : "text-amber-500"].join(" ")}>
                            {isOut ? "OUT" : "LOW"}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{i.unit}</span>
                        {Number(i.costPerUnit || "0") > 0 && (
                          <span className="text-[10px] text-muted-foreground/60">
                            {formatCurrency(i.costPerUnit, currency)}/{i.unit}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => adjustStockMutation.mutate({ id: i.id, delta: -1 })}
                        className="h-7 w-7 rounded-lg hover:bg-rose-500/10 hover:text-rose-500 flex items-center justify-center text-muted-foreground/60 transition-colors"
                        title="Deduct 1"
                      >
                        <TrendingDown className="h-3 w-3" />
                      </button>
                      <div className="text-center min-w-[36px]">
                        <span className={["text-sm font-bold tabular-nums", isOut ? "text-rose-500" : isLow ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"].join(" ")}>
                          {i.stockQty}
                        </span>
                      </div>
                      <button
                        onClick={() => adjustStockMutation.mutate({ id: i.id, delta: 1 })}
                        className="h-7 w-7 rounded-lg hover:bg-emerald-500/10 hover:text-emerald-600 flex items-center justify-center text-muted-foreground/60 transition-colors"
                        title="Add 1"
                      >
                        <TrendingUp className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reorder suggestions embedded */}
            {reorderSuggestions.length > 0 && (
              <div className="pt-4">
                <h3 className="font-semibold text-sm flex items-center gap-1.5 mb-3 text-muted-foreground">
                  <ShoppingCart className="h-4 w-4 text-primary" />
                  Reorder Suggestions
                  <span className="ml-auto text-xs font-normal text-muted-foreground/60">based on 30-day consumption</span>
                </h3>
                <ReorderTab suggestions={reorderSuggestions} isLoading={reorderLoading} currency={currency} />
              </div>
            )}
          </div>
        )}

        {/* ── REORDER TAB (retail only) ── */}
        {activeTab === "reorder" && !isFoodBeverage && (
          <ReorderTab
            suggestions={reorderSuggestions}
            isLoading={reorderLoading}
            currency={currency}
          />
        )}
      </div>
      {/* Waste Log Form Dialog */}
      {showWasteForm && (
        <WasteLogForm
          products={products}
          ingredients={ingredients}
          currency={currency}
          isFoodBeverage={isFoodBeverage}
          onClose={() => setShowWasteForm(false)}
          onSuccess={() => {
            setShowWasteForm(false);
            queryClient.invalidateQueries({ queryKey: ["/api/waste-log"] });
            queryClient.invalidateQueries({ queryKey: ["/api/products"] });
            queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] });
            toast({ title: "Waste logged", description: "Stock has been updated." });
          }}
        />
      )}

      {/* Transfer Form Dialog */}
      {showTransferForm && (
        <TransferForm
          products={products}
          onClose={() => setShowTransferForm(false)}
          onSuccess={() => {
            setShowTransferForm(false);
            queryClient.invalidateQueries({ queryKey: ["/api/stock-transfers"] });
            queryClient.invalidateQueries({ queryKey: ["/api/products"] });
            toast({ title: "Transfer created", description: "Stock deducted from source branch." });
          }}
        />
      )}

      {/* Add Ingredient Dialog */}
      {showAddIngredient && (
        <Dialog open onOpenChange={() => setShowAddIngredient(false)}>
          <DialogContent className="sm:max-w-[460px] max-w-[calc(100vw-24px)] rounded-3xl border-none shadow-2xl">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-xl font-black flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Quick Add Ingredient
              </DialogTitle>
            </DialogHeader>
            <QuickIngredientForm
              onClose={() => setShowAddIngredient(false)}
              onSuccess={() => {
                setShowAddIngredient(false);
                queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] });
                toast({ title: "Ingredient added", description: "Stock tracking started." });
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color, urgent }: {
  icon: typeof Package; label: string; value: string; color: string; urgent?: boolean;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  };
  return (
    <div className={["glass-card rounded-2xl p-3 sm:p-4 space-y-2", urgent ? "ring-1 ring-inset ring-amber-500/20" : ""].join(" ")}>
      <div className={["w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0", colorMap[color]].join(" ")}>
        <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </div>
      <p className="text-xl sm:text-2xl font-bold tabular-nums leading-none">{value}</p>
      <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

function WasteTab({ logs, isLoading, products, ingredients, currency, onAdd }: {
  logs: WasteEntry[]; isLoading: boolean; products: Product[]; ingredients: Ingredient[];
  currency: string; onAdd: () => void;
}) {
  const totalCost = logs.reduce((s, e) => s + Number(e.costImpact || 0), 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground min-w-0">
          Total: <span className="font-bold text-rose-500">{formatCurrency(totalCost, currency)}</span>
        </p>
        <Button onClick={onAdd} size="sm" className="shrink-0" data-testid="button-log-waste">
          <Plus className="h-4 w-4 mr-1" /> Log Waste
        </Button>
      </div>

      <div className="space-y-2">
        {logs.length === 0 && (
          <div className="glass-card rounded-2xl p-8 text-center">
            <Trash2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No waste entries yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Log expired, damaged, or spoiled items to track shrinkage costs.</p>
          </div>
        )}
        {logs.map(entry => (
          <div key={entry.id} className="glass-card rounded-xl p-3 flex items-center gap-3">
            <span className="text-xl shrink-0">{REASON_ICONS[entry.reason] ?? "📋"}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">{entry.itemName}</p>
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
                  {WASTE_REASONS.find(r => r.value === entry.reason)?.label ?? entry.reason}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {entry.quantity} {entry.unit ?? "pcs"} · {format(new Date(entry.createdAt), "MMM d, yyyy")}
                {entry.note && ` · ${entry.note}`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-rose-500">-{formatCurrency(entry.costImpact, currency)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransfersTab({ transfers, isLoading, onAdd }: {
  transfers: Transfer[]; isLoading: boolean; onAdd: () => void;
}) {
  const { toast } = useToast();

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/stock-transfers/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Transfer updated" });
    },
    onError: () => toast({ title: "Failed to update transfer", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{transfers.length} transfer{transfers.length !== 1 ? "s" : ""}</p>
        <Button onClick={onAdd} size="sm" className="shrink-0" data-testid="button-create-transfer">
          <Plus className="h-4 w-4 mr-1" /> New Transfer
        </Button>
      </div>

      <div className="space-y-3">
        {transfers.length === 0 && (
          <div className="glass-card rounded-2xl p-8 text-center">
            <ArrowRightLeft className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No stock transfers yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Move inventory between branches with a full audit trail.</p>
          </div>
        )}
        {transfers.map(t => {
          const cfg = STATUS_CONFIG[t.status] ?? { label: t.status, color: "bg-secondary" };
          return (
            <div key={t.id} className="glass-card rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">Transfer #{t.id}</p>
                    <span className={["text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", cfg.color].join(" ")}>{cfg.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Branch {t.fromBranchId ?? "?"} → Branch {t.toBranchId ?? "?"} · {format(new Date(t.createdAt), "MMM d, yyyy")}
                  </p>
                  {t.notes && <p className="text-xs text-muted-foreground/70 mt-0.5 italic truncate">{t.notes}</p>}
                </div>
              </div>

              {/* Action buttons — full width on mobile so they never overflow */}
              {(t.status === "pending" || t.status === "in_transit") && (
                <div className="flex gap-2">
                  {t.status === "pending" && (
                    <>
                      <Button size="sm" variant="outline" className="flex-1 sm:flex-none h-8 text-xs"
                        data-testid={`button-transit-transfer-${t.id}`}
                        onClick={() => statusMutation.mutate({ id: t.id, status: "in_transit" })}>
                        <TrendingDown className="h-3 w-3 mr-1" /> Ship
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 sm:flex-none h-8 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
                        data-testid={`button-reject-transfer-${t.id}`}
                        onClick={() => statusMutation.mutate({ id: t.id, status: "rejected" })}>
                        <XCircle className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </>
                  )}
                  {t.status === "in_transit" && (
                    <Button size="sm" className="flex-1 sm:flex-none h-8 text-xs bg-green-600 hover:bg-green-700"
                      data-testid={`button-receive-transfer-${t.id}`}
                      onClick={() => statusMutation.mutate({ id: t.id, status: "received" })}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Received
                    </Button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {t.items.map(item => (
                  <span key={item.id} className="text-[11px] bg-muted px-2 py-0.5 rounded-full">
                    {item.productName} × {item.quantity}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReorderTab({ suggestions, isLoading, currency }: {
  suggestions: ReorderSuggestion[]; isLoading: boolean; currency: string;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const allSelected = suggestions.length > 0 && selected.size === suggestions.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(suggestions.map(s => s.productId)));
  const toggle = (id: number) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });

  const generatePoMutation = useMutation({
    mutationFn: (items: typeof suggestions) => {
      const grouped = new Map<number | null, typeof suggestions>();
      for (const s of items) {
        const key = s.preferredSupplierId;
        const arr = grouped.get(key) ?? [];
        arr.push(s);
        grouped.set(key, arr);
      }
      const promises = [...grouped.entries()].map(([supplierId, group]) =>
        apiRequest("POST", "/api/inventory/generate-reorder-po", {
          supplierId,
          items: group.map(s => ({
            productId: s.productId,
            productName: s.productName,
            quantity: s.suggestedOrderQty,
            unitCost: s.unitCost ?? "0",
          })),
        })
      );
      return Promise.all(promises);
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      toast({ title: `${results.length} Purchase Order${results.length !== 1 ? "s" : ""} Created`, description: "Go to Purchases to review and send." });
      setSelected(new Set());
    },
    onError: () => toast({ title: "Failed to create PO", variant: "destructive" }),
  });

  const selectedItems = suggestions.filter(s => selected.has(s.productId));

  const urgencyColor = (days: number) => {
    if (days === 0) return "text-red-500";
    if (days <= 3) return "text-rose-500";
    if (days <= 7) return "text-amber-500";
    return "text-yellow-500";
  };

  const urgencyBg = (days: number) => {
    if (days === 0) return "bg-red-500/10 border border-red-500/20";
    if (days <= 3) return "bg-rose-500/10 border border-rose-500/20";
    if (days <= 7) return "bg-amber-500/10 border border-amber-500/20";
    return "bg-yellow-500/10 border border-yellow-500/20";
  };

  return (
    <div className="space-y-4">
      {/* Header — stacks on mobile, side-by-side on tablet+ */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {suggestions.length} item{suggestions.length !== 1 ? "s" : ""} need restocking
        </p>
        <div className="flex gap-2 flex-wrap">
          {suggestions.length > 0 && (
            <Button size="sm" variant="outline" onClick={toggleAll} className="flex-1 sm:flex-none" data-testid="button-select-all-reorder">
              {allSelected ? "Deselect All" : "Select All"}
            </Button>
          )}
          {selected.size > 0 && (
            <Button size="sm" onClick={() => generatePoMutation.mutate(selectedItems)}
              disabled={generatePoMutation.isPending}
              className="flex-1 sm:flex-none"
              data-testid="button-generate-po">
              <Zap className="h-3.5 w-3.5 mr-1" />
              {generatePoMutation.isPending ? "Creating..." : `Generate PO (${selected.size})`}
            </Button>
          )}
        </div>
      </div>

      {suggestions.length === 0 && (
        <div className="glass-card rounded-2xl p-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">All tracked items are above their reorder threshold.</p>
        </div>
      )}

      <div className="space-y-2">
        {suggestions.map(s => (
          <div
            key={s.productId}
            data-testid={`reorder-row-${s.productId}`}
            onClick={() => toggle(s.productId)}
            className={[
              "glass-card rounded-xl p-3 cursor-pointer transition-all",
              selected.has(s.productId) ? "ring-2 ring-primary ring-inset" : "hover:bg-muted/30",
            ].join(" ")}
          >
            {/* Top row: checkbox + name + supplier tag + urgency + qty */}
            <div className="flex items-center gap-2 sm:gap-3">
              <input type="checkbox" checked={selected.has(s.productId)} onChange={() => toggle(s.productId)}
                className="h-4 w-4 rounded accent-primary shrink-0" onClick={e => e.stopPropagation()} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-semibold text-sm">{s.productName}</p>
                  {s.preferredSupplierName && (
                    <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground shrink-0">
                      via {s.preferredSupplierName}
                    </span>
                  )}
                </div>
              </div>

              {/* Right side: urgency + suggested qty — always visible, never pushed off */}
              <div className="flex items-center gap-2 shrink-0">
                <div className={["text-center px-2 py-1 rounded-lg text-xs font-bold min-w-[40px]", urgencyBg(s.daysOfStockLeft), urgencyColor(s.daysOfStockLeft)].join(" ")}>
                  <Clock className="h-3 w-3 mx-auto mb-0.5" />
                  {s.daysOfStockLeft >= 999 ? "N/A" : `${s.daysOfStockLeft}d`}
                </div>
                <div className="text-right min-w-[36px]">
                  <p className="text-sm font-bold text-primary tabular-nums">×{s.suggestedOrderQty}</p>
                  <p className="text-[10px] text-muted-foreground">order</p>
                </div>
              </div>
            </div>

            {/* Stats row — wraps naturally */}
            <div className="flex items-center gap-x-3 gap-y-1 mt-1.5 ml-6 flex-wrap">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Box className="h-3 w-3 shrink-0" /> {s.currentStock} in stock
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Flame className="h-3 w-3 shrink-0" /> {s.soldLast30Days} / 30d
              </span>
              {s.avgDailySales > 0 && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 shrink-0" /> {s.avgDailySales}/day
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {suggestions.length > 0 && (
        <div className="glass-card rounded-xl p-3 flex items-start gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Suggestions based on 30-day sales velocity × 14-day reorder window × 1.2× safety factor.</span>
        </div>
      )}
    </div>
  );
}

function WasteLogForm({ products, ingredients, currency, isFoodBeverage, onClose, onSuccess }: {
  products: Product[]; ingredients: Ingredient[]; currency: string;
  isFoodBeverage?: boolean;
  onClose: () => void; onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    type: (isFoodBeverage ? "ingredient" : "product") as "product" | "ingredient" | "manual",
    productId: "",
    ingredientId: "",
    itemName: "",
    quantity: "",
    unit: isFoodBeverage ? "kg" : "pcs",
    reason: isFoodBeverage ? "cooking_loss" : "expired",
    costImpact: "",
    note: "",
  });

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/waste-log", {
      productId: form.type === "product" && form.productId ? Number(form.productId) : null,
      ingredientId: form.type === "ingredient" && form.ingredientId ? Number(form.ingredientId) : null,
      itemName: form.type === "product"
        ? (products.find(p => String(p.id) === form.productId)?.name ?? form.itemName)
        : form.type === "ingredient"
        ? (ingredients.find(i => String(i.id) === form.ingredientId)?.name ?? form.itemName)
        : form.itemName,
      quantity: form.quantity,
      unit: form.type === "ingredient"
        ? (ingredients.find(i => String(i.id) === form.ingredientId)?.unit ?? form.unit)
        : form.unit,
      reason: form.reason,
      costImpact: form.costImpact || "0",
      note: form.note || undefined,
    }),
    onSuccess,
  });

  const set = (key: keyof typeof form, val: string) => setForm(f => ({ ...f, [key]: val }));

  const selectedProduct = products.find(p => String(p.id) === form.productId);
  const selectedIngredient = ingredients.find(i => String(i.id) === form.ingredientId);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-md sm:w-full rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trash2 className="h-4 w-4" /> Log Waste / Write-off</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Item Type</label>
            <div className="flex gap-2 mt-1.5">
              {(["product", "ingredient", "manual"] as const).map(t => (
                <button key={t} onClick={() => set("type", t)}
                  className={["flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize",
                    form.type === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"].join(" ")}>
                  {t === "manual" ? "Other" : t}
                </button>
              ))}
            </div>
          </div>

          {form.type === "product" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Product</label>
              <Select value={form.productId} onValueChange={v => set("productId", v)}>
                <SelectTrigger className="mt-1" data-testid="select-waste-product">
                  <SelectValue placeholder="Select product..." />
                </SelectTrigger>
                <SelectContent>
                  {products.filter(p => p.trackStock).map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.stock ?? 0} in stock)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProduct && (
                <p className="text-xs text-muted-foreground mt-1">Current stock: {selectedProduct.stock ?? 0} units</p>
              )}
            </div>
          )}

          {form.type === "ingredient" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Ingredient</label>
              <Select value={form.ingredientId} onValueChange={v => set("ingredientId", v)}>
                <SelectTrigger className="mt-1" data-testid="select-waste-ingredient">
                  <SelectValue placeholder="Select ingredient..." />
                </SelectTrigger>
                <SelectContent>
                  {ingredients.map(i => (
                    <SelectItem key={i.id} value={String(i.id)}>{i.name} ({i.stockQty} {i.unit})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedIngredient && (
                <p className="text-xs text-muted-foreground mt-1">Current stock: {selectedIngredient.stockQty} {selectedIngredient.unit}</p>
              )}
            </div>
          )}

          {form.type === "manual" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Item Name</label>
              <Input className="mt-1" placeholder="e.g. Paper bags, Cleaning supplies" value={form.itemName}
                onChange={e => set("itemName", e.target.value)} data-testid="input-waste-item-name" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Quantity</label>
              <Input className="mt-1" type="number" min="0" step="any" placeholder="0"
                value={form.quantity} onChange={e => set("quantity", e.target.value)} data-testid="input-waste-quantity" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Unit</label>
              <Select value={form.unit} onValueChange={v => set("unit", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["pcs", "kg", "g", "l", "ml", "box", "bag", "bottle"].map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Reason</label>
            <Select value={form.reason} onValueChange={v => set("reason", v)}>
              <SelectTrigger className="mt-1" data-testid="select-waste-reason"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WASTE_REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{REASON_ICONS[r.value]} {r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Cost Impact ({currency})</label>
            <Input className="mt-1" type="number" min="0" step="0.01" placeholder="0.00"
              value={form.costImpact} onChange={e => set("costImpact", e.target.value)} data-testid="input-waste-cost" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
            <Textarea className="mt-1 resize-none" rows={2} placeholder="Additional details..."
              value={form.note} onChange={e => set("note", e.target.value)} data-testid="input-waste-note" />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={() => mutation.mutate()} disabled={mutation.isPending}
              data-testid="button-submit-waste">
              {mutation.isPending ? "Logging..." : "Log Waste"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuickIngredientForm({ onClose, onSuccess }: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [stockQty, setStockQty] = useState("0");
  const [threshold, setThreshold] = useState("0");
  const [cost, setCost] = useState("0");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/ingredients", {
        name: name.trim(),
        unit,
        stockQty: stockQty || "0",
        lowStockThreshold: threshold || "0",
        costPerUnit: cost || "0",
      }),
    onSuccess,
    onError: () => toast({ title: "Failed to add ingredient", variant: "destructive" }),
  });

  return (
    <div className="space-y-4 pt-2">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Ingredient Name</label>
        <Input
          className="mt-1 h-11 rounded-xl bg-secondary border-none"
          placeholder="e.g. Coffee Beans, Whole Milk"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Unit</label>
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger className="mt-1 h-11 rounded-xl bg-secondary border-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["g", "kg", "ml", "l", "pcs", "cup", "tbsp", "tsp", "oz", "lb", "box", "bag", "bottle", "pack"].map(u => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Cost/Unit</label>
          <Input
            className="mt-1 h-11 rounded-xl bg-secondary border-none"
            type="number" min="0" step="0.01" placeholder="0.00"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Current Stock</label>
          <Input
            className="mt-1 h-11 rounded-xl bg-secondary border-none"
            type="number" min="0" step="0.01" placeholder="0"
            value={stockQty}
            onChange={(e) => setStockQty(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Low Stock Alert At</label>
          <Input
            className="mt-1 h-11 rounded-xl bg-secondary border-none"
            type="number" min="0" step="0.01" placeholder="0"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" onClick={() => mutation.mutate()} disabled={mutation.isPending || !name.trim()}>
          {mutation.isPending ? "Adding..." : "Add Ingredient"}
        </Button>
      </div>
    </div>
  );
}

function TransferForm({ products, onClose, onSuccess }: {
  products: Product[]; onClose: () => void; onSuccess: () => void;
}) {
  const [fromBranch, setFromBranch] = useState("");
  const [toBranch, setToBranch] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ productId: string; quantity: string }[]>([{ productId: "", quantity: "1" }]);
  const { toast } = useToast();

  const addItem = () => setItems(prev => [...prev, { productId: "", quantity: "1" }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const setItem = (i: number, key: "productId" | "quantity", val: string) =>
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [key]: val } : item));

  const mutation = useMutation({
    mutationFn: () => {
      const validItems = items.filter(i => i.productId && Number(i.quantity) > 0);
      if (validItems.length === 0) throw new Error("Add at least one item");
      return apiRequest("POST", "/api/stock-transfers", {
        fromBranchId: fromBranch ? Number(fromBranch) : null,
        toBranchId: toBranch ? Number(toBranch) : null,
        notes: notes || undefined,
        items: validItems.map(i => ({
          productId: Number(i.productId),
          productName: products.find(p => String(p.id) === i.productId)?.name ?? "Unknown",
          quantity: Number(i.quantity),
        })),
      });
    },
    onSuccess,
    onError: (e: Error) => toast({ title: e.message || "Failed to create transfer", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-lg sm:w-full rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" /> New Stock Transfer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">From Branch ID</label>
              <Input className="mt-1" type="number" placeholder="Branch ID" value={fromBranch}
                onChange={e => setFromBranch(e.target.value)} data-testid="input-transfer-from" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">To Branch ID</label>
              <Input className="mt-1" type="number" placeholder="Branch ID" value={toBranch}
                onChange={e => setToBranch(e.target.value)} data-testid="input-transfer-to" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Items to Transfer</label>
              <button onClick={addItem} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                <Plus className="h-3 w-3" /> Add item
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <Select value={item.productId} onValueChange={v => setItem(i, "productId", v)}>
                    <SelectTrigger className="flex-1 min-w-0" data-testid={`select-transfer-product-${i}`}>
                      <SelectValue placeholder="Select product..." />
                    </SelectTrigger>
                    <SelectContent>
                      {products.filter(p => p.trackStock).map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.stock ?? 0})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="number" min="1" className="w-16 shrink-0" value={item.quantity}
                    onChange={e => setItem(i, "quantity", e.target.value)} data-testid={`input-transfer-qty-${i}`} />
                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
            <Textarea className="mt-1 resize-none" rows={2} placeholder="Reason for transfer..."
              value={notes} onChange={e => setNotes(e.target.value)} data-testid="input-transfer-notes" />
          </div>

          <div className="glass-card rounded-xl p-3 flex items-start gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>Stock is deducted from source branch immediately. Destination branch stock updates when you mark the transfer as Received.</span>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={() => mutation.mutate()} disabled={mutation.isPending}
              data-testid="button-submit-transfer">
              {mutation.isPending ? "Creating..." : "Create Transfer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
