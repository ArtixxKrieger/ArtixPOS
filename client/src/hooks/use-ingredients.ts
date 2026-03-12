import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type InsertIngredient, type InsertRecipe } from "@shared/schema";

export function useIngredients() {
  return useQuery({
    queryKey: ["/api/ingredients"],
    queryFn: async () => {
      const res = await fetch("/api/ingredients");
      if (!res.ok) throw new Error("Failed to fetch ingredients");
      return res.json();
    },
  });
}

export function useCreateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertIngredient) => {
      const res = await fetch("/api/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create ingredient");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] }),
  });
}

export function useUpdateIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<InsertIngredient>) => {
      const res = await fetch(`/api/ingredients/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update ingredient");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] }),
  });
}

export function useDeleteIngredient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/ingredients/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete ingredient");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ingredients"] }),
  });
}

// Recipes
export function useRecipes() {
  return useQuery({
    queryKey: ["/api/recipes"],
    queryFn: async () => {
      const res = await fetch("/api/recipes");
      if (!res.ok) throw new Error("Failed to fetch recipes");
      return res.json();
    },
  });
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertRecipe) => {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create recipe");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/recipes"] }),
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/recipes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete recipe");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/recipes"] }),
  });
}
