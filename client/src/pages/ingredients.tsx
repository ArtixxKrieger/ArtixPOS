import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, nativeFetch } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency } from "@/lib/format";
import {
  Plus,
  Trash2,
  Edit2,
  Search,
  AlertTriangle,
  TrendingUp,
  Check,
  X,
  FlaskConical,
  Package,
  Download,
  ArrowUpDown,
  ShoppingBag,
  DollarSign,
  TriangleAlert,
  CircleSlash,
  Minus,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useDebounce } from "@/hooks/use-debounce";

type Ingredient = {
  id: number;
  name: string;
  unit: string;
  stockQty: string;
  lowStockThreshold: string | null;
  costPerUnit: string;
  notes: string | null;
  createdAt: string;
};

type ProductUsage = { id: number; name: string; quantity: string };

type FilterTab = "all" | "low" | "out";
type SortKey = "name" | "stock" | "cost" | "value";

const UNITS = [
  "g",
  "kg",
  "ml",
  "l",
  "pcs",
  "cup",
  "tbsp",
  "tsp",
  "oz",
  "lb",
  "box",
  "bag",
  "bottle",
  "pack",
];

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name (A–Z)",
  stock: "Stock Level",
  cost: "Cost / Unit",
  value: "Total Value",
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border/30 px-4 py-3 flex items-center gap-3 shadow-sm">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide truncate">
          {label}
        </p>
        <p className="text-lg font-black leading-tight tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  );
}

function UsedInBadge({ ingredientId }: { ingredientId: number }) {
  const { data: products = [] } = useQuery<ProductUsage[]>({
    queryKey: ["/api/ingredients", ingredientId, "products"],
    queryFn: () => nativeFetch(`/api/ingredients/${ingredientId}/products`).then((r) => r.json()),
    staleTime: 60_000,
  });
  if (products.length === 0) return null;
  return (
    <span
      className="text-[10px] text-primary/70 font-semibold bg-primary/8 rounded-md px-1.5 py-0.5 cursor-default"
      title={products.map((p) => `${p.name} (${p.quantity})`).join(", ")}
    >
      <ShoppingBag className="inline h-2.5 w-2.5 mr-0.5 -mt-0.5" />
      {products.length} product{products.length !== 1 ? "s" : ""}
    </span>
  );
}

