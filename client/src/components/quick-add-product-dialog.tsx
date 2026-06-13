

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackagePlus } from "lucide-react";
import { useCreateProduct } from "@/hooks/use-products";
import type { Product } from "@shared/schema";

const schema = z.object({
  name: z.string().min(1, "Product name is required"),
  price: z.string().min(1, "Price is required").refine(v => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, "Enter a valid price"),
  category: z.string().default("General"),
});

type FormValues = z.infer<typeof schema>;

interface QuickAddProductDialogProps {
  open: boolean;
  barcode: string;
  existingCategories: string[];
  onClose: () => void;
  onCreated: (product: Product) => void;
}

export function QuickAddProductDialog({
  open,
  barcode,
  existingCategories,
  onClose,
  onCreated,
}: QuickAddProductDialogProps) {
  const createProduct = useCreateProduct();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", price: "", category: "General" },
  });

useEffect(() => {
    if (open) {
      form.reset({ name: "", price: "", category: "General" });
    }

  }, [open, barcode]);

  async function onSubmit(values: FormValues) {
    try {
      const payload = { name: values.name.trim(), price: parseFloat(values.price).toFixed(2), category: values.category || "General", barcode: barcode || undefined, isActive: 1 };

      const product = await createProduct.mutateAsync(payload as any);
      onCreated(product as Product);
      onClose();
    } catch (err: unknown) {
      form.setError("root", { message: (err as Error)?.message || "Could not save product. Try again." });
    }
  }

  const categories = ["General", ...existingCategories.filter(c => c !== "General" && c !== "all")];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <PackagePlus className="h-4 w-4 text-primary" />
            New Product
          </DialogTitle>
          <DialogDescription className="text-xs">
            Barcode <span className="font-mono font-semibold text-foreground">{barcode}</span> isn't in your catalog yet. Fill in the details and it'll be added to your cart right away.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Coca-Cola 500ml"
                      autoFocus
                      data-testid="input-quick-add-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      inputMode="decimal"
                      data-testid="input-quick-add-price"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-quick-add-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {}
            <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
              <span>Barcode</span>
              <span className="font-mono font-medium text-foreground">{barcode}</span>
            </div>

            {form.formState.errors.root && (
              <p className="text-xs text-destructive">{form.formState.errors.root.message}</p>
            )}

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose} data-testid="button-quick-add-cancel">
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={createProduct.isPending}
                data-testid="button-quick-add-save"
              >
                {createProduct.isPending ? "Saving…" : "Add to Cart"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
