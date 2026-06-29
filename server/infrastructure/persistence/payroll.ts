import { db } from "../../db";
import {
  payrollPeriods,
  payrollEntries,
  timeLogs,
  sales,
  users,
  type PayrollPeriod,
  type InsertPayrollPeriod,
  type PayrollEntry,
  type UpdatePayrollEntry,
} from "@shared/schema";
import { eq, and, inArray, isNotNull, gte, lte, desc, sql } from "drizzle-orm";
import { getTenantUserIds } from "./base";

export async function getPayrollPeriods(userId: string): Promise<PayrollPeriod[]> {
  const userIds = await getTenantUserIds(userId);
  return db.select().from(payrollPeriods)
    .where(inArray(payrollPeriods.userId, userIds))
    .orderBy(desc(payrollPeriods.createdAt));
}

export async function getPayrollPeriod(id: number, userId: string): Promise<PayrollPeriod | undefined> {
  const userIds = await getTenantUserIds(userId);
  const [p] = await db.select().from(payrollPeriods).where(
    and(eq(payrollPeriods.id, id), inArray(payrollPeriods.userId, userIds))
  );
  return p;
}

export async function createPayrollPeriod(userId: string, data: InsertPayrollPeriod): Promise<PayrollPeriod> {
  const userIds = await getTenantUserIds(userId);
  const [period] = await db.insert(payrollPeriods).values({
    userId,
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    notes: data.notes ?? null,
    status: "draft",
  } as any).returning();

  const employees = await db.select().from(users).where(inArray(users.id, userIds));
  const start = new Date(data.startDate).toISOString();
  const endInclusive = new Date(new Date(data.endDate).getTime() + 24 * 60 * 60_000 - 1).toISOString();

  const inWindowLogs = await db.select().from(timeLogs).where(
    and(
      inArray(timeLogs.userId, userIds),
      isNotNull(timeLogs.clockOut),
      gte(timeLogs.clockIn, start),
      lte(timeLogs.clockIn, endInclusive),
    )
  );

  const inWindowSales = await db.select().from(sales).where(
    and(
      inArray(sales.userId, userIds),
      sql`${sales.deletedAt} IS NULL`,
      gte(sales.createdAt, start),
      lte(sales.createdAt, endInclusive),
    )
  );
  const tipPool = inWindowSales.reduce((sum, s) => sum + (parseFloat(s.tip || "0") || 0), 0);

  let totalAmount = 0;
  const entries: any[] = [];

  const employeesWithHours = new Set<string>();
  for (const l of inWindowLogs) employeesWithHours.add(l.userId);
  const tipShare = employeesWithHours.size > 0 ? tipPool / employeesWithHours.size : 0;

  for (const emp of employees) {
    const wageType = (emp as any).wageType || "none";
    if (wageType === "none") continue;
    const wageRate = parseFloat((emp as any).wageRate || "0") || 0;
    const commissionPct = parseFloat((emp as any).commissionPercent || "0") || 0;

    const empLogs = inWindowLogs.filter(l => l.userId === emp.id);
    const hours = empLogs.reduce((sum, l) => {
      if (!l.clockOut) return sum;
      const ms = new Date(l.clockOut).getTime() - new Date(l.clockIn ?? l.clockOut).getTime();
      return sum + Math.max(0, ms / 3600000);
    }, 0);

    let baseAmount = 0;
    if (wageType === "hourly") baseAmount = hours * wageRate;
    else if (wageType === "monthly") baseAmount = wageRate;
    else if (wageType === "commission") baseAmount = 0;

    const empSales = inWindowSales.filter(s => s.cashierId === emp.id);
    const empSubtotal = empSales.reduce((sum, s) => sum + (parseFloat(s.subtotal || "0") || 0), 0);
    const commissionAmount = (empSubtotal * commissionPct) / 100;

    const empTip = employeesWithHours.has(emp.id) ? tipShare : 0;

    const net = baseAmount + commissionAmount + empTip;
    totalAmount += net;

    entries.push({
      periodId: period.id,
      employeeUserId: emp.id,
      employeeName: emp.name || emp.email,
      wageType,
      wageRate: String(wageRate),
      hoursWorked: hours.toFixed(2),
      baseAmount: baseAmount.toFixed(2),
      commissionAmount: commissionAmount.toFixed(2),
      tipAmount: empTip.toFixed(2),
      bonusAmount: "0",
      deductionAmount: "0",
      advanceAmount: "0",
      netAmount: net.toFixed(2),
    });
  }

  if (entries.length > 0) {
    await db.insert(payrollEntries).values(entries as any);
  }
  const [updated] = await db.update(payrollPeriods)
    .set({ totalAmount: totalAmount.toFixed(2) } as any)
    .where(eq(payrollPeriods.id, period.id))
    .returning();
  return updated;
}

