import { useState, useRef } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-products";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency } from "@/lib/format";
import { type InsertProduct, type Product, type StockLog } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm, useFieldArray } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Edit2, Trash2, Search, Package, X, AlertTriangle, Boxes, Check, History, TrendingUp, TrendingDown, Download, Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

interface SizeItem { name: string; price: string; }

interface CsvRow {
  name: string; category?: string; price?: string; sku?: string; barcode?: string;
  taxRate?: string; trackStock?: boolean; stock?: number; lowStockThreshold?: number;
}

interface ImportResult { created: number; updated: number; errors: number; errorList: string[]; }

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    return cells;
  };
  const headers = parseRow(lines[0]).map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? "").trim(); });
    const row: CsvRow = { name: obj.name || "" };
    if (obj.category) row.category = obj.category;
    if (obj.price) row.price = obj.price;
    if (obj.sku) row.sku = obj.sku;
    if (obj.barcode) row.barcode = obj.barcode;
    if (obj.taxrate) row.taxRate = obj.taxrate;
    row.trackStock = obj.trackstock === "true" || obj.trackstock === "1" || obj.trackstock === "yes";
    if (obj.stock !== "") row.stock = parseInt(obj.stock) || 0;
    if (obj.lowstockthreshold !== "") row.lowStockThreshold = parseInt(obj.lowstockthreshold) || 5;
    return row;
  }).filter(r => r.name);
}

interface ProductFormData {
  name: string;
  price: string;
  category: string;
  sku: string;
  barcode: string;
  taxRate: string;
  trackStock: boolean;
  stock: number | null;
  lowStockThreshold: number | null;
  sizes: SizeItem[];
}

