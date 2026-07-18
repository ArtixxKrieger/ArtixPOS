import { db } from "../../db";
import { dbRead } from "../../db-read";
import { createHash } from "crypto";
import { sales, users, type Sale, type InsertSale } from "@shared/schema";
import { eq, and, isNull, isNotNull, inArray, desc, sql } from "drizzle-orm";
import { getTenantUserIds } from "./base";
import { updateCustomerStats } from "./customers";
import { deductIngredientsForSale } from "./inventory";

export async function getSales(
  userId: string,
  opts: {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
    customerId?: number;
    branchId?: number | null;
    includeVoided?: boolean;
  } = {},
): Promise<Sale[]> {
  try {
    const {
      limit = 200,
      offset = 0,
      startDate,
      endDate,
      customerId,
      branchId,
      includeVoided = false,
    } = opts;
    const userIds = await getTenantUserIds(userId);
    const userCondition =
      userIds.length === 1 ? eq(sales.userId, userIds[0]) : inArray(sales.userId, userIds);
    const conditions: any[] = [userCondition];
    if (!includeVoided) conditions.push(isNull(sales.deletedAt));
    if (startDate) conditions.push(sql`${sales.createdAt} >= ${startDate}`);
    if (endDate) conditions.push(sql`${sales.createdAt} <= ${endDate}`);
    if (customerId) conditions.push(eq(sales.customerId, customerId));
    if (branchId != null) conditions.push(eq(sales.branchId, branchId));

    return await dbRead
      .select()
      .from(sales)
      .where(and(...conditions))
      .orderBy(desc(sales.createdAt))
      .limit(limit)
      .offset(offset);
  } catch (error) {
    console.error("Error fetching sales:", error);
    return [];
  }
}

export async function getSaleById(id: number, userId: string): Promise<Sale | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const userCondition =
      userIds.length === 1 ? eq(sales.userId, userIds[0]) : inArray(sales.userId, userIds);
    const [sale] = await db
      .select()
      .from(sales)
      .where(and(eq(sales.id, id), userCondition, isNull(sales.deletedAt)));
    return sale;
  } catch (error) {
    console.error("Error fetching sale by id:", error);
    return undefined;
  }
}

export async function createSale(userId: string, sale: Omit<InsertSale, "userId">): Promise<Sale> {
  try {
    const saleInput = sale as any;

    return await db.transaction(async (tx) => {
      const [userRow] = await tx
        .select({ tenantId: users.tenantId })
        .from(users)
        .where(eq(users.id, userId));
      const resolvedTenantId = userRow?.tenantId ?? userId;

      const seqResult = await tx.execute(sql`
      INSERT INTO or_sequences (tenant_id, next_val)
      VALUES (${resolvedTenantId}, 1)
      ON CONFLICT (tenant_id) DO UPDATE
        SET next_val = or_sequences.next_val + 1
      RETURNING next_val
    `);
      const seqRows = (seqResult as any).rows ?? seqResult;
      const nextSeq = Number(
        (Array.isArray(seqRows) ? seqRows[0] : (seqRows as any))?.next_val ?? 1,
      );
      const padded = String(nextSeq).padStart(6, "0");
      const receiptNumber = `SR-${padded}`;
      const orNumber = receiptNumber;
      const invoiceNumber = `INV-${padded}`;

      const createdAt = new Date().toISOString();

      const hashPayload = [
        userId,
        receiptNumber,
        orNumber,
        invoiceNumber,
        sale.subtotal ?? "0",
        sale.tax ?? "0",
        sale.discount ?? "0",
        saleInput.vatableSales ?? "0",
        saleInput.vatExemptSales ?? "0",
        saleInput.zeroRatedSales ?? "0",
        sale.total,
        saleInput.discountType ?? "regular",
        createdAt,
      ].join("|");
      const saleHash = createHash("sha256").update(hashPayload).digest("hex");

      const [created] = await tx
        .insert(sales)
        .values({
          ...saleInput,
          userId,
          tenantId: resolvedTenantId,
          receiptNumber,
          orNumber,
          invoiceNumber,
          createdAt,
          saleHash,
        } as any)
        .returning();

      // Fire-and-forget side effects after transaction commits
      if (sale.customerId) {
        void updateCustomerStats(sale.customerId, parseFloat(sale.total) || 0);
      }
      void deductIngredientsForSale(
        userId,
        sale.items as { productId: number; quantity: number }[],
      ).catch((e) => {
        console.error("Recipe deduction failed:", e);
      });
      return created;
    });
  } catch (error) {
    console.error("Error creating sale:", error);
    throw error;
  }
}

