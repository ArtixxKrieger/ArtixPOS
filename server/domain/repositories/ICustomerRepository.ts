import type {
  Customer,
  InsertCustomer,
  LoyaltyTier,
  InsertLoyaltyTier,
  LoyaltyReward,
  InsertLoyaltyReward,
  LoyaltyPointsLog,
} from "@shared/schema";

export interface ICustomerRepository {
  getCustomers(
    userId: string,
    opts?: { limit?: number; offset?: number; orderByTopSpenders?: boolean },
  ): Promise<Customer[]>;
  getCustomer(id: number, userId: string): Promise<Customer | undefined>;
  createCustomer(userId: string, customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, userId: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: number, userId: string): Promise<void>;
  updateCustomerStats(id: number, amount: number): Promise<void>;

  getLoyaltyTiers(userId: string): Promise<LoyaltyTier[]>;
  createLoyaltyTier(userId: string, tier: InsertLoyaltyTier): Promise<LoyaltyTier>;
  updateLoyaltyTier(id: number, userId: string, tier: Partial<InsertLoyaltyTier>): Promise<LoyaltyTier | undefined>;
  deleteLoyaltyTier(id: number, userId: string): Promise<void>;

  getLoyaltyRewards(userId: string): Promise<LoyaltyReward[]>;
  createLoyaltyReward(userId: string, reward: InsertLoyaltyReward): Promise<LoyaltyReward>;
  updateLoyaltyReward(
    id: number,
    userId: string,
    reward: Partial<InsertLoyaltyReward>,
  ): Promise<LoyaltyReward | undefined>;
  deleteLoyaltyReward(id: number, userId: string): Promise<void>;
  redeemLoyaltyReward(
    customerId: number,
    rewardId: number,
    userId: string,
  ): Promise<{ customer: Customer; reward: LoyaltyReward; log: LoyaltyPointsLog } | null>;
  getLoyaltyPointsLog(customerId: number, userId: string): Promise<LoyaltyPointsLog[]>;
  addLoyaltyPointsLog(
    userId: string,
    customerId: number,
    delta: number,
    reason: string,
    opts?: { saleId?: number; rewardId?: number; note?: string; expiresAt?: string },
  ): Promise<LoyaltyPointsLog>;
  recalcCustomerTier(customerId: number, tiers: LoyaltyTier[]): Promise<void>;
  adjustLoyaltyPoints(
    customerId: number,
    delta: number,
    userId: string,
    opts?: { reason?: string; saleId?: number; rewardId?: number; note?: string },
  ): Promise<Customer | undefined>;
}
