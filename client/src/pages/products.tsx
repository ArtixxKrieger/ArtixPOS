import { useState } from "react";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-products";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency } from "@/lib/format";
import { type InsertProduct, type Product } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm, useFieldArray } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Edit2, Trash2, Search, Package, X, Tag } from "lucide-react";

interface SizeItem { name: string; price: string; }
interface ModifierItem { name: string; price: string; }
interface ProductFormData {
  name: string;
  price: string;
  category: string;
  sizes: SizeItem[];
  modifiers: ModifierItem[];
}

export default function Products() {
  const { data: products = [], isLoading } = useProducts();
  const { data: settings } = useSettings();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const currency = settings?.currency || "₱";

  const form = useForm<ProductFormData>({
    defaultValues: { name: "", price: "0", category: "General", sizes: [], modifiers: [] }
  });

  const { fields: sizeFields, append: appendSize, remove: removeSize } = useFieldArray({
    control: form.control, name: "sizes"
  });
  const { fields: modifierFields, append: appendModifier, remove: removeModifier } = useFieldArray({
    control: form.control, name: "modifiers"
  });

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ?? false
  );

  const onSubmit = (data: ProductFormData) => {
    const payload: InsertProduct = {
      name: data.name,
      price: data.price.toString(),
      category: data.category || "General",
      sizes: data.sizes || [],
      modifiers: data.modifiers || [],
      hasSizes: (data.sizes?.length || 0) > 0,
      hasModifiers: (data.modifiers?.length || 0) > 0
    };
    if (editingId) {
      updateProduct.mutate({ id: editingId, ...payload }, {
        onSuccess: () => { setIsDialogOpen(false); setEditingId(null); form.reset(); }
      });
    } else {
      createProduct.mutate(payload, {
        onSuccess: () => { setIsDialogOpen(false); form.reset(); }
      });
    }
  };

  const openEdit = (p: Product) => {
    setEditingId(p.id);
    form.reset({
      name: p.name || "",
      price: p.price?.toString() || "0",
      category: p.category || "General",
      sizes: (p.sizes as SizeItem[]) || [],
      modifiers: (p.modifiers as ModifierItem[]) || []
    });
    setIsDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    form.reset({ name: "", price: "0", category: "General", sizes: [], modifiers: [] });
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

        <div className="flex w-full sm:w-auto gap-2.5">
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
                          <Input type="number" step="0.01" {...field} value={field.value || "0"} className="h-11 rounded-xl bg-secondary border-none" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold text-sm">Category</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || "General"} className="h-11 rounded-xl bg-secondary border-none" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Sizes */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <FormLabel className="font-semibold text-sm">Sizes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendSize({ name: "", price: "0" })}
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
                              <Input {...field} value={field.value || ""} placeholder="e.g. Small" className="rounded-xl bg-secondary border-none h-9 text-sm" />
                            </FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name={`sizes.${index}.price`} render={({ field }) => (
                          <FormItem className="w-24">
                            <FormControl>
                              <Input type="number" step="0.01" {...field} value={field.value || "0"} placeholder="Price" className="rounded-xl bg-secondary border-none h-9 text-sm" />
                            </FormControl>
                          </FormItem>
                        )} />
                        <button type="button" onClick={() => removeSize(index)} className="h-9 w-9 flex items-center justify-center text-destructive/60 hover:text-destructive rounded-xl hover:bg-destructive/10 transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Modifiers */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <FormLabel className="font-semibold text-sm">Add-ons <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendModifier({ name: "", price: "0" })}
                        className="rounded-xl h-8 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add
                      </Button>
                    </div>
                    {modifierFields.map((field, index) => (
                      <div key={field.id} className="flex gap-2 items-center">
                        <FormField control={form.control} name={`modifiers.${index}.name`} render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input {...field} value={field.value || ""} placeholder="e.g. Extra Shot" className="rounded-xl bg-secondary border-none h-9 text-sm" />
                            </FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name={`modifiers.${index}.price`} render={({ field }) => (
                          <FormItem className="w-24">
                            <FormControl>
                              <Input type="number" step="0.01" {...field} value={field.value || "0"} placeholder="Price" className="rounded-xl bg-secondary border-none h-9 text-sm" />
                            </FormControl>
                          </FormItem>
                        )} />
                        <button type="button" onClick={() => removeModifier(index)} className="h-9 w-9 flex items-center justify-center text-destructive/60 hover:text-destructive rounded-xl hover:bg-destructive/10 transition-colors">
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
        <div className="space-y-2.5">
          {filtered.map((product) => (
            <div
              key={product.id}
              data-testid={`product-row-${product.id}`}
              className="bg-card rounded-2xl border border-border/30 px-4 py-3.5 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow"
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
                  {(product.sizes as any[])?.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/60 font-medium">
                      {(product.sizes as any[]).length} sizes
                    </span>
                  )}
                  {(product.modifiers as any[])?.length > 0 && (
                    <span className="text-[10px] text-muted-foreground/60 font-medium flex items-center gap-0.5">
                      <Tag className="h-2.5 w-2.5" />
                      {(product.modifiers as any[]).length} add-ons
                    </span>
                  )}
                </div>
              </div>

              {/* Price */}
              <div className="text-right shrink-0">
                <p className="font-black text-base text-primary tabular-nums">
                  {formatCurrency(product.price || "0", currency)}
                </p>
                {(product.sizes as any[])?.length > 0 && (
                  <p className="text-[10px] text-muted-foreground font-medium">base</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0 ml-1">
                <button
                  className="h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary flex items-center justify-center text-muted-foreground transition-colors"
                  onClick={() => openEdit(product)}
                  data-testid={`button-edit-${product.id}`}
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  className="h-9 w-9 rounded-xl hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground/60 transition-colors"
                  onClick={() => {
                    if (confirm("Delete this product?")) deleteProduct.mutate(product.id);
                  }}
                  data-testid={`button-delete-${product.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
