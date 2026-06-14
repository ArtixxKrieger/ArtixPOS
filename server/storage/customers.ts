import { db } from "../db";
import { dbRead } from "../db-read";
import {
  customers,
  loyaltyTiers,
  loyaltyRewards,
  loyaltyPointsLog,
  type Customer,
  type InsertCustomer,
  type LoyaltyTier,
  type InsertLoyaltyTier,
  type LoyaltyReward,
  type InsertLoyaltyReward,
  type LoyaltyPointsLog,
} from "@shared/schema";
import { eq, and, isNull, inArray, desc, sql } from "drizzle-orm";
import { getTenantUserIds } from "./base";

export async function getCustomers(
  userId: string,
  opts: { limit?: number; offset?: number; orderByTopSpenders?: boolean } = {},
): Promise<Customer[]> {
  try {
    const { limit, offset = 0, orderByTopSpenders = false } = opts;
    const userIds = await getTenantUserIds(userId);
    const whereCond = userIds.length === 1
      ? eq(customers.userId, userIds[0])
      : inArray(customers.userId, userIds);
    const orderExpr = orderByTopSpenders
      ? sql`CAST(total_spent AS NUMERIC) DESC NULLS LAST`
      : desc(customers.createdAt);
    const baseQuery = dbRead.select().from(customers).where(whereCond).orderBy(orderExpr);
    return await (typeof limit === "number" && limit > 0
      ? baseQuery.limit(limit).offset(offset)
      : baseQuery);
  } catch (error) {
    console.error("Error fetching customers:", error);
    return [];
  }
}

export async function getCustomer(id: number, userId: string): Promise<Customer | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    if (!customer) return undefined;
    if (!userIds.includes(customer.userId)) return undefined;
    return customer;
  } catch (error) {
    console.error("Error fetching customer:", error);
    return undefined;
  }
}

export async function createCustomer(userId: string, customer: InsertCustomer): Promise<Customer> {
  try {
    const [created] = await db.insert(customers).values({ ...customer, userId } as any).returning();
    return created;
  } catch (error) {
    console.error("Error creating customer:", error);
    throw error;
  }
}

