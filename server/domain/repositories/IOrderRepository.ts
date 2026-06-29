import type { PendingOrder, InsertPendingOrder } from "@shared/schema";

export interface IOrderRepository {
  getPendingOrders(
    userId: string,
    branchId?: number | null,
    opts?: { limit?: number; offset?: number },
  ): Promise<PendingOrder[]>;
  getPendingOrder(id: number, userId: string): Promise<PendingOrder | undefined>;
  createPendingOrder(userId: string, order: Omit<InsertPendingOrder, "userId">): Promise<PendingOrder>;
  updatePendingOrder(
    id: number,
    userId: string,
    order: Partial<InsertPendingOrder>,
  ): Promise<PendingOrder | undefined>;
  deletePendingOrder(id: number, userId: string): Promise<void>;
}
