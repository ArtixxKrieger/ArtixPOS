import type { IInventoryRepository } from "../../../domain/repositories/IInventoryRepository";
import type { StockTransfer, StockTransferItem } from "@shared/schema";

export interface CreateStockTransferInput {
  fromBranchId?: number | null;
  toBranchId?: number | null;
  notes?: string;
  items: { productId: number; productName: string; quantity: number; note?: string }[];
}

/**
 * Use case: Create a stock transfer between branches.
 *
 * Business rules:
 * - Items list must not be empty.
 * - Source branch stock is reduced immediately on creation (status: pending).
 * - Stock audit logs record real previousStock / newStock — never hardcoded zeros.
 * - The destination branch receives stock only when status is updated to "received".
 */
export class CreateStockTransferUseCase {
  constructor(private readonly inventory: IInventoryRepository) {}

  async execute(
    userId: string,
    input: CreateStockTransferInput,
  ): Promise<StockTransfer & { items: StockTransferItem[] }> {
    if (!input.items || input.items.length === 0) {
      throw new Error("Stock transfer must contain at least one item");
    }
    return this.inventory.createStockTransfer(userId, input);
  }
}