function exportToCSV(ingredients: Ingredient[], _currency: string = "") {
  const rows = [
    [
      "Name",
      "Unit",
      "Stock Qty",
      "Cost / Unit",
      "Total Value",
      "Low Stock Threshold",
      "Status",
      "Notes",
    ],
    ...ingredients.map((ing) => {
      const stock = Number(ing.stockQty || "0");
      const cost = Number(ing.costPerUnit || "0");
      const threshold = Number(ing.lowStockThreshold || "0");
      const isOut = stock === 0;
      const isLow = !isOut && stock <= threshold && threshold > 0;
      const status = isOut ? "Out of Stock" : isLow ? "Low Stock" : "OK";
      return [
        ing.name,
        ing.unit,
        stock,
        cost,
        (stock * cost).toFixed(2),
        threshold,
        status,
        ing.notes || "",
      ];
    }),
  ];
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ingredients-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Ingredients() {
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const currency = (settings as { currency?: string })?.currency || "₱";

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleteTimer, setDeleteTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null);
  const [adjustAmt, setAdjustAmt] = useState("");
  const [adjustMode, setAdjustMode] = useState<"add" | "remove" | "set">("add");

  const [formName, setFormName] = useState("");
  const [formUnit, setFormUnit] = useState("kg");
  const [formStockQty, setFormStockQty] = useState("0");
  const [formThreshold, setFormThreshold] = useState("0");
  const [formCostPerUnit, setFormCostPerUnit] = useState("0");
  const [formNotes, setFormNotes] = useState("");

  const { data: ingredients = [], isLoading } = useQuery<
    { data: Ingredient[]; meta: unknown },
    Error,
    Ingredient[]
  >({
    queryKey: ["/api/ingredients"],
    select: (res) => res?.data ?? [],
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/ingredients", {
        name: formName.trim(),
        unit: formUnit,
        stockQty: formStockQty || "0",
        lowStockThreshold: formThreshold || "0",
        costPerUnit: formCostPerUnit || "0",
        notes: formNotes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] });
      resetForm();
      setIsDialogOpen(false);
      toast({ title: "Ingredient added", description: "Stock tracking started." });
    },
    onError: () => toast({ title: "Failed to add ingredient", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/ingredients/${editingId}`, {
        name: formName.trim(),
        unit: formUnit,
        stockQty: formStockQty || "0",
        lowStockThreshold: formThreshold || "0",
        costPerUnit: formCostPerUnit || "0",
        notes: formNotes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] });
      resetForm();
      setIsDialogOpen(false);
      setEditingId(null);
      toast({ title: "Ingredient updated" });
    },
    onError: () => toast({ title: "Failed to update ingredient", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/ingredients/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] });
      toast({ title: "Ingredient deleted" });
    },
    onError: () => toast({ title: "Failed to delete ingredient", variant: "destructive" }),
  });

  const adjustStockMutation = useMutation({
    mutationFn: ({ id, delta }: { id: number; delta: number }) =>
      apiRequest("POST", `/api/ingredients/${id}/stock`, { delta }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] });
      setAdjustOpen(false);
      setAdjustTarget(null);
      setAdjustAmt("");
      toast({ title: "Stock updated" });
    },
    onError: () => toast({ title: "Failed to adjust stock", variant: "destructive" }),
  });

  const resetForm = () => {
    setFormName("");
    setFormUnit("kg");
    setFormStockQty("0");
    setFormThreshold("0");
    setFormCostPerUnit("0");
    setFormNotes("");
  };

  const openCreate = () => {
    setEditingId(null);
    resetForm();
    setIsDialogOpen(true);
  };

  const openEdit = (ing: Ingredient) => {
    setEditingId(ing.id);
    setFormName(ing.name);
    setFormUnit(ing.unit);
    setFormStockQty(ing.stockQty);
    setFormThreshold(ing.lowStockThreshold || "0");
    setFormCostPerUnit(ing.costPerUnit || "0");
    setFormNotes(ing.notes || "");
    setIsDialogOpen(true);
  };

  const openAdjust = (ing: Ingredient) => {
    setAdjustTarget(ing);
    setAdjustAmt("");
    setAdjustMode("add");
    setAdjustOpen(true);
  };

  const confirmAdjust = () => {
    if (!adjustTarget) return;
    const amt = Number(adjustAmt);
    if (!Number.isFinite(amt) || amt === 0) return;
    const currentStock = Number(adjustTarget.stockQty || "0");
    let delta = 0;
    if (adjustMode === "add") delta = amt;
    else if (adjustMode === "remove") delta = -amt;
    else if (adjustMode === "set") delta = amt - currentStock;
    adjustStockMutation.mutate({ id: adjustTarget.id, delta });
  };

  const requestDelete = (id: number) => {
    if (deleteTimer) clearTimeout(deleteTimer);
    setPendingDeleteId(id);
    const t = setTimeout(() => setPendingDeleteId(null), 3000);
    setDeleteTimer(t);
  };
  const confirmDelete = (id: number) => {
    if (deleteTimer) clearTimeout(deleteTimer);
    setPendingDeleteId(null);
    deleteMutation.mutate(id);
  };
  const cancelDelete = () => {
    if (deleteTimer) clearTimeout(deleteTimer);
    setPendingDeleteId(null);
  };

  const stats = useMemo(() => {
    const low = ingredients.filter((i) => {
      const s = Number(i.stockQty || "0"),
        t = Number(i.lowStockThreshold || "0");
      return s > 0 && t > 0 && s <= t;
    });
    const out = ingredients.filter((i) => Number(i.stockQty || "0") === 0);
    const totalValue = ingredients.reduce(
      (sum, i) => sum + Number(i.stockQty || "0") * Number(i.costPerUnit || "0"),
      0,
    );
    return { total: ingredients.length, low: low.length, out: out.length, totalValue };
  }, [ingredients]);

  const filtered = useMemo(() => {
    let list = ingredients;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    if (filterTab === "low") {
      list = list.filter((i) => {
        const s = Number(i.stockQty || "0"),
          t = Number(i.lowStockThreshold || "0");
        return s > 0 && t > 0 && s <= t;
      });
    } else if (filterTab === "out") {
      list = list.filter((i) => Number(i.stockQty || "0") === 0);
    }
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "stock") return Number(b.stockQty || "0") - Number(a.stockQty || "0");
      if (sortKey === "cost") return Number(b.costPerUnit || "0") - Number(a.costPerUnit || "0");
      if (sortKey === "value") {
        const av = Number(a.stockQty || "0") * Number(a.costPerUnit || "0");
        const bv = Number(b.stockQty || "0") * Number(b.costPerUnit || "0");
        return bv - av;
      }
      return 0;
    });
  }, [ingredients, debouncedSearch, filterTab, sortKey]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "low", label: "Low Stock", count: stats.low },
    { key: "out", label: "Out of Stock", count: stats.out },
  ];

  return (
    <div className="space-y-4 page-enter">
      {}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Ingredients
          </h2>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">
            {stats.total} ingredient{stats.total !== 1 ? "s" : ""} · {stats.low} low · {stats.out}{" "}
            out
          </p>
        </div>

        <div className="flex w-full sm:w-auto gap-2">
          <div className="relative flex-1 sm:w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search ingredients…"
              className="pl-9 h-10 bg-card border-none rounded-2xl shadow-sm text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-ingredients"
            />
          </div>

          {}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-2xl border-none bg-card shadow-sm shrink-0"
                data-testid="button-sort-ingredients"
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <DropdownMenuItem
                  key={k}
                  onClick={() => setSortKey(k)}
                  className="flex items-center justify-between"
                >
                  {SORT_LABELS[k]}
                  {sortKey === k && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {}
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-2xl border-none bg-card shadow-sm shrink-0"
            onClick={() => exportToCSV(filtered, currency)}
            title="Export CSV"
            data-testid="button-export-ingredients"
          >
            <Download className="h-4 w-4" />
          </Button>

          <Button
            onClick={openCreate}
            className="rounded-2xl h-10 px-4 shadow-md shrink-0"
            data-testid="button-add-ingredient"
          >
            <Plus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline text-sm font-semibold">Add</span>
          </Button>
        </div>
      </div>

      {}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatCard
            icon={Package}
            label="Total Items"
            value={stats.total}
            sub="tracked ingredients"
            color="bg-primary/10 text-primary"
          />
          <StatCard
            icon={DollarSign}
            label="Inventory Value"
            value={formatCurrency(stats.totalValue.toFixed(2), currency)}
            sub="stock × cost"
            color="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            icon={TriangleAlert}
            label="Low Stock"
            value={stats.low}
            sub={stats.low === 0 ? "all good" : "need restock"}
            color={
              stats.low > 0
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-muted/40 text-muted-foreground"
            }
          />
          <StatCard
            icon={CircleSlash}
            label="Out of Stock"
            value={stats.out}
            sub={stats.out === 0 ? "none depleted" : "depleted"}
            color={
              stats.out > 0 ? "bg-rose-500/10 text-rose-500" : "bg-muted/40 text-muted-foreground"
            }
          />
        </div>
      )}

      {}
      <div className="flex gap-1.5 bg-muted/40 rounded-2xl p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key)}
            data-testid={`tab-filter-${tab.key}`}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filterTab === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                  tab.key === "low"
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : tab.key === "out"
                      ? "bg-rose-500/15 text-rose-500"
                      : "bg-primary/10 text-primary"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {}
      {!isLoading && filtered.length === 0 ? (
        <div className="glass-card rounded-3xl py-16 px-6 text-center flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center">
            <FlaskConical className="h-8 w-8 opacity-20" strokeWidth={1.5} />
          </div>
          <p className="font-bold text-base">
            {search
              ? "No results found"
              : filterTab !== "all"
                ? `No ${filterTab === "low" ? "low stock" : "out of stock"} items`
                : "No ingredients yet"}
          </p>
          <p className="text-sm text-muted-foreground/70 max-w-xs leading-relaxed">
            {search
              ? `No ingredients match "${search}"`
              : filterTab !== "all"
                ? "Everything looks good in this category."
                : "Add raw materials you use in your products — coffee beans, flour, milk, etc."}
          </p>
          {!search && filterTab === "all" && (
            <Button onClick={openCreate} className="mt-2 rounded-2xl" size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Add first ingredient
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2 pb-20 sm:pb-4">
          {filtered.map((ing) => {
            const stock = Number(ing.stockQty || "0");
            const threshold = Number(ing.lowStockThreshold || "0");
            const cost = Number(ing.costPerUnit || "0");
            const totalValue = stock * cost;
            const isLow = stock <= threshold && threshold > 0 && stock > 0;
            const isOut = stock === 0;
            const isPendingDelete = pendingDeleteId === ing.id;

            const stockColor = isOut
              ? "text-rose-500"
              : isLow
                ? "text-amber-500 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400";

            const stockBg = isOut
              ? "bg-rose-500/10"
              : isLow
                ? "bg-amber-500/10"
                : "bg-emerald-500/10";

            return (
              <div
                key={ing.id}
                data-testid={`ingredient-row-${ing.id}`}
                className="bg-card rounded-2xl border border-border/30 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                {}
                <div className="flex items-center gap-3 px-3.5 py-3">
                  {}
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${stockBg}`}
                  >
                    <Package className={`h-5 w-5 ${stockColor} opacity-70`} strokeWidth={1.5} />
                  </div>

                  {}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm leading-tight truncate">{ing.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 px-1.5 font-semibold rounded-md"
                      >
                        {ing.unit}
                      </Badge>
                      {cost > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatCurrency(cost.toFixed(2), currency)}/{ing.unit}
                        </span>
                      )}
                      {threshold > 0 && (
                        <span className="text-[10px] text-muted-foreground/60">
                          min&nbsp;{threshold}
                        </span>
                      )}
                      <UsedInBadge ingredientId={ing.id} />
                    </div>
                  </div>

                  {}
                  <div className="text-right shrink-0">
                    <p className={`font-black text-base tabular-nums leading-none ${stockColor}`}>
                      {ing.stockQty}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                      {ing.unit}
                    </p>
                    {cost > 0 && (
                      <p className="text-[10px] text-muted-foreground/60 tabular-nums">
                        {formatCurrency(totalValue.toFixed(2), currency)}
                      </p>
                    )}
                    {(isOut || isLow) && (
                      <div className="flex items-center gap-0.5 justify-end mt-0.5">
                        <AlertTriangle
                          className={`h-3 w-3 ${isOut ? "text-rose-500" : "text-amber-500"}`}
                        />
                        <span
                          className={`text-[10px] font-bold ${isOut ? "text-rose-500" : "text-amber-500"}`}
                        >
                          {isOut ? "OUT" : "LOW"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {}
                <div className="flex items-center border-t border-border/20 px-2 py-1.5 gap-1">
                  {}
                  <button
                    onClick={() => adjustStockMutation.mutate({ id: ing.id, delta: -1 })}
                    className="flex items-center gap-1 h-8 px-2.5 rounded-xl hover:bg-rose-500/10 hover:text-rose-500 text-muted-foreground/60 transition-colors active:scale-95 text-xs font-medium"
                    title="Deduct 1"
                    data-testid={`button-deduct-${ing.id}`}
                  >
                    <Minus className="h-3.5 w-3.5" />
                    <span className="hidden xs:inline">−1</span>
                  </button>
                  <button
                    onClick={() => adjustStockMutation.mutate({ id: ing.id, delta: 1 })}
                    className="flex items-center gap-1 h-8 px-2.5 rounded-xl hover:bg-emerald-500/10 hover:text-emerald-600 text-muted-foreground/60 transition-colors active:scale-95 text-xs font-medium"
                    title="Add 1"
                    data-testid={`button-add-stock-${ing.id}`}
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span className="hidden xs:inline">+1</span>
                  </button>

                  {}
                  <button
                    onClick={() => openAdjust(ing)}
                    className="flex items-center gap-1 h-8 px-2.5 rounded-xl hover:bg-primary/10 hover:text-primary text-muted-foreground/60 transition-colors active:scale-95 text-xs font-medium"
                    title="Adjust stock"
                    data-testid={`button-adjust-${ing.id}`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Adjust</span>
                  </button>

                  <div className="flex-1" />

                  {}
                  {isPendingDelete ? (
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-destructive font-semibold mr-1 hidden xs:inline">
                        Delete?
                      </span>
                      <button
                        onClick={() => confirmDelete(ing.id)}
                        className="h-8 px-3 rounded-xl bg-destructive/10 text-destructive text-xs font-bold hover:bg-destructive/20 transition-colors flex items-center gap-1"
                        data-testid={`button-confirm-delete-${ing.id}`}
                      >
                        <Check className="h-3.5 w-3.5" /> Yes
                      </button>
                      <button
                        onClick={cancelDelete}
                        className="h-8 px-3 rounded-xl hover:bg-muted text-muted-foreground text-xs font-medium transition-colors flex items-center gap-1"
                        data-testid={`button-cancel-delete-${ing.id}`}
                      >
                        <X className="h-3.5 w-3.5" /> No
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(ing)}
                        className="h-8 w-8 rounded-xl hover:bg-primary/10 hover:text-primary flex items-center justify-center text-muted-foreground transition-colors active:scale-95"
                        title="Edit ingredient"
                        data-testid={`button-edit-${ing.id}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => requestDelete(ing.id)}
                        className="h-8 w-8 rounded-xl hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground/50 transition-colors active:scale-95"
                        title="Delete ingredient"
                        data-testid={`button-delete-${ing.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {}
      <Dialog
        open={adjustOpen}
        onOpenChange={(v) => {
          setAdjustOpen(v);
          if (!v) setAdjustTarget(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-24px)] sm:max-w-[360px] rounded-3xl border-none shadow-2xl p-0">
          <div className="px-5 pt-5 pb-3 border-b border-border/30">
            <DialogHeader>
              <DialogTitle className="text-base font-black flex items-center gap-2">
                <div className="h-7 w-7 rounded-xl bg-primary/10 flex items-center justify-center">
                  <RefreshCw className="h-3.5 w-3.5 text-primary" />
                </div>
                Adjust Stock — {adjustTarget?.name}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="px-5 py-4 space-y-4">
            {adjustTarget && (
              <div className="bg-muted/40 rounded-xl px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Current stock</span>
                <span className="font-black tabular-nums">
                  {adjustTarget.stockQty}{" "}
                  <span className="font-medium text-muted-foreground">{adjustTarget.unit}</span>
                </span>
              </div>
            )}
            {}
            <div className="grid grid-cols-3 gap-1.5 bg-muted/40 rounded-xl p-1">
              {(["add", "remove", "set"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setAdjustMode(m)}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                    adjustMode === m
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground"
                  }`}
                  data-testid={`button-adjust-mode-${m}`}
                >
                  {m === "add" ? "+ Add" : m === "remove" ? "− Remove" : "= Set"}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {adjustMode === "set" ? "New quantity" : "Amount"} ({adjustTarget?.unit})
              </label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                className="h-11 rounded-xl bg-muted/50 border-none text-base font-bold"
                placeholder={adjustMode === "set" ? `Current: ${adjustTarget?.stockQty}` : "0"}
                value={adjustAmt}
                onChange={(e) => setAdjustAmt(e.target.value)}
                autoFocus
                data-testid="input-adjust-amount"
              />
            </div>
            {adjustAmt && adjustTarget && (
              <div className="bg-muted/30 rounded-xl px-4 py-2 text-xs text-muted-foreground">
                New stock will be:{" "}
                <span className="font-black text-foreground tabular-nums">
                  {adjustMode === "set"
                    ? Number(adjustAmt)
                    : adjustMode === "add"
                      ? Number(adjustTarget.stockQty) + Number(adjustAmt)
                      : Math.max(0, Number(adjustTarget.stockQty) - Number(adjustAmt))}{" "}
                  {adjustTarget.unit}
                </span>
              </div>
            )}
          </div>
          <div className="px-5 pb-5 pt-2">
            <Button
              className="w-full rounded-2xl h-11 font-bold"
              disabled={!adjustAmt || Number(adjustAmt) <= 0 || adjustStockMutation.isPending}
              onClick={confirmAdjust}
              data-testid="button-confirm-adjust"
            >
              {adjustStockMutation.isPending ? "Saving…" : "Confirm Adjustment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(v) => {
          setIsDialogOpen(v);
          if (!v) {
            resetForm();
            setEditingId(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-24px)] sm:max-w-[460px] max-h-[90dvh] overflow-y-auto rounded-3xl border-none shadow-2xl p-0">
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-5 pt-5 pb-3 border-b border-border/30">
            <DialogHeader>
              <DialogTitle className="text-lg font-black flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FlaskConical className="h-4 w-4 text-primary" />
                </div>
                {editingId ? "Edit Ingredient" : "New Ingredient"}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Ingredient Name
              </label>
              <Input
                className="h-11 rounded-xl bg-muted/50 border-none focus-visible:ring-2 focus-visible:ring-primary/30"
                placeholder="e.g. Coffee Beans, Whole Milk"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
                data-testid="input-ingredient-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Unit
                </label>
                <Select value={formUnit} onValueChange={setFormUnit}>
                  <SelectTrigger className="h-11 rounded-xl bg-muted/50 border-none focus:ring-2 focus:ring-primary/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-52">
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Cost / unit ({currency})
                </label>
                <Input
                  className="h-11 rounded-xl bg-muted/50 border-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formCostPerUnit}
                  onChange={(e) => setFormCostPerUnit(e.target.value)}
                  data-testid="input-ingredient-cost"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Stock Qty
                </label>
                <Input
                  className="h-11 rounded-xl bg-muted/50 border-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={formStockQty}
                  onChange={(e) => setFormStockQty(e.target.value)}
                  data-testid="input-ingredient-stock"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Low Stock Alert
                </label>
                <Input
                  className="h-11 rounded-xl bg-muted/50 border-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={formThreshold}
                  onChange={(e) => setFormThreshold(e.target.value)}
                  data-testid="input-ingredient-threshold"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Notes{" "}
                <span className="normal-case font-normal ml-1 text-muted-foreground/60">
                  (optional)
                </span>
              </label>
              <Textarea
                className="resize-none rounded-xl bg-muted/50 border-none text-sm focus-visible:ring-2 focus-visible:ring-primary/30"
                rows={2}
                placeholder="Supplier, storage instructions, etc."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                data-testid="input-ingredient-notes"
              />
            </div>
          </div>

          <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm px-5 pb-5 pt-3 border-t border-border/30">
            <Button
              className="w-full rounded-2xl h-12 font-bold text-sm"
              disabled={isPending || !formName.trim()}
              onClick={() => {
                if (editingId) updateMutation.mutate();
                else createMutation.mutate();
              }}
              data-testid="button-submit-ingredient"
            >
              {isPending ? "Saving…" : editingId ? "Save Changes" : "Add Ingredient"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
