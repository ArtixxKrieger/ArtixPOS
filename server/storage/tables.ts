import { db } from "../db";
import {
  tables,
  type Table,
  type InsertTable,
} from "@shared/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { getTenantUserIds } from "./base";

export async function getTables(userId: string): Promise<Table[]> {
  try {
    const userIds = await getTenantUserIds(userId);
    const condition = userIds.length === 1 ? and(eq(tables.userId, userIds[0]), isNull(tables.deletedAt)) : and(inArray(tables.userId, userIds), isNull(tables.deletedAt));
    return await db.select().from(tables).where(condition).orderBy(tables.name);
  } catch (error) {
    console.error("Error fetching tables:", error);
    return [];
  }
}

export async function getTable(id: number, userId: string): Promise<Table | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [table] = await db.select().from(tables).where(and(eq(tables.id, id), isNull(tables.deletedAt)));
    if (!table || !userIds.includes(table.userId)) return undefined;
    return table;
  } catch (error) {
    console.error("Error fetching table:", error);
    return undefined;
  }
}

export async function createTable(userId: string, table: InsertTable): Promise<Table> {
  try {
    const [created] = await db.insert(tables).values({ ...table, userId } as any).returning();
    return created;
  } catch (error) {
    console.error("Error creating table:", error);
    throw error;
  }
}

export async function updateTable(id: number, userId: string, table: Partial<InsertTable>): Promise<Table | undefined> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [existing] = await db.select().from(tables).where(and(eq(tables.id, id), isNull(tables.deletedAt)));
    if (!existing || !userIds.includes(existing.userId)) return undefined;
    const [updated] = await db.update(tables).set(table as any).where(eq(tables.id, id)).returning();
    return updated;
  } catch (error) {
    console.error("Error updating table:", error);
    return undefined;
  }
}

export async function deleteTable(id: number, userId: string): Promise<void> {
  try {
    const userIds = await getTenantUserIds(userId);
    const [existing] = await db.select().from(tables).where(eq(tables.id, id));
    if (!existing || !userIds.includes(existing.userId)) return;
    await db.update(tables).set({ deletedAt: new Date().toISOString() } as any).where(eq(tables.id, id));
  } catch (error) {
    console.error("Error deleting table:", error);
    throw error;
  }
}
