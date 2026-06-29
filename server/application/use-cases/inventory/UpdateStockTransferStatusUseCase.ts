import type { IInventoryRepository } from "../../../domain/repositories/IInventoryRepository";

export type TransferStatus = "in_transit" | "received" | "rejected";

/**
 * Use case: Advance a stock transfer through its lifecycle.
 *
 * Business rules:
 * - "received": adds quantity to the destination branch with real stock log entries.
 * - "rejected": restores quantity to the source branch with real stock log entries.
 * - Stock audit logs always carry real previousStock / newStock values.
 */
export class UpdateStockTransferStatusUseCase {
  constructor(private readonly inventory: IInventoryRepository) {}

  async execute(id: number, userId: string, status: TransferStatus): Promise<void> {
    await this.inventory.updateStockTransferStatus(id, userId, status);
  }
}
