import type { Sale, InsertSale } from "@shared/schema";

export interface ISaleRepository {
  getSales(
    userId: string,
    opts?: {
      limit?: number;
      offset?: number;
      startDate?: string;
      endDate?: string;
      customerId?: number;
      branchId?: number | null;
      includeVoided?: boolean;
    },
  ): Promise<Sale[]>;
  getSaleById(id: number, userId: string): Promise<Sale | undefined>;
  createSale(userId: string, sale: Omit<InsertSale, "userId">): Promise<Sale>;
  softDeleteSale(id: number, userId: string, deletedBy: string, reason?: string): Promise<boolean>;
  getDeletedSales(userId: string): Promise<Sale[]>;
}
