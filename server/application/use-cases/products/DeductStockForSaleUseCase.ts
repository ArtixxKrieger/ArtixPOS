import type { IProductRepository } from "../../../domain/repositories/IProductRepository";

/**
 * Use case: Deduct product stock for a completed sale.
 *
 * Business rules:
 * - Only products with trackStock=true are deducted.
 * - Deduction is atomic — all products succeed or none do (transaction in repository).
 * - Low-stock and out-of-stock notifications are triggered post-commit.
 * - On transient failure the caller may retry (up to 3 times with backoff).
 */
export class DeductStockForSaleUseCase {
  constructor(private readonly products: IProductRepository) {}

  async execute(userId: string, items: { productId?: number; id?: number; quantity?: number }[]): Promise<void> {
    await this.products.deductProductStockForSale(userId, items);
  }
}