export async function updateCustomer(id: number, userId: string, customer: Partial<InsertCustomer>): Promise<Customer | undefined> {
  try {
    const existing = await getCustomer(id, userId);
    if (!existing) return undefined;
    const [updated] = await db.update(customers)
      .set(customer as any)
      .where(eq(customers.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error("Error updating customer:", error);
    return undefined;
  }
}

export async function deleteCustomer(id: number, userId: string): Promise<void> {
  try {
    const existing = await getCustomer(id, userId);
    if (!existing) return;
    await db.update(customers).set({ deletedAt: new Date().toISOString() } as any).where(eq(customers.id, id));
  } catch (error) {
    console.error("Error deleting customer:", error);
    throw error;
  }
}

export async function updateCustomerStats(id: number, amount: number): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE customers
      SET total_spent  = ROUND(COALESCE(CAST(total_spent AS NUMERIC), 0) + ${amount}, 2)::text,
          visit_count  = COALESCE(visit_count, 0) + 1
      WHERE id = ${id}
    `);
  } catch (error) {
    console.error("Error updating customer stats:", error);
  }
}

export async function getLoyaltyTiers(userId: string): Promise<LoyaltyTier[]> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1 ? eq(loyaltyTiers.userId, userIds[0]) : inArray(loyaltyTiers.userId, userIds);
  return db.select().from(loyaltyTiers).where(condition).orderBy(loyaltyTiers.sortOrder);
}

export async function createLoyaltyTier(userId: string, tier: InsertLoyaltyTier): Promise<LoyaltyTier> {
  const [created] = await db.insert(loyaltyTiers).values({ ...tier, userId } as any).returning();
  return created;
}

export async function updateLoyaltyTier(id: number, userId: string, tier: Partial<InsertLoyaltyTier>): Promise<LoyaltyTier | undefined> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1 ? and(eq(loyaltyTiers.id, id), eq(loyaltyTiers.userId, userIds[0])) : and(eq(loyaltyTiers.id, id), inArray(loyaltyTiers.userId, userIds));
  const [updated] = await db.update(loyaltyTiers).set(tier as any).where(condition).returning();
  return updated;
}

export async function deleteLoyaltyTier(id: number, userId: string): Promise<void> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1 ? and(eq(loyaltyTiers.id, id), eq(loyaltyTiers.userId, userIds[0])) : and(eq(loyaltyTiers.id, id), inArray(loyaltyTiers.userId, userIds));
  await db.update(loyaltyTiers).set({ deletedAt: new Date().toISOString() } as any).where(condition);
}

export async function getLoyaltyRewards(userId: string): Promise<LoyaltyReward[]> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1 ? and(eq(loyaltyRewards.userId, userIds[0]), isNull(loyaltyRewards.deletedAt)) : and(inArray(loyaltyRewards.userId, userIds), isNull(loyaltyRewards.deletedAt));
  return db.select().from(loyaltyRewards).where(condition).orderBy(loyaltyRewards.pointsCost);
}

export async function createLoyaltyReward(userId: string, reward: InsertLoyaltyReward): Promise<LoyaltyReward> {
  const [created] = await db.insert(loyaltyRewards).values({ ...reward, userId } as any).returning();
  return created;
}

export async function updateLoyaltyReward(id: number, userId: string, reward: Partial<InsertLoyaltyReward>): Promise<LoyaltyReward | undefined> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1 ? and(eq(loyaltyRewards.id, id), eq(loyaltyRewards.userId, userIds[0])) : and(eq(loyaltyRewards.id, id), inArray(loyaltyRewards.userId, userIds));
  const [updated] = await db.update(loyaltyRewards).set(reward as any).where(condition).returning();
  return updated;
}

export async function deleteLoyaltyReward(id: number, userId: string): Promise<void> {
  const userIds = await getTenantUserIds(userId);
  const condition = userIds.length === 1 ? and(eq(loyaltyRewards.id, id), eq(loyaltyRewards.userId, userIds[0])) : and(eq(loyaltyRewards.id, id), inArray(loyaltyRewards.userId, userIds));
  await db.update(loyaltyRewards).set({ deletedAt: new Date().toISOString(), isActive: false } as any).where(condition);
}

export async function redeemLoyaltyReward(customerId: number, rewardId: number, userId: string): Promise<{ customer: Customer; reward: LoyaltyReward; log: LoyaltyPointsLog } | null> {
  try {
    const [reward] = await db.select().from(loyaltyRewards).where(eq(loyaltyRewards.id, rewardId));
    if (!reward || !reward.isActive) return null;
    if (reward.maxRedemptions != null && (reward.redemptionCount ?? 0) >= reward.maxRedemptions) return null;

    const userIds = await getTenantUserIds(userId);
    const cond = userIds.length === 1 ? and(eq(customers.id, customerId), eq(customers.userId, userIds[0])) : and(eq(customers.id, customerId), inArray(customers.userId, userIds));
    const [customer] = await db.select().from(customers).where(cond);
    if (!customer) return null;
    if ((customer.loyaltyPoints ?? 0) < reward.pointsCost) return null;

    const [updatedCustomer] = await db.update(customers).set({
      loyaltyPoints: sql`GREATEST(0, COALESCE(loyalty_points, 0) - ${reward.pointsCost})`,
    } as any).where(eq(customers.id, customerId)).returning();

    await db.update(loyaltyRewards).set({
      redemptionCount: sql`COALESCE(redemption_count, 0) + 1`,
    } as any).where(eq(loyaltyRewards.id, rewardId));
    const newPoints = updatedCustomer?.loyaltyPoints ?? 0;

    const [log] = await db.insert(loyaltyPointsLog).values({
      userId,
      customerId,
      delta: -reward.pointsCost,
      balance: newPoints,
      reason: reward.type === "free_product" ? "redeem_product" : "redeem_discount",
      rewardId,
      note: `Redeemed: ${reward.name}`,
    } as any).returning();
    return { customer: updatedCustomer, reward, log };
  } catch (err) {
    console.error("redeemLoyaltyReward error:", err);
    return null;
  }
}

export async function getLoyaltyPointsLog(customerId: number, userId: string): Promise<LoyaltyPointsLog[]> {
  try {
    const userIds = await getTenantUserIds(userId);
    const cond = userIds.length === 1 ? and(eq(customers.id, customerId), eq(customers.userId, userIds[0])) : and(eq(customers.id, customerId), inArray(customers.userId, userIds));
    const [customer] = await db.select().from(customers).where(cond);
    if (!customer) return [];
    return db.select().from(loyaltyPointsLog).where(eq(loyaltyPointsLog.customerId, customerId)).orderBy(desc(loyaltyPointsLog.createdAt)).limit(100);
  } catch { return []; }
}

export async function addLoyaltyPointsLog(userId: string, customerId: number, delta: number, reason: string, opts?: { saleId?: number; rewardId?: number; note?: string; expiresAt?: string }): Promise<LoyaltyPointsLog> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  const balance = Math.max(0, (customer?.loyaltyPoints ?? 0) + delta);
  const [log] = await db.insert(loyaltyPointsLog).values({
    userId, customerId, delta, balance, reason,
    saleId: opts?.saleId ?? null,
    rewardId: opts?.rewardId ?? null,
    note: opts?.note ?? null,
    expiresAt: opts?.expiresAt ?? null,
  } as any).returning();
  return log;
}

export async function recalcCustomerTier(customerId: number, tiers: LoyaltyTier[]): Promise<void> {
  try {
    const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
    if (!customer) return;
    const lifetimePts = customer.lifetimePoints ?? 0;
    const sorted = [...tiers].sort((a, b) => b.minLifetimePoints - a.minLifetimePoints);
    const matched = sorted.find(t => lifetimePts >= t.minLifetimePoints);
    const newTier = matched?.name?.toLowerCase() ?? "none";
    if (newTier !== customer.tier) {
      await db.update(customers).set({ tier: newTier } as any).where(eq(customers.id, customerId));
    }
  } catch { }
}

export async function adjustLoyaltyPoints(customerId: number, delta: number, userId: string, opts?: { reason?: string; saleId?: number; rewardId?: number; note?: string }): Promise<Customer | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(customers.id, customerId), eq(customers.userId, userIds[0]))
      : and(eq(customers.id, customerId), inArray(customers.userId, userIds));
    const [customer] = await db.select({ id: customers.id }).from(customers).where(condition);
    if (!customer) return undefined;

    const [updated] = await db.update(customers).set({
      loyaltyPoints: sql`GREATEST(0, COALESCE(loyalty_points, 0) + ${delta})`,
      lifetimePoints: sql`CASE WHEN ${delta} > 0 THEN COALESCE(lifetime_points, 0) + ${delta} ELSE COALESCE(lifetime_points, 0) END`,
    } as any).where(eq(customers.id, customerId)).returning();
    const newPoints = updated?.loyaltyPoints ?? 0;

    void db.insert(loyaltyPointsLog).values({
      userId,
      customerId,
      delta,
      balance: newPoints,
      reason: opts?.reason ?? (delta > 0 ? "purchase" : "redeem_discount"),
      saleId: opts?.saleId ?? null,
      rewardId: opts?.rewardId ?? null,
      note: opts?.note ?? null,
    } as any).catch(() => {});

    getLoyaltyTiers(userId).then(tiers => {
      if (tiers.length > 0) recalcCustomerTier(customerId, tiers).catch(() => {});
    }).catch(() => {});

    return updated;
  } catch (error) {
    console.error("Error adjusting loyalty points:", error);
    return undefined;
  }
}
