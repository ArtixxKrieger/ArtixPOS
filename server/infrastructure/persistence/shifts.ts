import { db } from "../../db";
import {
  shifts,
  sales,
  expenses,
  type Shift,
} from "@shared/schema";
import { eq, and, inArray, desc, isNull, sql } from "drizzle-orm";
import { getTenantUserIds } from "./base";

export async function getShifts(userId: string, opts: { limit?: number; offset?: number } = {}): Promise<Shift[]> {
  try {
    const { limit = 200, offset = 0 } = opts;
    const userIds = await getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? eq(shifts.userId, userIds[0])
      : inArray(shifts.userId, userIds);
    return await db.select().from(shifts)
      .where(condition)
      .orderBy(desc(shifts.openedAt))
      .limit(limit)
      .offset(offset);
  } catch (error) {
    console.error("Error fetching shifts:", error);
    return [];
  }
}

export async function getOpenShift(userId: string): Promise<Shift | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const condition = userIds.length === 1
      ? and(eq(shifts.userId, userIds[0]), eq(shifts.status, "open"))
      : and(inArray(shifts.userId, userIds), eq(shifts.status, "open"));
    const [shift] = await db.select().from(shifts).where(condition);
    return shift;
  } catch (error) {
    console.error("Error fetching open shift:", error);
    return undefined;
  }
}

export async function openShift(userId: string, openingBalance: string, notes?: string, denominationOpen?: string): Promise<Shift> {
  try {
    const [created] = await db.insert(shifts).values({
      userId,
      openingBalance,
      notes: notes ?? null,
      status: "open",
      denominationOpen: denominationOpen ?? null,
      cashIn: "0",
      cashOut: "0",
    } as any).returning();
    return created;
  } catch (error) {
    console.error("Error opening shift:", error);
    throw error;
  }
}

export async function closeShift(id: number, userId: string, closingBalance: string, notes?: string, denominationClose?: string, variance?: string): Promise<Shift | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [existing] = await db.select().from(shifts).where(eq(shifts.id, id));
    if (!existing || !userIds.includes(existing.userId)) return undefined;

    const shiftSales = await db.select().from(sales).where(
      and(
        inArray(sales.userId, userIds),
        isNull(sales.deletedAt),
        sql`${sales.createdAt} >= ${existing.openedAt}`
      )
    );
    const totalSalesAmount = shiftSales.reduce((acc, s) => acc + parseFloat(s.total || "0"), 0);

    const shiftExpenses = await db.select().from(expenses).where(
      and(
        inArray(expenses.userId, userIds),
        sql`${expenses.createdAt} >= ${existing.openedAt}`
      )
    );
    const totalExpensesAmount = shiftExpenses.reduce((acc, e) => acc + parseFloat(e.amount || "0"), 0);

    const [updated] = await db.update(shifts)
      .set({
        status: "closed",
        closingBalance,
        closedAt: new Date().toISOString(),
        totalSales: totalSalesAmount.toFixed(2),
        totalExpenses: totalExpensesAmount.toFixed(2),
        salesCount: shiftSales.length,
        notes: notes ?? existing.notes,
        denominationClose: denominationClose ?? null,
        variance: variance ?? null,
      } as any)
      .where(eq(shifts.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error("Error closing shift:", error);
    return undefined;
  }
}

export async function getShiftById(shiftId: number, userId: string): Promise<Shift | undefined> {
  const [row] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.id, shiftId), eq(shifts.userId, userId)))
    .limit(1);
  return row;
}

export async function getClosedShiftsForUser(userId: string): Promise<{ openedAt: string | null; closedAt: string | null }[]> {
  return db
    .select({ openedAt: shifts.openedAt, closedAt: shifts.closedAt })
    .from(shifts)
    .where(and(eq(shifts.userId, userId), eq(shifts.status, "closed")));
}

export async function addCashAdjustment(shiftId: number, userId: string, type: "in" | "out", amount: string, reason: string): Promise<Shift | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [existing] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
    if (!existing || !userIds.includes(existing.userId) || existing.status !== "open") return undefined;

    const adj = { type, amount, reason, timestamp: new Date().toISOString() };
    const existingAdjs = (() => { try { return JSON.parse(existing.cashAdjustments ?? "[]"); } catch { return []; } })();
    existingAdjs.push(adj);

    const prevIn = parseFloat(existing.cashIn ?? "0");
    const prevOut = parseFloat(existing.cashOut ?? "0");
    const amtNum = parseFloat(amount) || 0;

    const [updated] = await db.update(shifts).set({
      cashAdjustments: JSON.stringify(existingAdjs),
      cashIn: type === "in" ? (prevIn + amtNum).toFixed(2) : existing.cashIn,
      cashOut: type === "out" ? (prevOut + amtNum).toFixed(2) : existing.cashOut,
    } as any).where(eq(shifts.id, shiftId)).returning();
    return updated;
  } catch (error) {
    console.error("Error adding cash adjustment:", error);
    return undefined;
  }
}
