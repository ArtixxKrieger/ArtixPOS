import { db } from "../db";
import {
  expenses,
  type Expense,
  type InsertExpense,
} from "@shared/schema";
import { eq, and, inArray, desc, type SQL } from "drizzle-orm";
import { getTenantUserIds } from "./base";

export async function getExpenses(
  userId: string,
  branchIdOrOpts?: number | null | { branchId?: number | null; limit?: number; offset?: number },
): Promise<Expense[]> {
  try {
    const isOpts = (v: unknown): v is { branchId?: number | null; limit?: number; offset?: number } =>
      typeof v === "object" && v !== null;
    const branchId: number | null | undefined = isOpts(branchIdOrOpts) ? branchIdOrOpts.branchId : branchIdOrOpts;
    const limit: number | undefined = isOpts(branchIdOrOpts) ? branchIdOrOpts.limit : undefined;
    const offset: number = (isOpts(branchIdOrOpts) ? branchIdOrOpts.offset : undefined) ?? 0;
    const userIds = await getTenantUserIds(userId);
    const conditions: SQL<unknown>[] = [];
    conditions.push(userIds.length === 1 ? eq(expenses.userId, userIds[0]) : inArray(expenses.userId, userIds));
    if (branchId != null) conditions.push(eq(expenses.branchId, branchId));
    const baseQuery = db.select().from(expenses).where(and(...conditions)).orderBy(desc(expenses.createdAt));
    return await (typeof limit === "number" && limit > 0
      ? baseQuery.limit(limit).offset(offset)
      : baseQuery);
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return [];
  }
}

export async function createExpense(userId: string, expense: InsertExpense): Promise<Expense> {
  try {
    const [created] = await db.insert(expenses).values({ ...expense, userId } as any).returning();
    return created;
  } catch (error) {
    console.error("Error creating expense:", error);
    throw error;
  }
}

export async function updateExpense(id: number, userId: string, expense: Partial<InsertExpense>): Promise<Expense | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [existing] = await db.select().from(expenses).where(eq(expenses.id, id));
    if (!existing || !userIds.includes(existing.userId)) return undefined;
    const [updated] = await db.update(expenses)
      .set(expense as any)
      .where(eq(expenses.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error("Error updating expense:", error);
    return undefined;
  }
}

export async function deleteExpense(id: number, userId: string): Promise<void> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [existing] = await db.select().from(expenses).where(eq(expenses.id, id));
    if (!existing || !userIds.includes(existing.userId)) return;
    await db.update(expenses).set({ deletedAt: new Date().toISOString() } as any).where(eq(expenses.id, id));
  } catch (error) {
    console.error("Error deleting expense:", error);
    throw error;
  }
}
