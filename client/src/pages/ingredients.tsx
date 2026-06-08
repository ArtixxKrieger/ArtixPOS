import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
  TrendingDown,
  Check,
  X,
  FlaskConical,
  Package,
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

const UNITS = [
  "g", "kg", "ml", "l", "pcs", "cup",
  "tbsp", "tsp", "oz", "lb", "box", "bag", "bottle", "pack",
];

export default function Ingredients() {
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const currency = (settings as { currency?: string })?.currency || "₱";
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleteTimer, setDeleteTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const [formName, setFormName] = useState("");
  const [formUnit, setFormUnit] = useState("kg");
  const [formStockQty, setFormStockQty] = useState("0");
  const [formThreshold, setFormThreshold] = useState("0");
  const [formCostPerUnit, setFormCostPerUnit] = useState("0");
  const [formNotes, setFormNotes] = useState("");

  const { data: ingredients = [] } = useQuery<Ingredient[]>({
    queryKey: ["/api/ingredients"],
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

  const filtered = ingredients.filter((i) =>
    i.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4 page-enter">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Ingredients
          </h2>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">
            {ingredients.length} ingredient{ingredients.length !== 1 ? "s" : ""} tracked
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

      {/* ── Empty state ── */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-3xl py-16 px-6 text-center flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center">
            <FlaskConical className="h-8 w-8 opacity-20" strokeWidth={1.5} />
          </div>
          <p className="font-bold text-base">
            {search ? "No results found" : "No ingredients yet"}
          </p>
          <p className="text-sm text-muted-foreground/70 max-w-xs leading-relaxed">
            {search
              ? `No ingredients match "${search}"`
              : "Add raw materials you use in your products — coffee beans, flour, milk, etc."}
          </p>
          {!search && (
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
            const isLow = stock <= threshold && threshold > 0;
            const isOut = stock === 0;
            const isPendingDelete = pendingDeleteId === ing.id;

            const stockColor = isOut
              ? "text-rose-500"
              : isLow
                ? "text-amber-500 dark:text-amber-400"
                : "text-emerald-600 dark:text-emerald-400";

            return (
              <div
                key={ing.id}
                data-testid={`ingredient-row-${ing.id}`}
                className="bg-card rounded-2xl border border-border/30 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                {/* ── Main content row ── */}
                <div className="flex items-center gap-3 px-3.5 py-3">
                  {/* Icon */}
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Package className="h-5 w-5 text-emerald-600/70" strokeWidth={1.5} />
                  </div>

                  {/* Name + meta — grows */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm leading-tight truncate">{ing.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 px-1.5 font-semibold rounded-md"
                      >
                        {ing.unit}
                      </Badge>
                      {Number(ing.costPerUnit || "0") > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatCurrency(ing.costPerUnit, currency)}/{ing.unit}
                        </span>
                      )}
                      {threshold > 0 && (
                        <span className="text-[10px] text-muted-foreground/60">
                          min&nbsp;{threshold}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stock value — always visible, right-aligned */}
                  <div className="text-right shrink-0">
                    <p className={`font-black text-base tabular-nums leading-none ${stockColor}`}>
                      {ing.stockQty}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                      {ing.unit}
                    </p>
                    {(isOut || isLow) && (
                      <div className="flex items-center gap-0.5 justify-end mt-1">
                        <AlertTriangle className={`h-3 w-3 ${isOut ? "text-rose-500" : "text-amber-500"}`} />
                        <span className={`text-[10px] font-bold ${isOut ? "text-rose-500" : "text-amber-500"}`}>
                          {isOut ? "OUT" : "LOW"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Action bar ── always a clean single row */}
                <div className="flex items-center border-t border-border/20 px-2 py-1.5 gap-1">
                  {/* Quick adjust — left side */}
                  <button
                    onClick={() => adjustStockMutation.mutate({ id: ing.id, delta: -1 })}
                    className="flex items-center gap-1 h-8 px-2.5 rounded-xl hover:bg-rose-500/10 hover:text-rose-500 text-muted-foreground/60 transition-colors active:scale-95 text-xs font-medium"
                    title="Deduct 1"
                    data-testid={`button-deduct-${ing.id}`}
                  >
                    <TrendingDown className="h-3.5 w-3.5" />
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

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Edit / Delete — right side */}
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
                        <Check className="h-3.5 w-3.5" />
                        Yes
                      </button>
                      <button
                        onClick={cancelDelete}
                        className="h-8 px-3 rounded-xl hover:bg-muted text-muted-foreground text-xs font-medium transition-colors flex items-center gap-1"
                        data-testid={`button-cancel-delete-${ing.id}`}
                      >
                        <X className="h-3.5 w-3.5" />
                        No
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

      {/* ── Create / Edit Dialog ── */}
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
            {/* Name */}
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

            {/* Unit + Cost */}
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

            {/* Stock + Threshold */}
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

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Notes
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

          {/* Sticky footer with action button */}
          <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm px-5 pb-5 pt-3 border-t border-border/30">
            <Button
              className="w-full rounded-2xl h-12 font-bold text-sm"
              disabled={isPending || !formName.trim()}
              onClick={() => {
                if (editingId) {
                  updateMutation.mutate();
                } else {
                  createMutation.mutate();
                }
              }}
              data-testid="button-submit-ingredient"
            >
              {isPending
                ? "Saving…"
                : editingId
                  ? "Save Changes"
                  : "Add Ingredient"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
