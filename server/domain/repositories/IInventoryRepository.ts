import type {
  Ingredient,
  InsertIngredient,
  ProductRecipe,
  WasteLogEntry,
  StockTransfer,
  StockTransferItem,
} from "@shared/schema";

export interface IInventoryRepository {
  getIngredients(userId: string): Promise<Ingredient[]>;
  getIngredient(id: number, userId: string): Promise<Ingredient | undefined>;
  createIngredient(userId: string, data: InsertIngredient): Promise<Ingredient>;
  updateIngredient(id: number, userId: string, data: Partial<InsertIngredient>): Promise<Ingredient | undefined>;
  deleteIngredient(id: number, userId: string): Promise<void>;
  adjustIngredientStock(id: number, userId: string, delta: number): Promise<Ingredient | undefined>;

  getRecipeForProduct(
    productId: number,
    userId: string,
  ): Promise<(ProductRecipe & { ingredientName: string; unit: string })[]>;
  getProductsUsingIngredient(
    ingredientId: number,
    userId: string,
  ): Promise<{ id: number; name: string; quantity: string }[]>;
  setRecipeForProduct(
    productId: number,
    userId: string,
    items: { ingredientId: number; quantity: string }[],
  ): Promise<void>;
  deductIngredientsForSale(
    userId: string,
    items: { productId: number; quantity: number }[],
  ): Promise<void>;

  getWasteLogs(userId: string, branchId?: number | null): Promise<WasteLogEntry[]>;
  createWasteLog(
    userId: string,
    data: {
      productId?: number | null;
      ingredientId?: number | null;
      itemName: string;
      quantity: string;
      unit?: string;
      reason: string;
      costImpact: string;
      note?: string;
      branchId?: number | null;
    },
  ): Promise<WasteLogEntry>;

  getStockTransfers(
    userId: string,
    branchId?: number | null,
  ): Promise<(StockTransfer & { items: StockTransferItem[] })[]>;
  createStockTransfer(
    userId: string,
    data: {
      fromBranchId?: number | null;
      toBranchId?: number | null;
      notes?: string;
      items: { productId: number; productName: string; quantity: number; note?: string }[];
    },
  ): Promise<StockTransfer & { items: StockTransferItem[] }>;
  updateStockTransferStatus(
    id: number,
    userId: string,
    status: "in_transit" | "received" | "rejected",
  ): Promise<void>;
}
