import { db } from "../../db";
import {
  pendingOrders,
  type PendingOrder,
  type InsertPendingOrder,
} from "@shared/schema";
import { eq, and, isNull, inArray, desc, sql, type SQL } from "drizzle-orm";
import { getTenantUserIds } from "./base";

export async function getPendingOrders(
  userId: string,
  branchId?: number | null,
  opts: { limit?: number; offset?: number } = {},
): Promise<PendingOrder[]> {
  try {
    const { limit = 300, offset = 0 } = opts;
    const userIds = await getTenantUserIds(userId);
    const conditions: SQL<unknown>[] = [];
    conditions.push(
      userIds.length === 1
        ? eq(pendingOrders.userId, userIds[0])
        : inArray(pendingOrders.userId, userIds),
    );
    if (branchId != null) conditions.push(eq(pendingOrders.branchId, branchId));
    conditions.push(isNull(pendingOrders.deletedAt));
    return await db
      .select()
      .from(pendingOrders)
      .where(and(...conditions))
      .orderBy(desc(pendingOrders.id))
      .limit(limit)
      .offset(offset);
  } catch (error) {
    console.error("Error fetching pending orders:", error);
    return [];
  }
}

export async function getPendingOrder(id: number, userId: string): Promise<PendingOrder | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const conditions =
      userIds.length === 1
        ? and(eq(pendingOrders.id, id), eq(pendingOrders.userId, userIds[0]), isNull(pendingOrders.deletedAt))
        : and(eq(pendingOrders.id, id), inArray(pendingOrders.userId, userIds), isNull(pendingOrders.deletedAt));
    const [order] = await db.select().from(pendingOrders).where(conditions);
    return order;
  } catch (error) {
    console.error("Error fetching pending order:", error);
    return undefined;
  }
}

export async function createPendingOrder(
  userId: string,
  order: Omit<InsertPendingOrder, "userId">,
): Promise<PendingOrder> {
  try {
    const [created] = await db
      .insert(pendingOrders)
      .values({ ...order, userId } as any)
      .returning();
    return created;
  } catch (error) {
    console.error("Error creating pending order:", error);
    throw error;
  }
}

export async function updatePendingOrder(
  id: number,
  userId: string,
  order: Partial<InsertPendingOrder>,
): Promise<PendingOrder | undefined> {
  try {
    const existing = await getPendingOrder(id, userId);
    if (!existing) return undefined;
    const [updated] = await db
      .update(pendingOrders)
      .set(order as any)
      .where(eq(pendingOrders.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error("Error updating pending order:", error);
    return undefined;
  }
}

export async function deletePendingOrder(id: number, userId: string): Promise<void> {
  try {
    const existing = await getPendingOrder(id, userId);
    if (!existing) return;
    await db
      .update(pendingOrders)
      .set({ deletedAt: new Date().toISOString() } as any)
      .where(eq(pendingOrders.id, id));
  } catch (error) {
    console.error("Error deleting pending order:", error);
    throw error;
  }
}

// ── SSE / alerts ──────────────────────────────────────────────────────────────

/**
 * Returns the count of pending (non-paid, non-deleted) orders for a user.
 * Used by the SSE alert poller.
 */
export async function getPendingOrderCount(userId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt
    FROM   pending_orders
    WHERE  user_id = ${userId}
      AND  deleted_at IS NULL
      AND  status != 'paid'
  `);
  return Number((result.rows[0] as any)?.cnt ?? 0);
}
