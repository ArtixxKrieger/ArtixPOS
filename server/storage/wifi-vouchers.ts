import { db } from "../db";
import { randomBytes } from "crypto";
import {
  wifiVouchers,
  type WifiVoucher,
  type InsertWifiVoucher,
} from "@shared/schema";
import { eq, and, inArray, lt, desc } from "drizzle-orm";
import { getTenantUserIds } from "./base";

export async function getWifiVouchers(userId: string): Promise<WifiVoucher[]> {
  const userIds = await getTenantUserIds(userId);
  return db.select().from(wifiVouchers)
    .where(inArray(wifiVouchers.userId, userIds))
    .orderBy(desc(wifiVouchers.createdAt))
    .limit(200);
}

export async function createWifiVoucher(userId: string, data: InsertWifiVoucher & { saleId?: number | null }): Promise<WifiVoucher> {
  const code = randomBytes(6).toString('hex').toUpperCase();
  const [created] = await db.insert(wifiVouchers).values({
    userId,
    branchId: data.branchId ?? null,
    code,
    durationMinutes: data.durationMinutes,
    customerName: data.customerName ?? null,
    customerEmail: data.customerEmail ?? null,
    saleId: data.saleId ?? null,
    status: "unused",
  } as any).returning();
  return created;
}

export async function redeemWifiVoucher(code: string, userId: string): Promise<WifiVoucher | undefined> {
  const userIds = await getTenantUserIds(userId);
  const [v] = await db.select().from(wifiVouchers).where(
    and(eq(wifiVouchers.code, code), inArray(wifiVouchers.userId, userIds))
  );
  if (!v) return undefined;
  if (v.status !== "unused") return v;
  const now = new Date();
  const expires = new Date(now.getTime() + (v.durationMinutes ?? 60) * 60_000);
  const [updated] = await db.update(wifiVouchers).set({
    status: "active",
    redeemedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  } as any).where(eq(wifiVouchers.id, v.id)).returning();
  return updated;
}

export async function updateWifiVoucherMikrotikId(id: number, mikrotikUserId: string): Promise<void> {
  await db.update(wifiVouchers)
    .set({ mikrotikUserId } as any)
    .where(eq(wifiVouchers.id, id));
}

export async function expireOverdueVouchers(): Promise<Array<{ id: number; mikrotikUserId: string | null; userId: string }>> {
  const now = new Date().toISOString();
  return db.update(wifiVouchers)
    .set({ status: "expired" } as any)
    .where(and(eq(wifiVouchers.status, "active"), lt(wifiVouchers.expiresAt, now)))
    .returning({
      id: wifiVouchers.id,
      mikrotikUserId: wifiVouchers.mikrotikUserId,
      userId: wifiVouchers.userId,
    });
}