export async function getPayrollEntries(periodId: number, userId: string): Promise<PayrollEntry[]> {
  const period = await getPayrollPeriod(periodId, userId);
  if (!period) return [];
  return db.select().from(payrollEntries).where(eq(payrollEntries.periodId, periodId));
}

export async function updatePayrollEntry(id: number, userId: string, data: UpdatePayrollEntry): Promise<PayrollEntry | undefined> {
  const [entry] = await db.select().from(payrollEntries).where(eq(payrollEntries.id, id));
  if (!entry) return undefined;
  const period = await getPayrollPeriod(entry.periodId, userId);
  if (!period) return undefined;
  const merged = { ...entry, ...data } as any;
  const base = parseFloat(merged.baseAmount || "0") || 0;
  const comm = parseFloat(merged.commissionAmount || "0") || 0;
  const tip = parseFloat(merged.tipAmount || "0") || 0;
  const bonus = parseFloat(merged.bonusAmount || "0") || 0;
  const ded = parseFloat(merged.deductionAmount || "0") || 0;
  const adv = parseFloat(merged.advanceAmount || "0") || 0;
  const net = base + comm + tip + bonus - ded - adv;
  const [updated] = await db.update(payrollEntries).set({
    ...data,
    netAmount: net.toFixed(2),
  } as any).where(eq(payrollEntries.id, id)).returning();

  const allEntries = await db.select().from(payrollEntries).where(eq(payrollEntries.periodId, entry.periodId));
  const total = allEntries.reduce((s, e) => s + (parseFloat(e.netAmount || "0") || 0), 0);
  await db.update(payrollPeriods).set({ totalAmount: total.toFixed(2) } as any).where(eq(payrollPeriods.id, entry.periodId));
  return updated;
}

export async function finalizePayrollPeriod(id: number, userId: string): Promise<PayrollPeriod | undefined> {
  const period = await getPayrollPeriod(id, userId);
  if (!period) return undefined;
  const [updated] = await db.update(payrollPeriods).set({
    status: "finalized",
    finalizedAt: new Date().toISOString(),
  } as any).where(eq(payrollPeriods.id, id)).returning();
  return updated;
}

export async function markPayrollPeriodPaid(id: number, userId: string): Promise<PayrollPeriod | undefined> {
  const period = await getPayrollPeriod(id, userId);
  if (!period) return undefined;
  const [updated] = await db.update(payrollPeriods).set({
    status: "paid",
    paidAt: new Date().toISOString(),
  } as any).where(eq(payrollPeriods.id, id)).returning();
  return updated;
}

export async function deletePayrollPeriod(id: number, userId: string): Promise<void> {
  const period = await getPayrollPeriod(id, userId);
  if (!period) return;
  await db.transaction(async (tx) => {
    await tx.delete(payrollEntries).where(eq(payrollEntries.periodId, id));
    await tx.update(payrollPeriods)
      .set({ deletedAt: new Date().toISOString() } as any)
      .where(eq(payrollPeriods.id, id));
  });
}

export async function updateUserWage(targetUserId: string, requesterId: string, data: { wageType: string; wageRate: string; commissionPercent: string }): Promise<any> {
  const userIds = await getTenantUserIds(requesterId);
  if (!userIds.includes(targetUserId)) return undefined;
  const [updated] = await db.update(users).set({
    wageType: data.wageType,
    wageRate: data.wageRate,
    commissionPercent: data.commissionPercent,
  } as any).where(eq(users.id, targetUserId)).returning();
  return updated;
}
