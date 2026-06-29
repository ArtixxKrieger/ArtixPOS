import type { IInventoryRepository } from "../../../domain/repositories/IInventoryRepository";

export interface RecipeItem {
  ingredientId: number;
  quantity: string;
}

/**
 * Use case: Replace all recipe entries for a product.
 *
 * Business rules:
 * - An empty items array clears the recipe.
 * - If items are provided but none pass the tenant ownership check,
 *   the operation is rejected — the recipe is NOT silently wiped.
 * - The replacement (delete + insert) is atomic via a DB transaction.
 */
export class SetRecipeUseCase {
  constructor(private readonly inventory: IInventoryRepository) {}

  async execute(productId: number, userId: string, items: RecipeItem[]): Promise<void> {
    await this.inventory.setRecipeForProduct(productId, userId, items);
  }
}
