import type { ICustomerRepository } from "../../../domain/repositories/ICustomerRepository";
import type { Customer, LoyaltyReward, LoyaltyPointsLog } from "@shared/schema";

export interface RedeemLoyaltyRewardResult {
  customer: Customer;
  reward: LoyaltyReward;
  log: LoyaltyPointsLog;
}

/**
 * Use case: Redeem a loyalty reward on behalf of a customer.
 *
 * Business rules:
 * - Reward must be active and not over its redemption limit.
 * - Customer must have enough loyalty points.
 * - All three mutations (deduct points, increment counter, insert log) are
 *   wrapped in a single DB transaction — no partial updates are possible.
 */
export class RedeemLoyaltyRewardUseCase {
  constructor(private readonly customers: ICustomerRepository) {}

  async execute(
    customerId: number,
    rewardId: number,
    userId: string,
  ): Promise<RedeemLoyaltyRewardResult | null> {
    return this.customers.redeemLoyaltyReward(customerId, rewardId, userId);
  }
}