export default function Products() {
  const { data: products = [], isLoading } = useProducts();
  const { data: settings } = useSettings();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stockHistoryProduct, setStockHistoryProduct] = useState<Product | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<CsvRow[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: async (rows: CsvRow[]) => {
      const res = await fetch("/api/products/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (result) => {
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      setImportRows(rows);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleExport = () => {
    const a = document.createElement("a");
    a.href = "/api/products/export";
    a.download = "products.csv";
    a.click();
  };

  const resetImport = () => {
    setImportRows([]);
    setImportResult(null);
    setImportFileName("");
  };

  const { data: stockLogs = [], isLoading: stockLogsLoading } = useQuery<StockLog[]>({
    queryKey: ["/api/products", stockHistoryProduct?.id, "stock-logs"],
    queryFn: async () => {
      if (!stockHistoryProduct) return [];
      const res = await fetch(`/api/products/${stockHistoryProduct.id}/stock-logs`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!stockHistoryProduct,
  });

  const requestDelete = (id: number) => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    setPendingDeleteId(id);
    deleteTimerRef.current = setTimeout(() => setPendingDeleteId(null), 3000);
  };
  const confirmDelete = (id: number) => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    setPendingDeleteId(null);
    deleteProduct.mutate(id, {
      onSuccess: () => toast({ title: "Product deleted" }),
      onError: (err) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
    });
  };

  const currency = settings?.currency || "₱";

  const form = useForm<ProductFormData>({
    defaultValues: { name: "", price: "", category: "General", sku: "", barcode: "", taxRate: "", trackStock: false, stock: null, lowStockThreshold: null, sizes: [] }
  });

  const { fields: sizeFields, append: appendSize, remove: removeSize } = useFieldArray({
    control: form.control, name: "sizes"
  });

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ?? false
  );

  const onSubmit = (data: ProductFormData) => {
    if (!data.name?.trim()) {
      toast({ title: "Name required", description: "Please enter a product name.", variant: "destructive" });
      return;
    }
    if (!data.price?.toString().trim() || isNaN(parseFloat(data.price.toString()))) {
      toast({ title: "Valid price required", description: "Please enter a valid price (e.g. 0.00).", variant: "destructive" });
      return;
    }
    const payload: InsertProduct = {
      name: data.name,
      price: data.price.toString(),
      category: data.category || "General",
      sku: data.sku || null,
      barcode: data.barcode || null,
      taxRate: data.taxRate || null,
      trackStock: data.trackStock ?? false,
      stock: data.trackStock ? (data.stock ?? 0) : null,
      lowStockThreshold: data.trackStock ? (data.lowStockThreshold ?? 5) : null,
      sizes: data.sizes || [],
      modifiers: [],
      hasSizes: (data.sizes?.length || 0) > 0,
      hasModifiers: false,
    };
    if (editingId) {
      updateProduct.mutate({ id: editingId, ...payload }, {
        onSuccess: () => {
          setIsDialogOpen(false);
          setEditingId(null);
          form.reset();
          toast({ title: "Product updated" });
        },
        onError: (err) => {
          toast({ title: "Failed to update", description: err.message, variant: "destructive" });
        }
      });
    } else {
      createProduct.mutate(payload, {
        onSuccess: () => {
          setIsDialogOpen(false);
          form.reset();
          toast({ title: "Product added" });
        },
        onError: (err) => {
          toast({ title: "Failed to add product", description: err.message, variant: "destructive" });
        }
      });
    }
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    form.reset({
      name: p.name || "",
      price: p.price?.toString() || "",
      category: p.category || "General",
      sku: p.sku || "",
      barcode: p.barcode || "",
      taxRate: p.taxRate || "",
      trackStock: p.trackStock ?? false,
      stock: p.stock ?? null,
      lowStockThreshold: p.lowStockThreshold ?? null,
      sizes: (p.sizes as SizeItem[]) || [],
    });
    setIsDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    form.reset({ name: "", price: "", category: "General", sku: "", barcode: "", taxRate: "", trackStock: false, stock: null, lowStockThreshold: null, sizes: [] });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4 page-enter">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-black tracking-tight">Inventory</h2>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">
            {products.length} product{products.length !== 1 ? "s" : ""} in catalog
          </p>
        </div>

        <div className="flex w-full sm:w-auto gap-2.5 flex-wrap">
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              className="pl-9 h-10 bg-card border-none rounded-2xl shadow-sm text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-inventory"
            />
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
            data-testid="input-import-csv"
          />

          <button
            onClick={handleExport}
            className="h-10 px-3 rounded-2xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1.5 text-sm font-medium shadow-sm shrink-0"
            data-testid="button-export-csv"
            title="Export as CSV"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>

          <button
            onClick={() => { resetImport(); setImportOpen(true); }}
            className="h-10 px-3 rounded-2xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1.5 text-sm font-medium shadow-sm shrink-0"
            data-testid="button-open-import"
            title="Import from CSV"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </button>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={openCreate}
                className="rounded-2xl h-10 px-4 shadow-md bg-primary text-white hover:opacity-90 transition-opacity shrink-0"
                data-testid="button-add-product"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Add Item</span>
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[480px] max-w-[calc(100vw-24px)] max-h-[92dvh] overflow-y-auto rounded-3xl border-none shadow-2xl">
              <DialogHeader className="pb-2">
                <DialogTitle className="text-xl font-black">
                  {editingId ? "Edit Product" : "New Product"}
                </DialogTitle>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2">

                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold text-sm">Product Name</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} className="h-11 rounded-xl bg-secondary border-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="price" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold text-sm">Base Price ({currency})</FormLabel>
                        <FormControl>
                          <Input type="text" inputMode="decimal" {...field} value={field.value ?? ""} placeholder="0.00" className="h-11 rounded-xl bg-secondary border-none" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold text-sm">Category</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-11 rounded-xl bg-secondary border-none" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="sku" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold text-sm">SKU <span className="text-muted-foreground font-normal">(opt.)</span></FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} placeholder="PROD-001" className="h-11 rounded-xl bg-secondary border-none font-mono" data-testid="input-product-sku" />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="barcode" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold text-sm">Barcode <span className="text-muted-foreground font-normal">(opt.)</span></FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} placeholder="e.g. 4006381333931" className="h-11 rounded-xl bg-secondary border-none font-mono" data-testid="input-product-barcode" />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="taxRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold text-sm">
                        Tax Rate % <span className="text-muted-foreground font-normal">(optional — overrides global rate)</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} type="number" min={0} max={100} step="0.01" placeholder="Leave blank to use global rate" className="h-11 rounded-xl bg-secondary border-none" data-testid="input-product-tax-rate" />
                      </FormControl>
                    </FormItem>
                  )} />

                  {/* Stock Tracking */}
                  <div className="space-y-3">
                    <FormField control={form.control} name="trackStock" render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between bg-secondary/50 rounded-xl px-4 py-3">
                          <div>
                            <FormLabel className="font-semibold text-sm cursor-pointer">Track Inventory</FormLabel>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Monitor stock levels for this product</p>
                          </div>
                          <FormControl>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={field.value}
                              data-testid="toggle-track-stock"
                              onClick={() => field.onChange(!field.value)}
                              className={[
                                "relative h-6 w-11 rounded-full transition-all duration-200 shrink-0",
                                field.value ? "bg-primary" : "bg-secondary border border-border",
                              ].join(" ")}
                            >
                              <span className={[
                                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200",
                                field.value ? "left-5" : "left-0.5",
                              ].join(" ")} />
                            </button>
                          </FormControl>
                        </div>
                      </FormItem>
                    )} />

                    {form.watch("trackStock") && (
                      <div className="grid grid-cols-2 gap-3">
                        <FormField control={form.control} name="stock" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-semibold text-sm">Current Stock</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                value={field.value ?? ""}
                                onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                                placeholder="0"
                                className="h-11 rounded-xl bg-secondary border-none"
                                data-testid="input-product-stock"
                              />
                            </FormControl>
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">Set your actual count — sales will deduct from this number</p>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="lowStockThreshold" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-semibold text-sm">Low Stock Alert</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                value={field.value ?? ""}
                                onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                                placeholder="5"
                                className="h-11 rounded-xl bg-secondary border-none"
                                data-testid="input-product-threshold"
                              />
                            </FormControl>
                          </FormItem>
                        )} />
                      </div>
                    )}
                  </div>

                  {/* Sizes */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <FormLabel className="font-semibold text-sm">Sizes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendSize({ name: "", price: "" })}
                        className="rounded-xl h-8 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add
                      </Button>
                    </div>
                    {sizeFields.map((field, index) => (
                      <div key={field.id} className="flex gap-2 items-center">
                        <FormField control={form.control} name={`sizes.${index}.name`} render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input {...field} value={field.value || ""} placeholder="Size name" className="rounded-xl bg-secondary border-none h-9 text-sm" />
                            </FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name={`sizes.${index}.price`} render={({ field }) => (
                          <FormItem className="w-24">
                            <FormControl>
                              <Input type="text" inputMode="decimal" {...field} placeholder="Price" className="rounded-xl bg-secondary border-none h-9 text-sm" />
                            </FormControl>
                          </FormItem>
                        )} />
                        <button type="button" onClick={() => removeSize(index)} className="h-9 w-9 flex items-center justify-center text-destructive/60 hover:text-destructive rounded-xl hover:bg-destructive/10 transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="submit"
                    className="w-full rounded-2xl h-12 font-bold text-white shadow-lg bg-primary mt-2"
                    disabled={createProduct.isPending || updateProduct.isPending}
                    data-testid="button-submit-product"
                  >
                    {editingId ? "Save Changes" : "Create Product"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Product List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-muted rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-3xl py-16 text-center flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full bg-muted/40 flex items-center justify-center">
            <Package className="h-8 w-8 opacity-25" strokeWidth={1.5} />
          </div>
          <p className="font-bold text-base">{search ? "No results found" : "No products yet"}</p>
          <p className="text-sm text-muted-foreground/70">
            {search ? `No products match "${search}"` : "Tap 'Add Item' to add your first product"}
          </p>
        </div>
      ) : (
        /* Mobile-optimized card list */
        <div className="space-y-2.5 stagger-children">
          {filtered.map((product) => (
            <div
              key={product.id}
              data-testid={`product-row-${product.id}`}
              className="bg-card rounded-2xl border border-border/30 px-4 py-3.5 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow animate-fade-scale card-press"
            >
              {/* Icon */}
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Package className="h-5 w-5 text-primary/60" strokeWidth={1.5} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm leading-tight truncate">{product.name || ""}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="bg-secondary/80 px-2 py-0.5 rounded-full text-[10px] font-semibold text-muted-foreground">
                    {product.category || "General"}
                  </span>
                  {product.sku && (
                    <span className="text-[10px] text-muted-foreground/50 font-mono">
                      {product.sku}
                    </span>
                  )}
                  {(product.sizes as any[])?.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/60 font-medium">
                      {(product.sizes as any[]).length} sizes
                    </span>
                  )}
                </div>
                {product.trackStock && (
                  <div className="flex items-center gap-1 mt-1">
                    <Boxes className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                    <span className={[
                      "text-[10px] font-semibold",
                      (product.stock ?? 0) === 0
                        ? "text-rose-500"
                        : typeof product.stock === "number" && typeof product.lowStockThreshold === "number" && product.stock <= product.lowStockThreshold
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground/60",
                    ].join(" ")}>
                      {product.stock ?? 0} in stock
                      {typeof product.stock === "number" && typeof product.lowStockThreshold === "number" && product.stock <= product.lowStockThreshold && product.stock > 0
                        ? " · Low"
                        : (product.stock ?? 0) === 0
                          ? " · Out of stock"
                          : ""}
                    </span>
                  </div>
                )}
              </div>

              {/* Price */}
              <div className="text-right shrink-0">
                <p className="font-black text-base text-primary tabular-nums">
                  {formatCurrency(product.price || "0", currency)}
                </p>
                {(product.sizes as any[])?.length > 0 && (
                  <p className="text-[10px] text-muted-foreground font-medium">base</p>
                )}
                {product.trackStock && typeof product.stock === "number" && typeof product.lowStockThreshold === "number" && product.stock <= product.lowStockThreshold && (
                  <AlertTriangle className={["h-3.5 w-3.5 mt-1 mx-auto", product.stock === 0 ? "text-rose-500" : "text-amber-500"].join(" ")} />
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0 ml-1">
                {pendingDeleteId === product.id ? (
                  <>
                    <button
                      className="h-9 w-9 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center transition-colors hover:bg-destructive/20"
                      onClick={() => confirmDelete(product.id)}
                      data-testid={`button-confirm-delete-${product.id}`}
                      title="Confirm delete"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors"
                      onClick={() => setPendingDeleteId(null)}
                      data-testid={`button-cancel-delete-${product.id}`}
                      title="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    {product.trackStock && (
                      <button
                        className="h-9 w-9 rounded-xl hover:bg-violet-500/10 hover:text-violet-600 flex items-center justify-center text-muted-foreground/60 transition-colors"
                        onClick={() => setStockHistoryProduct(product)}
                        data-testid={`button-stock-history-${product.id}`}
                        title="Stock history"
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      className="h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary flex items-center justify-center text-muted-foreground transition-colors"
                      onClick={() => openEdit(product)}
                      data-testid={`button-edit-${product.id}`}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="h-9 w-9 rounded-xl hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground/60 transition-colors"
                      onClick={() => requestDelete(product.id)}
                      data-testid={`button-delete-${product.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CSV Import Dialog */}
      <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) resetImport(); }}>
        <DialogContent className="max-w-lg rounded-3xl max-h-[90dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4 text-primary" />
              Import Products from CSV
            </DialogTitle>
          </DialogHeader>

          {importResult ? (
            /* Results view */
            <div className="flex-1 space-y-4 py-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-500/10 rounded-2xl p-3 text-center">
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{importResult.created}</p>
                  <p className="text-[10px] font-semibold text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">Created</p>
                </div>
                <div className="bg-blue-500/10 rounded-2xl p-3 text-center">
                  <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{importResult.updated}</p>
                  <p className="text-[10px] font-semibold text-blue-600/70 dark:text-blue-400/70 mt-0.5">Updated</p>
                </div>
                <div className={["rounded-2xl p-3 text-center", importResult.errors > 0 ? "bg-rose-500/10" : "bg-muted/40"].join(" ")}>
                  <p className={["text-2xl font-black", importResult.errors > 0 ? "text-rose-500" : "text-muted-foreground"].join(" ")}>{importResult.errors}</p>
                  <p className={["text-[10px] font-semibold mt-0.5", importResult.errors > 0 ? "text-rose-500/70" : "text-muted-foreground/60"].join(" ")}>Errors</p>
                </div>
              </div>

              {importResult.errorList.length > 0 && (
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-3 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-rose-500 mb-2 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" /> Errors
                  </p>
                  {importResult.errorList.map((e, i) => (
                    <p key={i} className="text-[11px] text-rose-500/80">{e}</p>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Import complete. Your inventory has been updated.
                </p>
              </div>

              <Button
                className="w-full rounded-2xl"
                onClick={() => { setImportOpen(false); resetImport(); }}
                data-testid="button-import-done"
              >
                Done
              </Button>
            </div>
          ) : (
            /* Upload + preview view */
            <div className="flex-1 flex flex-col gap-4 min-h-0">
              {/* Drop zone */}
              <button
                type="button"
                className="border-2 border-dashed border-border rounded-2xl p-6 text-center flex flex-col items-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-choose-csv"
              >
                {importFileName ? (
                  <>
                    <FileText className="h-8 w-8 text-primary/60" />
                    <p className="text-sm font-semibold text-foreground">{importFileName}</p>
                    <p className="text-xs text-muted-foreground">{importRows.length} row{importRows.length !== 1 ? "s" : ""} detected · Click to change</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm font-semibold">Choose a CSV file</p>
                    <p className="text-xs text-muted-foreground/60">Columns: name, category, price, sku, barcode, taxRate, trackStock, stock, lowStockThreshold</p>
                  </>
                )}
              </button>

              {/* Preview table */}
              {importRows.length > 0 && (
                <div className="flex-1 overflow-auto border border-border/40 rounded-2xl min-h-0">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-muted/60 backdrop-blur-sm">
                      <tr>
                        {["Name", "Category", "Price", "SKU", "Track Stock"].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 50).map((row, i) => (
                        <tr key={i} className="border-t border-border/20 hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium max-w-[120px] truncate">{row.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.category || "—"}</td>
                          <td className="px-3 py-2 tabular-nums">{row.price || "—"}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">{row.sku || "—"}</td>
                          <td className="px-3 py-2">
                            <span className={["px-1.5 py-0.5 rounded-md text-[10px] font-semibold", row.trackStock ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"].join(" ")}>
                              {row.trackStock ? "Yes" : "No"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importRows.length > 50 && (
                    <p className="text-center text-[11px] text-muted-foreground/50 py-2">+ {importRows.length - 50} more rows</p>
                  )}
                </div>
              )}

              {/* Format hint */}
              {!importFileName && (
                <div className="bg-muted/40 rounded-2xl p-3 text-[11px] text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground/70">CSV tips</p>
                  <p>• First row must be column headers</p>
                  <p>• Products matched by SKU (then name) — existing ones are updated</p>
                  <p>• Download your current products via Export to use as a template</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 rounded-2xl"
                  onClick={() => { setImportOpen(false); resetImport(); }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 rounded-2xl"
                  disabled={importRows.length === 0 || importMutation.isPending}
                  onClick={() => importMutation.mutate(importRows)}
                  data-testid="button-confirm-import"
                >
                  {importMutation.isPending ? "Importing…" : `Import ${importRows.length} product${importRows.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stock History Dialog */}
      <Dialog open={!!stockHistoryProduct} onOpenChange={(v) => !v && setStockHistoryProduct(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" />
              Stock History — {stockHistoryProduct?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-1 max-h-96 overflow-y-auto -mx-1 px-1">
            {stockLogsLoading ? (
              <div className="space-y-2 py-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 skeleton-shimmer rounded-xl" />
                ))}
              </div>
            ) : stockLogs.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">No stock changes yet</p>
                <p className="text-xs mt-1 opacity-70">Stock changes will appear here after restocks or adjustments</p>
              </div>
            ) : (
              stockLogs.map((log) => {
                const isIncrease = log.delta > 0;
                const isDecrease = log.delta < 0;
                const REASON_LABELS: Record<string, string> = {
                  manual: "Manual adjustment",
                  sale: "Sale deduction",
                  restock: "Restock",
                  adjustment: "Adjustment",
                };
                return (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/30 transition-colors"
                    data-testid={`stock-log-${log.id}`}
                  >
                    <div className={[
                      "h-8 w-8 rounded-xl flex items-center justify-center shrink-0",
                      isIncrease ? "bg-emerald-500/10" : isDecrease ? "bg-rose-500/10" : "bg-muted",
                    ].join(" ")}>
                      {isIncrease
                        ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        : isDecrease
                          ? <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
                          : <Boxes className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={[
                          "text-sm font-bold tabular-nums",
                          isIncrease ? "text-emerald-600 dark:text-emerald-400" : isDecrease ? "text-rose-500" : "text-foreground",
                        ].join(" ")}>
                          {isIncrease ? "+" : ""}{log.delta}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {log.previousStock} → {log.newStock}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {REASON_LABELS[log.reason ?? "manual"] ?? log.reason}
                        {log.note && ` · ${log.note}`}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 shrink-0 text-right">
                      {log.createdAt ? format(new Date(log.createdAt), "MMM d, h:mm a") : ""}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-1 border-t border-border/40">
            <p className="text-[10px] text-muted-foreground/50 text-center">
              Showing last {stockLogs.length} change{stockLogs.length !== 1 ? "s" : ""}
              {stockHistoryProduct && ` · Current stock: ${stockHistoryProduct.stock ?? 0}`}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