export async function softDeleteSale(
  id: number,
  userId: string,
  deletedBy: string,
  reason?: string,
): Promise<boolean> {
  try {
    const userIds = await getTenantUserIds(userId);
    const userCondition =
      userIds.length === 1 ? eq(sales.userId, userIds[0]) : inArray(sales.userId, userIds);
    const [sale] = await db
      .select()
      .from(sales)
      .where(and(eq(sales.id, id), userCondition, isNull(sales.deletedAt)));
    if (!sale) return false;
    await (db.update(sales) as any)
      .set({
        deletedAt: new Date().toISOString(),
        deletedBy,
        ...(reason ? { voidReason: reason } : {}),
      })
      .where(eq(sales.id, id));
    return true;
  } catch (error) {
    console.error("Error soft-deleting sale:", error);
    return false;
  }
}

export async function getDeletedSales(userId: string): Promise<Sale[]> {
  try {
    const userIds = await getTenantUserIds(userId);
    const userCondition =
      userIds.length === 1 ? eq(sales.userId, userIds[0]) : inArray(sales.userId, userIds);
    return await db
      .select()
      .from(sales)
      .where(and(userCondition, isNotNull(sales.deletedAt)));
  } catch (error) {
    console.error("Error fetching deleted sales:", error);
    return [];
  }
}

// ── Dashboard aggregates ──────────────────────────────────────────────────────

export interface DashboardAggregates {
  orderCount: number;
  gross: number;
  net: number;
  refundTotal: number;
}

/**
 * Returns all-time aggregated sales totals for a user/tenant + optional branch.
 * Used by GET /api/dashboard/stats.
 */
export async function getSaleTimestamp(saleId: number): Promise<string | null> {
  const [row] = await db
    .select({ createdAt: sales.createdAt })
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);
  return row?.createdAt ?? null;
}

export async function getDashboardAggregates(
  userId: string,
  branchId: number | null,
): Promise<DashboardAggregates> {
  // Scope to the full tenant when the user belongs to one
  const [userRow] = await db
    .select({ tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, userId));
  const tenantId = userRow?.tenantId ?? null;

  const userCondition = tenantId ? sql`tenant_id = ${tenantId}` : sql`user_id = ${userId}`;
  const branchCondition = branchId != null ? sql`AND branch_id = ${branchId}` : sql``;

  const result = await db.execute(sql`
    SELECT
      COUNT(*)::integer                                                                          AS order_count,
      COALESCE(SUM(CAST(total AS NUMERIC)), 0)::float8                                         AS gross,
      COALESCE(SUM(CASE WHEN deleted_at IS NULL THEN CAST(total AS NUMERIC) ELSE 0 END), 0)::float8 AS net,
      COALESCE(SUM(CASE WHEN deleted_at IS NOT NULL THEN CAST(total AS NUMERIC) ELSE 0 END), 0)::float8 AS refund_total
    FROM sales
    WHERE ${userCondition}
    ${branchCondition}
  `);

  const row = (result.rows as any[])[0] ?? {};
  return {
    orderCount: Number(row.order_count ?? 0),
    gross: Number(row.gross ?? 0),
    net: Number(row.net ?? 0),
    refundTotal: Number(row.refund_total ?? 0),
  };
}
