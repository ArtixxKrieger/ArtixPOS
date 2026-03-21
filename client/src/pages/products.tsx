import { useState } from "react";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-products";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency } from "@/lib/format";
import { type InsertProduct, type Product } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useForm, useFieldArray } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Edit2, Trash2, Search, Package, X } from "lucide-react";

interface SizeItem {
  name: string;
  price: string;
}

interface ModifierItem {
  name: string;
  price: string;
}

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

  const form = useForm<ProductFormData>({
    defaultValues: { 
      name: "", 
      price: "0", 
      category: "General",
      sizes: [],
      modifiers: []
    }
  });

  const { fields: sizeFields, append: appendSize, remove: removeSize } = useFieldArray({
    control: form.control,
    name: "sizes"
  });

  const { fields: modifierFields, append: appendModifier, remove: removeModifier } = useFieldArray({
    control: form.control,
    name: "modifiers"
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
        onSuccess: () => { 
          setIsDialogOpen(false); 
          setEditingId(null);
          form.reset();
        }
      });
    } else {
      createProduct.mutate(payload, {
        onSuccess: () => {
          setIsDialogOpen(false);
          form.reset();
        }
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
    form.reset({ 
      name: "", 
      price: "0", 
      category: "General",
      sizes: [],
      modifiers: []
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-6 rounded-3xl shadow-sm border border-border/50">
        <div>
          <h2 className="text-2xl font-bold">Inventory</h2>
          <p className="text-muted-foreground text-sm">Manage your products and pricing</p>
        </div>

        <div className="flex w-full sm:w-auto gap-4">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search..." 
              className="pl-9 bg-secondary border-none rounded-xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} className="rounded-xl shadow-md bg-primary text-white hover:opacity-90 transition-opacity">
                <Plus className="h-4 w-4 mr-2" /> Add Item
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto rounded-2xl">
              <DialogHeader>
                <DialogTitle className="text-xl">{editingId ? "Edit Product" : "New Product"}</DialogTitle>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">

                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Name</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} className="rounded-xl bg-secondary border-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="price" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base Price ({settings?.currency})</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} value={field.value || "0"} className="rounded-xl bg-secondary border-none" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || "General"} className="rounded-xl bg-secondary border-none" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  {/* Sizes */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-base">Sizes (Optional)</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendSize({ name: "", price: "0" })}
                        className="rounded-lg h-8"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Size
                      </Button>
                    </div>

                    {sizeFields.map((field, index) => (
                      <div key={field.id} className="flex gap-2 items-end">
                        <FormField control={form.control} name={`sizes.${index}.name`} render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input {...field} value={field.value || ""} placeholder="e.g. Small" className="rounded-xl bg-secondary border-none h-9" />
                            </FormControl>
                          </FormItem>
                        )} />

                        <FormField control={form.control} name={`sizes.${index}.price`} render={({ field }) => (
                          <FormItem className="w-24">
                            <FormControl>
                              <Input type="number" step="0.01" {...field} value={field.value || "0"} placeholder="Price" className="rounded-xl bg-secondary border-none h-9" />
                            </FormControl>
                          </FormItem>
                        )} />

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSize(index)}
                          className="h-9 w-9 text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Modifiers */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-base">Add-ons / Modifiers (Optional)</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => appendModifier({ name: "", price: "0" })}
                        className="rounded-lg h-8"
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Modifier
                      </Button>
                    </div>

                    {modifierFields.map((field, index) => (
                      <div key={field.id} className="flex gap-2 items-end">
                        <FormField control={form.control} name={`modifiers.${index}.name`} render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input {...field} value={field.value || ""} placeholder="e.g. Extra Shot" className="rounded-xl bg-secondary border-none h-9" />
                            </FormControl>
                          </FormItem>
                        )} />

                        <FormField control={form.control} name={`modifiers.${index}.price`} render={({ field }) => (
                          <FormItem className="w-24">
                            <FormControl>
                              <Input type="number" step="0.01" {...field} value={field.value || "0"} placeholder="Price" className="rounded-xl bg-secondary border-none h-9" />
                            </FormControl>
                          </FormItem>
                        )} />

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeModifier(index)}
                          className="h-9 w-9 text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    type="submit"
                    className="w-full rounded-xl h-12 font-bold text-white shadow-lg bg-primary mt-4"
                    disabled={createProduct.isPending || updateProduct.isPending}
                  >
                    {editingId ? "Save Changes" : "Create Product"}
                  </Button>

                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-card rounded-3xl shadow-sm border border-border/50 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center animate-pulse text-muted-foreground">Loading inventory...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground flex flex-col items-center">
            <Package className="h-16 w-16 mb-4 opacity-20" />
            <p className="text-lg font-medium text-foreground">No products found</p>
            <p>Try adding a new product to your inventory.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="px-6 py-4 font-semibold">Product Name</TableHead>
                <TableHead className="py-4 font-semibold">Category</TableHead>
                <TableHead className="py-4 font-semibold">Price</TableHead>
                <TableHead className="text-right px-6 py-4 font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.map((product) => (
                <TableRow key={product.id} className="hover:bg-muted/30 transition-colors border-border/50">
                  <TableCell className="font-bold px-6 py-4">{product.name || ""}</TableCell>

                  <TableCell className="py-4">
                    <span className="bg-secondary px-3 py-1 rounded-full text-xs font-medium tracking-wide">
                      {product.category || "General"}
                    </span>
                  </TableCell>

                  <TableCell className="font-bold text-primary py-4">
                    {formatCurrency(product.price || "0", settings?.currency)}
                  </TableCell>

                  <TableCell className="text-right px-6 py-4">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary"
                        onClick={() => openEdit(product)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                        onClick={() => {
                          if (confirm("Delete this product?")) deleteProduct.mutate(product.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>

                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}