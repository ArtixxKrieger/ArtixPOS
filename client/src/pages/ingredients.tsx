import { useState } from "react";
import { useIngredients, useCreateIngredient, useUpdateIngredient, useDeleteIngredient } from "@/hooks/use-ingredients";
import { useRecipes, useCreateRecipe, useDeleteRecipe } from "@/hooks/use-ingredients";
import { useProducts } from "@/hooks/use-products";
import { type InsertIngredient, type InsertRecipe } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { Plus, Trash2, AlertCircle, Droplet, Edit2 } from "lucide-react";

const UNITS = ["grams", "ml", "kg", "cc", "liters", "pieces", "cups", "tbsp", "tsp"];

export default function Ingredients() {
  const { data: ingredients = [], isLoading } = useIngredients();
  const { data: products = [] } = useProducts();
  const { data: recipes = [] } = useRecipes();
  const createIngredient = useCreateIngredient();
  const updateIngredient = useUpdateIngredient();
  const deleteIngredient = useDeleteIngredient();
  const createRecipe = useCreateRecipe();
  const deleteRecipe = useDeleteRecipe();

  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [recipeDialog, setRecipeDialog] = useState(false);

  const form = useForm<InsertIngredient>({
    defaultValues: { name: "", unit: "grams", currentStock: "0", minStock: "0", cost: "0" }
  });

  const recipeForm = useForm<InsertRecipe>({
    defaultValues: { productId: 0, ingredientId: 0, quantity: "0" }
  });

  const filtered = ingredients.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const lowStock = ingredients.filter(i => parseFloat(i.currentStock || "0") <= parseFloat(i.minStock || "0"));

  const onSubmit = (data: InsertIngredient) => {
    if (editingId) {
      updateIngredient.mutate({ id: editingId, ...data }, {
        onSuccess: () => { setIsFormOpen(false); setEditingId(null); form.reset(); }
      });
    } else {
      createIngredient.mutate(data, {
        onSuccess: () => { setIsFormOpen(false); form.reset(); }
      });
    }
  };

  const onRecipeSubmit = (data: InsertRecipe) => {
    createRecipe.mutate(data, {
      onSuccess: () => { setRecipeDialog(false); recipeForm.reset(); }
    });
  };

  const openEdit = (ing: any) => {
    setEditingId(ing.id);
    form.reset(ing);
    setIsFormOpen(true);
  };

  if (isLoading) return <div className="p-8 text-center animate-pulse">Loading ingredients...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-10">
      {/* Ingredients Section */}
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-6 rounded-3xl shadow-sm border border-border/50 mb-6">
          <div>
            <h2 className="text-2xl font-bold">Ingredients & Recipes</h2>
            <p className="text-muted-foreground text-sm">Manage your stock ingredients for recipes</p>
          </div>

          <div className="flex w-full sm:w-auto gap-4">
            <Input 
              placeholder="Search..." 
              className="flex-1 sm:w-64 bg-secondary border-none rounded-xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingId(null); form.reset(); }} className="rounded-xl shadow-md bg-gradient-to-r from-primary to-violet-500 text-white">
                  <Plus className="h-4 w-4 mr-2" /> Add Ingredient
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-[400px] rounded-2xl">
                <DialogHeader>
                  <DialogTitle>{editingId ? "Edit Ingredient" : "New Ingredient"}</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ingredient Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Espresso Beans" className="rounded-xl bg-secondary border-none" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="unit" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="rounded-xl bg-secondary border-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="currentStock" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Stock</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} className="rounded-xl bg-secondary border-none h-9" />
                          </FormControl>
                        </FormItem>
                      )} />

                      <FormField control={form.control} name="minStock" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Min Stock</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} className="rounded-xl bg-secondary border-none h-9" />
                          </FormControl>
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={form.control} name="cost" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost per Unit</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} className="rounded-xl bg-secondary border-none" />
                        </FormControl>
                      </FormItem>
                    )} />

                    <Button type="submit" className="w-full rounded-xl h-11 font-bold bg-gradient-to-r from-primary to-violet-500 text-white" disabled={createIngredient.isPending || updateIngredient.isPending}>
                      {editingId ? "Save Changes" : "Create Ingredient"}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {lowStock.length > 0 && (
          <Card className="rounded-3xl border-none shadow-sm bg-gradient-to-br from-amber-500/10 to-transparent border border-border/50 mb-6">
            <CardContent className="p-6 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-amber-600">{lowStock.length} ingredients running low</p>
                <p className="text-sm text-muted-foreground">Reorder soon to avoid stockouts</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-3xl shadow-sm border border-border/50 overflow-hidden">
          <CardHeader className="bg-muted/20 border-b border-border/50 py-6 px-8">
            <CardTitle className="text-lg font-black">Stock Levels</CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/30 border-b border-border/50">
                  <tr>
                    <th className="px-8 py-4 text-left font-black text-xs uppercase">Name</th>
                    <th className="px-6 py-4 text-center font-black text-xs uppercase">Current</th>
                    <th className="px-6 py-4 text-center font-black text-xs uppercase">Min</th>
                    <th className="px-6 py-4 text-center font-black text-xs uppercase">Status</th>
                    <th className="text-right px-6 py-4 font-black text-xs uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filtered.map((ing) => {
                    const current = parseFloat(ing.currentStock || "0");
                    const min = parseFloat(ing.minStock || "0");
                    const isLow = current <= min;

                    return (
                      <tr key={ing.id} className="hover:bg-muted/20">
                        <td className="px-8 py-5 font-bold">{ing.name}</td>
                        <td className="px-6 py-5 text-center font-black">{current} {ing.unit}</td>
                        <td className="px-6 py-5 text-center text-muted-foreground">{min}</td>
                        <td className="px-6 py-5 text-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-black ${isLow ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                            {isLow ? "Low" : "Good"}
                          </span>
                        </td>
                        <td className="text-right px-6 py-5">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-primary/10" onClick={() => openEdit(ing)}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-destructive/10 text-destructive" onClick={() => { if (confirm("Delete?")) deleteIngredient.mutate(ing.id); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="p-16 text-center text-muted-foreground">
                <Droplet className="h-12 w-12 mx-auto mb-2 opacity-10" />
                <p>No ingredients found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recipes Section */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-bold">Product Recipes</h3>
            <p className="text-muted-foreground text-sm">Link ingredients to products</p>
          </div>

          <Dialog open={recipeDialog} onOpenChange={setRecipeDialog}>
            <DialogTrigger asChild>
              <Button className="rounded-xl shadow-md bg-gradient-to-r from-primary to-violet-500 text-white">
                <Plus className="h-4 w-4 mr-2" /> Add Recipe
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[400px] rounded-2xl">
              <DialogHeader>
                <DialogTitle>Create Recipe</DialogTitle>
              </DialogHeader>

              <Form {...recipeForm}>
                <form onSubmit={recipeForm.handleSubmit(onRecipeSubmit)} className="space-y-4 pt-4">
                  <FormField control={recipeForm.control} name="productId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product</FormLabel>
                      <Select value={field.value?.toString() || ""} onValueChange={(v) => field.onChange(parseInt(v))}>
                        <SelectTrigger className="rounded-xl bg-secondary border-none">
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />

                  <FormField control={recipeForm.control} name="ingredientId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ingredient</FormLabel>
                      <Select value={field.value?.toString() || ""} onValueChange={(v) => field.onChange(parseInt(v))}>
                        <SelectTrigger className="rounded-xl bg-secondary border-none">
                          <SelectValue placeholder="Select ingredient" />
                        </SelectTrigger>
                        <SelectContent>
                          {ingredients.map(i => <SelectItem key={i.id} value={i.id.toString()}>{i.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />

                  <FormField control={recipeForm.control} name="quantity" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity Needed</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} placeholder="e.g. 20" className="rounded-xl bg-secondary border-none" />
                      </FormControl>
                    </FormItem>
                  )} />

                  <Button type="submit" className="w-full rounded-xl h-11 font-bold bg-gradient-to-r from-primary to-violet-500 text-white">
                    Create Recipe
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="rounded-3xl shadow-sm border border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/30 border-b border-border/50">
                  <tr>
                    <th className="px-8 py-4 text-left font-black text-xs uppercase">Product</th>
                    <th className="px-6 py-4 text-left font-black text-xs uppercase">Ingredient</th>
                    <th className="px-6 py-4 text-center font-black text-xs uppercase">Qty Needed</th>
                    <th className="text-right px-6 py-4 font-black text-xs uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {recipes.map((recipe) => {
                    const product = products.find(p => p.id === recipe.productId);
                    const ingredient = ingredients.find(i => i.id === recipe.ingredientId);

                    return (
                      <tr key={recipe.id} className="hover:bg-muted/20">
                        <td className="px-8 py-5 font-bold">{product?.name}</td>
                        <td className="px-6 py-5">{ingredient?.name}</td>
                        <td className="px-6 py-5 text-center">{recipe.quantity} {ingredient?.unit}</td>
                        <td className="text-right px-6 py-5">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-destructive/10 text-destructive" onClick={() => { if (confirm("Delete recipe?")) deleteRecipe.mutate(recipe.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {recipes.length === 0 && (
              <div className="p-16 text-center text-muted-foreground">
                <Droplet className="h-12 w-12 mx-auto mb-2 opacity-10" />
                <p>No recipes created yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
