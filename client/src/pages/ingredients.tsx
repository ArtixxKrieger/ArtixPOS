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

  // Form state
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
      toast({ title: "Stock adjusted" });
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

  const filtered = ingredients.filter((i) =>
    i.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4 page-enter">
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

        <div className="flex w-full sm:w-auto gap-2.5">
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ingredients..."
              className="pl-9 h-10 bg-card border-none rounded-2xl shadow-sm text-sm min-w-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            onClick={openCreate}
            className="rounded-2xl h-10 px-4 shadow-md shrink-0 min-w-[48px]"
            data-testid="button-add-ingredient"
          >
            <Plus className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card rounded-3xl py-16 px-4 text-center flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center">
            <FlaskConical className="h-8 w-8 opacity-25" strokeWidth={1.5} />
          </div>
          <p className="font-bold text-base">
            {search ? "No results found" : "No ingredients yet"}
          </p>
          <p className="text-sm text-muted-foreground/70 max-w-xs">
            {search
              ? `No ingredients match "${search}"`
              : "Add the raw materials you use to make your products — coffee beans, milk, sugar, flour, etc."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 pb-20 sm:pb-4">
          {filtered.map((ing) => {
            const stock = Number(ing.stockQty || "0");
            const threshold = Number(ing.lowStockThreshold || "0");
            const isLow = stock <= threshold && threshold > 0;
            const isOut = stock === 0;

            return (
              <div
                key={ing.id}
                data-testid={`ingredient-row-${ing.id}`}
                className="bg-card rounded-2xl border border-border/30 px-3.5 py-3 sm:px-4 sm:py-3.5 flex flex-wrap items-center gap-2 sm:gap-3 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Top row: icon + info + stock */}
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto sm:flex-1 sm:min-w-0">
                  <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <FlaskConical className="h-5 w-5 text-emerald-600/60" strokeWidth={1.5} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm leading-tight truncate">{ing.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        {ing.unit}
                      </Badge>
                      {Number(ing.costPerUnit || "0") > 0 && (
                        <span className="text-[10px] text-muted-foreground hidden xs:inline">
                          {formatCurrency(ing.costPerUnit, currency)}/{ing.unit}
                        </span>
                      )}
                      {threshold > 0 && (
                        <span className="text-[10px] text-muted-foreground/60">
                          Min: {threshold}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Stock level */}
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 justify-end">
                      <span
                        className={[
                          "font-black text-sm sm:text-base tabular-nums",
                          isOut
                            ? "text-rose-500"
                            : isLow
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400",
                        ].join(" ")}
                      >
                        {ing.stockQty}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium hidden xs:inline">
                        {ing.unit}
                      </span>
                    </div>
                    {(isOut || isLow) && (
                      <div className="flex items-center gap-1 justify-end mt-0.5">
                        <AlertTriangle
                          className={["h-3 w-3", isOut ? "text-rose-500" : "text-amber-500"].join(
                            " ",
                          )}
                        />
                        <span
                          className={[
                            "text-[10px] font-bold",
                            isOut ? "text-rose-500" : "text-amber-500",
                          ].join(" ")}
                        >
                          {isOut ? "OUT" : "LOW"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom row on mobile: quick adjust + actions */}
                <div className="flex items-center justify-end gap-1 sm:gap-1 w-full sm:w-auto">
                  {/* Quick stock adjust */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => adjustStockMutation.mutate({ id: ing.id, delta: -1 })}
                      className="h-10 w-10 sm:h-8 sm:w-8 rounded-xl hover:bg-rose-500/10 hover:text-rose-500 flex items-center justify-center text-muted-foreground/60 transition-colors active:scale-90"
                      title="Deduct 1 unit"
                    >
                      <TrendingDown className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    </button>
                    <button
                      onClick={() => adjustStockMutation.mutate({ id: ing.id, delta: 1 })}
                      className="h-10 w-10 sm:h-8 sm:w-8 rounded-xl hover:bg-emerald-500/10 hover:text-emerald-600 flex items-center justify-center text-muted-foreground/60 transition-colors active:scale-90"
                      title="Add 1 unit"
                    >
                      <TrendingUp className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {pendingDeleteId === ing.id ? (
                    <>
                      <button
                        className="h-9 w-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20"
                        onClick={() => confirmDelete(ing.id)}
                        title="Confirm delete"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground"
                        onClick={() => {
                          if (deleteTimer) clearTimeout(deleteTimer);
                          setPendingDeleteId(null);
                        }}
                        title="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary flex items-center justify-center text-muted-foreground transition-colors"
                        onClick={() => openEdit(ing)}
                        title="Edit"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="h-9 w-9 rounded-xl hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground/60 transition-colors"
                        onClick={() => requestDelete(ing.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
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
        <DialogContent className="sm:max-w-[460px] max-w-[calc(100vw-24px)] rounded-3xl border-none shadow-2xl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg sm:text-xl font-black flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              {editingId ? "Edit Ingredient" : "New Ingredient"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 sm:space-y-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Ingredient Name</label>
              <Input
                className="mt-1 h-11 rounded-xl bg-secondary border-none"
                placeholder="e.g. Coffee Beans, Whole Milk"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                data-testid="input-ingredient-name"
              />
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="text-xs font-medium text-muted-foreground">Unit of Measure</label>
                <Select value={formUnit} onValueChange={setFormUnit}>
                  <SelectTrigger className="mt-1 h-11 rounded-xl bg-secondary border-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[40vh]">
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <label className="text-xs font-medium text-muted-foreground">
                  Cost per Unit ({currency})
                </label>
                <Input
                  className="mt-1 h-11 rounded-xl bg-secondary border-none"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formCostPerUnit}
                  onChange={(e) => setFormCostPerUnit(e.target.value)}
                  data-testid="input-ingredient-cost"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Current Stock</label>
                <Input
                  className="mt-1 h-11 rounded-xl bg-secondary border-none"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={formStockQty}
                  onChange={(e) => setFormStockQty(e.target.value)}
                  data-testid="input-ingredient-stock"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Low Stock Alert At
                </label>
                <Input
                  className="mt-1 h-11 rounded-xl bg-secondary border-none"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={formThreshold}
                  onChange={(e) => setFormThreshold(e.target.value)}
                  data-testid="input-ingredient-threshold"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <Textarea
                className="mt-1 resize-none rounded-xl bg-secondary border-none text-sm"
                rows={2}
                placeholder="Supplier, storage instructions, etc."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                data-testid="input-ingredient-notes"
              />
            </div>

            <Button
              className="w-full rounded-2xl h-12 font-bold mt-2 text-sm sm:text-base"
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
              {isPending ? "Saving..." : editingId ? "Save Changes" : "Add Ingredient"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
