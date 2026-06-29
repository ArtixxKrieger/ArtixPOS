import { db } from "../../db";
import {
  discountCodes,
  refunds,
  sales,
  users,
  type DiscountCode,
  type InsertDiscountCode,
  type Refund,
  type InsertRefund,
  type RefundWithDetails,
} from "@shared/schema";
import { eq, and, isNull, inArray, desc, sql } from "drizzle-orm";
import { getTenantUserIds } from "./base";

export async function getDiscountCodes(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<DiscountCode[]> {
  try {
    const { limit, offset = 0 } = opts;
    const userIds = await getTenantUserIds(userId);
    const whereCond = userIds.length === 1
      ? and(eq(discountCodes.userId, userIds[0]), isNull(discountCodes.deletedAt))
      : and(inArray(discountCodes.userId, userIds), isNull(discountCodes.deletedAt));
    const baseQuery = db.select().from(discountCodes).where(whereCond).orderBy(desc(discountCodes.createdAt));
    return await (typeof limit === "number" && limit > 0
      ? baseQuery.limit(limit).offset(offset)
      : baseQuery);
  } catch (error) {
    console.error("Error fetching discount codes:", error);
    return [];
  }
}

export async function getDiscountCodeByCode(code: string, userId: string): Promise<DiscountCode | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const upperCode = code.toUpperCase();
    const condition = userIds.length === 1
      ? and(eq(discountCodes.code, upperCode), eq(discountCodes.userId, userIds[0]), isNull(discountCodes.deletedAt))
      : and(eq(discountCodes.code, upperCode), inArray(discountCodes.userId, userIds), isNull(discountCodes.deletedAt));
    const [dc] = await db.select().from(discountCodes).where(condition);
    return dc;
  } catch (error) {
    console.error("Error fetching discount code:", error);
    return undefined;
  }
}

export async function createDiscountCode(userId: string, code: InsertDiscountCode): Promise<DiscountCode> {
  try {
    const [created] = await db.insert(discountCodes).values({
      ...code,
      code: code.code.toUpperCase(),
      userId,
    } as any).returning();
    return created;
  } catch (error) {
    console.error("Error creating discount code:", error);
    throw error;
  }
}

export async function updateDiscountCode(id: number, userId: string, code: Partial<InsertDiscountCode>): Promise<DiscountCode | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [existing] = await db.select().from(discountCodes).where(and(eq(discountCodes.id, id), isNull(discountCodes.deletedAt)));
    if (!existing || !userIds.includes(existing.userId)) return undefined;
    const [updated] = await db.update(discountCodes)
      .set(code as any)
      .where(eq(discountCodes.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error("Error updating discount code:", error);
    return undefined;
  }
}

export async function deleteDiscountCode(id: number, userId: string): Promise<void> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [existing] = await db.select().from(discountCodes).where(eq(discountCodes.id, id));
    if (!existing || !userIds.includes(existing.userId)) return;
    await db.update(discountCodes).set({ deletedAt: new Date().toISOString(), isActive: false } as any).where(eq(discountCodes.id, id));
  } catch (error) {
    console.error("Error deleting discount code:", error);
    throw error;
  }
}

export async function incrementDiscountCodeUsage(id: number): Promise<boolean> {
  try {
    const result = await db.update(discountCodes)
      .set({ usedCount: sql`COALESCE(used_count, 0) + 1` } as any)
      .where(and(
        eq(discountCodes.id, id),
        sql`(max_uses IS NULL OR COALESCE(used_count, 0) < max_uses)`
      ))
      .returning({ id: discountCodes.id });
    return result.length > 0;
  } catch (error) {
    console.error("Error incrementing discount code usage:", error);
    return false;
  }
}

export async function getRefunds(userId: string): Promise<RefundWithDetails[]> {
  try {
    const userIds = await getTenantUserIds(userId);
    const userCondition = userIds.length === 1
      ? eq(refunds.userId, userIds[0])
      : inArray(refunds.userId, userIds);

    const results = await db
      .select({
        id: refunds.id,
        saleId: refunds.saleId,
        userId: refunds.userId,
        items: refunds.items,
        amount: refunds.amount,
        reason: refunds.reason,
        createdAt: refunds.createdAt,
        processedByName: users.name,
        processedByEmail: users.email,
        saleTotal: sales.total,
        saleCreatedAt: sales.createdAt,
      })
      .from(refunds)
      .leftJoin(users, eq(refunds.userId, users.id))
      .leftJoin(sales, eq(refunds.saleId, sales.id))
      .where(userCondition)
      .orderBy(desc(refunds.createdAt))
      .limit(500);

    return results as RefundWithDetails[];
  } catch (error) {
    console.error("Error fetching refunds:", error);
    return [];
  }
}

export async function getRefundsBySale(saleId: number, userId: string): Promise<Refund[]> {
  try {
    const userIds = await getTenantUserIds(userId);
    const saleOwnerCond = userIds.length === 1
      ? and(eq(sales.id, saleId), eq(sales.userId, userIds[0]))
      : and(eq(sales.id, saleId), inArray(sales.userId, userIds));
    const [saleRow] = await db.select({ id: sales.id }).from(sales).where(saleOwnerCond);
    if (!saleRow) return [];
    return await db.select().from(refunds).where(eq(refunds.saleId, saleId));
  } catch (error) {
    console.error("Error fetching refunds by sale:", error);
    return [];
  }
}

export async function createRefund(userId: string, refund: InsertRefund): Promise<Refund> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [existingSale] = await db.select({ userId: sales.userId }).from(sales)
      .where(eq(sales.id, refund.saleId));
    if (!existingSale || !userIds.includes(existingSale.userId)) {
      throw new Error("Sale not found or access denied");
    }
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(refunds).values({ ...refund, userId } as any).returning();
      await (tx.update(sales) as any)
        .set({ refundedAt: new Date().toISOString(), refundedBy: userId })
        .where(eq(sales.id, refund.saleId));
      return created;
    });
  } catch (error) {
    console.error("Error creating refund:", error);
    throw error;
  }
}
