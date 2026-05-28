import type { Express, Request, Response } from "express";
import { db } from "./db";
import { users, timeLogs, sales, payrollPeriods, payrollEntries, userBranches } from "@shared/schema";
import { and, eq, gte, lte, inArray, isNull, isNotNull, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireOwner, requireTenant, getAuthUser, getSubscription, isProSubscription } from "./middleware";

interface PayrollEntry {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  wageType: "none" | "hourly" | "monthly" | "commission";
  wageRate: number;
  commissionPercent: number;
  hoursWorked: number;
  salesAmount: number;
  payout: number;
  notes: string;
}

async function ensurePro(req: Request, res: Response): Promise<boolean> {
  const user = getAuthUser(req);
  if (!user.tenantId) {
    res.status(403).json({ message: "No tenant" });
    return false;
  }
  const sub = await getSubscription(user.tenantId);
  if (!isProSubscription(sub)) {
    res.status(403).json({ message: "Payroll is a Pro feature.", code: "PRO_REQUIRED" });
    return false;
  }
  return true;
}

export function registerPayrollRoutes(app: Express) {
  // ── CSV Export for a pay period ─────────────────────────────────────────────
  app.get("/api/payroll/periods/:id/export-csv", requireAuth, requireTenant, async (req, res, next) => {
    try {
      if (!(await ensurePro(req, res))) return;
      const _user = getAuthUser(req);
      const periodId = Number(req.params.id);

      const [period] = await db
        .select()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(payrollPeriods as any)
        .where(eq((payrollPeriods as any).id, periodId));

      if (!period || (period as any).deletedAt) {
        return res.status(404).json({ message: "Period not found" });
      }

      const entries = await db
        .select()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(payrollEntries as any)
        .where(eq((payrollEntries as any).periodId, periodId));

      const rows = (entries as any[]).map((e) => ({
        Employee: e.employeeName,
        "Wage Type": e.wageType,
        "Hours Worked": e.hoursWorked || "0",
        "Base Pay": e.baseAmount,
        Commission: e.commissionAmount || "0",
        Tips: e.tipAmount || "0",
        Bonus: e.bonusAmount || "0",
        Deductions: e.deductionAmount || "0",
        "Advance Deduction": e.advanceAmount || "0",
        "Net Pay": e.netAmount,
        Notes: e.notes || "",
      }));

      const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
      const lines = [
        headers.join(","),
        ...rows.map((r) => headers.map((h) => JSON.stringify((r as Record<string, unknown>)[h] ?? "")).join(",")),
      ].join("\n");

      const name = ((period as any).name || `period-${periodId}`).replace(/[^a-z0-9_\-]/gi, "_");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="payroll-${name}.csv"`);
      res.send(lines);
    } catch (err) {
      next(err);
    }
  });


  // ── List staff with wage info ───────────────────────────────────────────────
  app.get("/api/payroll/staff", requireAuth, requireTenant, async (req, res, next) => {
    try {
      if (!(await ensurePro(req, res))) return;
      const user = getAuthUser(req);
      const list = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          wageType: users.wageType,
          wageRate: users.wageRate,
          commissionPercent: users.commissionPercent,
          staffGroup: users.staffGroup,
        })
        .from(users)
        .where(eq(users.tenantId, user.tenantId!));
      res.json(list);
    } catch (err) {
      next(err);
    }
  });

  // ── Update a single user's wage settings ────────────────────────────────────
  app.put("/api/payroll/staff/:id", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      if (!(await ensurePro(req, res))) return;
      const user = getAuthUser(req);
      const schema = z.object({
        wageType: z.enum(["none", "hourly", "monthly", "commission"]),
        wageRate: z.union([z.string(), z.number()]).transform((v) => String(v)),
        commissionPercent: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
        staffGroup: z.string().optional().nullable(),
      });
      const input = schema.parse(req.body);

      const [target] = await db.select().from(users).where(eq(users.id, req.params.id as string));
      if (!target || target.tenantId !== user.tenantId) {
        return res.status(404).json({ message: "Staff member not found" });
      }

      await db
        .update(users)
        .set({
          wageType: input.wageType,
          wageRate: input.wageRate,
          commissionPercent: input.commissionPercent ?? "0",
          staffGroup: input.staffGroup ?? null,
        })
        .where(eq(users.id, req.params.id as string));

      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // ── Compute payroll for a date range ────────────────────────────────────────
  app.get("/api/payroll/compute", requireAuth, requireTenant, async (req, res, next) => {
    try {
      if (!(await ensurePro(req, res))) return;
      const user = getAuthUser(req);
      const schema = z.object({
        from: z.string().min(1),
        to: z.string().min(1),
      });
      const { from, to } = schema.parse({
        from: req.query.from ?? new Date(Date.now() - 30 * 86400000).toISOString(),
        to: req.query.to ?? new Date().toISOString(),
      });

      // Tenant users
      const tenantUsers = await db.select().from(users).where(eq(users.tenantId, user.tenantId!));
      const userIds = tenantUsers.map((u) => u.id);

      // Time logs in range (only those clocked out)
      const logs = userIds.length
        ? await db
            .select()
            .from(timeLogs)
            .where(
              and(
                inArray(timeLogs.userId, userIds),
                isNotNull(timeLogs.clockOut),
                gte(timeLogs.clockIn, from),
                lte(timeLogs.clockIn, to),
              ),
            )
        : [];

      // Sales by cashier in range (for commission)
      const tenantSales = userIds.length
        ? await db
            .select({ cashierId: sales.cashierId, total: sales.total })
            .from(sales)
            .where(
              and(
                inArray(sales.userId, userIds),
                isNull(sales.deletedAt),
                gte(sales.createdAt, from),
                lte(sales.createdAt, to),
              ),
            )
        : [];

      // Tally
      const hoursMap = new Map<string, number>();
      for (const log of logs) {
        if (!log.clockOut) continue;
        const start = new Date(log.clockIn).getTime();
        const end = new Date(log.clockOut).getTime();
        if (!isFinite(start) || !isFinite(end) || end <= start) continue;
        const hours = (end - start) / 3600000;
        hoursMap.set(log.userId, (hoursMap.get(log.userId) ?? 0) + hours);
      }

      const salesMap = new Map<string, number>();
      for (const s of tenantSales) {
        if (!s.cashierId) continue;
        salesMap.set(s.cashierId, (salesMap.get(s.cashierId) ?? 0) + (parseFloat(s.total) || 0));
      }

      const entries: PayrollEntry[] = tenantUsers.map((u) => {
        const wageType = (u.wageType ?? "none") as PayrollEntry["wageType"];
        const wageRate = parseFloat(u.wageRate ?? "0") || 0;
        const commissionPercent = parseFloat(u.commissionPercent ?? "0") || 0;
        const hoursWorked = Number((hoursMap.get(u.id) ?? 0).toFixed(2));
        const salesAmount = Number((salesMap.get(u.id) ?? 0).toFixed(2));

        let payout = 0;
        let notes = "";

        if (wageType === "hourly") {
          payout = hoursWorked * wageRate;
          notes = `${hoursWorked.toFixed(2)} hrs × ${wageRate.toFixed(2)}`;
        } else if (wageType === "monthly") {
          payout = wageRate;
          notes = "Fixed monthly salary";
        } else if (wageType === "commission") {
          payout = (salesAmount * commissionPercent) / 100;
          notes = `${commissionPercent.toFixed(2)}% of ${salesAmount.toFixed(2)}`;
        } else {
          notes = "Not configured";
        }

        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          role: u.role ?? "cashier",
          wageType,
          wageRate,
          commissionPercent,
          hoursWorked,
          salesAmount,
          payout: Number(payout.toFixed(2)),
          notes,
        };
      });

      const totals = {
        totalPayout: Number(entries.reduce((s, e) => s + e.payout, 0).toFixed(2)),
        totalHours: Number(entries.reduce((s, e) => s + e.hoursWorked, 0).toFixed(2)),
        totalCommissionable: Number(entries.reduce((s, e) => s + (e.wageType === "commission" ? e.salesAmount : 0), 0).toFixed(2)),
        staffCount: entries.length,
      };

      res.json({ from, to, entries, totals });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // ── Save a payroll period (persists computed entries for history) ────────────
  app.post("/api/payroll/periods", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      if (!(await ensurePro(req, res))) return;
      const user = getAuthUser(req);
      const schema = z.object({
        name: z.string().min(1),
        from: z.string().min(1),
        to: z.string().min(1),
        entries: z.array(z.object({
          userId: z.string(),
          employeeName: z.string().nullable().optional(),
          wageType: z.string(),
          hoursWorked: z.number().optional(),
          baseAmount: z.union([z.string(), z.number()]).transform(String),
          commissionAmount: z.union([z.string(), z.number()]).transform(String).optional(),
          tipAmount: z.union([z.string(), z.number()]).transform(String).optional(),
          bonusAmount: z.union([z.string(), z.number()]).transform(String).optional(),
          deductionAmount: z.union([z.string(), z.number()]).transform(String).optional(),
          advanceAmount: z.union([z.string(), z.number()]).transform(String).optional(),
          netAmount: z.union([z.string(), z.number()]).transform(String),
          notes: z.string().optional(),
        })),
      });
      const input = schema.parse(req.body);

      const rows = await db
        .insert(payrollPeriods as any)
        .values({
          tenantId: user.tenantId,
          name: input.name,
          startDate: input.from,
          endDate: input.to,
          status: "draft",
          createdBy: user.id,
        })
        .returning() as any[];
      const period = rows[0];

      if (input.entries.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.insert(payrollEntries as any).values(
          input.entries.map((e) => ({
            periodId: (period as any).id,
            userId: e.userId,
            employeeName: e.employeeName ?? null,
            wageType: e.wageType,
            hoursWorked: e.hoursWorked ?? 0,
            baseAmount: e.baseAmount,
            commissionAmount: e.commissionAmount ?? "0",
            tipAmount: e.tipAmount ?? "0",
            bonusAmount: e.bonusAmount ?? "0",
            deductionAmount: e.deductionAmount ?? "0",
            advanceAmount: e.advanceAmount ?? "0",
            netAmount: e.netAmount,
            notes: e.notes ?? "",
          }))
        );
      }

      res.status(201).json({ period, entryCount: input.entries.length });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // ── List saved payroll periods ───────────────────────────────────────────────
  app.get("/api/payroll/periods", requireAuth, requireTenant, async (req, res, next) => {
    try {
      if (!(await ensurePro(req, res))) return;
      const user = getAuthUser(req);
      const periods = await db
        .select()
        .from(payrollPeriods as any)
        .where(and(eq((payrollPeriods as any).tenantId, user.tenantId!), isNull((payrollPeriods as any).deletedAt)))
        .orderBy(desc((payrollPeriods as any).createdAt));
      res.json(periods);
    } catch (err: unknown) { next(err); }
  });

  // ── Get entries for a period ──────────────────────────────────────────────────
  app.get("/api/payroll/periods/:id/entries", requireAuth, requireTenant, async (req, res, next) => {
    try {
      if (!(await ensurePro(req, res))) return;
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      const [period] = await db.select().from(payrollPeriods as any).where(eq((payrollPeriods as any).id, id));
      if (!period || (period as any).tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      const entries = await db.select().from(payrollEntries as any).where(eq((payrollEntries as any).periodId, id));
      res.json(entries);
    } catch (err) { next(err); }
  });

  // ── Finalize a period (draft → finalized) ─────────────────────────────────────
  app.post("/api/payroll/periods/:id/finalize", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      if (!(await ensurePro(req, res))) return;
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      const [period] = await db.select().from(payrollPeriods as any).where(eq((payrollPeriods as any).id, id));
      if (!period || (period as any).tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      if ((period as any).status !== "draft") return res.status(409).json({ message: "Period is not in draft status" });
      const [updated] = await db.update(payrollPeriods as any)
        .set({ status: "finalized", finalizedAt: new Date().toISOString() })
        .where(eq((payrollPeriods as any).id, id))
        .returning() as any[];
      res.json(updated);
    } catch (err) { next(err); }
  });

  // ── Mark period as paid (finalized → paid) ────────────────────────────────────
  app.post("/api/payroll/periods/:id/pay", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      if (!(await ensurePro(req, res))) return;
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      const [period] = await db.select().from(payrollPeriods as any).where(eq((payrollPeriods as any).id, id));
      if (!period || (period as any).tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      if ((period as any).status !== "finalized") return res.status(409).json({ message: "Period must be finalized first" });
      const [updated] = await db.update(payrollPeriods as any)
        .set({ status: "paid", paidAt: new Date().toISOString() })
        .where(eq((payrollPeriods as any).id, id))
        .returning() as any[];
      res.json(updated);
    } catch (err) { next(err); }
  });

  // ── Soft-delete a draft period ────────────────────────────────────────────────
  app.delete("/api/payroll/periods/:id", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      if (!(await ensurePro(req, res))) return;
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      const [period] = await db.select().from(payrollPeriods as any).where(eq((payrollPeriods as any).id, id));
      if (!period || (period as any).tenantId !== user.tenantId) return res.status(404).json({ message: "Not found" });
      if ((period as any).status !== "draft") return res.status(409).json({ message: "Only draft periods can be deleted" });
      await db.update(payrollPeriods as any)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq((payrollPeriods as any).id, id));
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  // ── Update a single payroll entry (draft period only) ─────────────────────────
  app.put("/api/payroll/entries/:id", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      if (!(await ensurePro(req, res))) return;
      const user = getAuthUser(req);
      const entryId = Number(req.params.id);
      const schema = z.object({
        hoursWorked: z.union([z.string(), z.number()]).transform(String).optional(),
        baseAmount: z.union([z.string(), z.number()]).transform(String).optional(),
        commissionAmount: z.union([z.string(), z.number()]).transform(String).optional(),
        tipAmount: z.union([z.string(), z.number()]).transform(String).optional(),
        bonusAmount: z.union([z.string(), z.number()]).transform(String).optional(),
        deductionAmount: z.union([z.string(), z.number()]).transform(String).optional(),
        advanceAmount: z.union([z.string(), z.number()]).transform(String).optional(),
        netAmount: z.union([z.string(), z.number()]).transform(String).optional(),
        notes: z.string().optional(),
      });
      const input = schema.parse(req.body);
      const [entry] = await db.select().from(payrollEntries as any).where(eq((payrollEntries as any).id, entryId));
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      const [period] = await db.select().from(payrollPeriods as any).where(eq((payrollPeriods as any).id, (entry as any).periodId));
      if (!period || (period as any).tenantId !== user.tenantId) return res.status(403).json({ message: "Unauthorized" });
      if ((period as any).status !== "draft") return res.status(409).json({ message: "Can only edit entries in draft periods" });
      const [updated] = await db.update(payrollEntries as any).set(input as any).where(eq((payrollEntries as any).id, entryId)).returning() as any[];
      // Recompute period total
      const allEntries = await db.select().from(payrollEntries as any).where(eq((payrollEntries as any).periodId, (period as any).id));
      const newTotal = (allEntries as any[]).reduce((s, e) => s + (parseFloat(e.netAmount) || 0), 0);
      await db.update(payrollPeriods as any).set({ totalAmount: newTotal.toFixed(2) }).where(eq((payrollPeriods as any).id, (period as any).id));
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // ── Quick Pay: compute + create + instantly mark paid in one shot ─────────────
  app.post("/api/payroll/quick-pay", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      if (!(await ensurePro(req, res))) return;
      const user = getAuthUser(req);
      const schema = z.object({
        name: z.string().min(1),
        from: z.string().min(1),
        to: z.string().min(1),
        branchId: z.number().optional().nullable(),
      });
      const input = schema.parse(req.body);

      // Get tenant users, optionally filtered to a specific branch
      let tenantUsers = await db.select().from(users).where(eq(users.tenantId, user.tenantId!));
      if (input.branchId) {
        const branchRows = await db.select({ userId: userBranches.userId }).from(userBranches).where(eq(userBranches.branchId, input.branchId));
        const branchUserIds = new Set(branchRows.map(r => r.userId));
        tenantUsers = tenantUsers.filter(u => branchUserIds.has(u.id));
      }
      const userIds = tenantUsers.map(u => u.id);

      // Compute hours and sales for the period
      const logs = userIds.length ? await db.select().from(timeLogs).where(and(inArray(timeLogs.userId, userIds), isNotNull(timeLogs.clockOut), gte(timeLogs.clockIn, input.from), lte(timeLogs.clockIn, input.to))) : [];
      const tenantSales = userIds.length ? await db.select({ cashierId: sales.cashierId, total: sales.total }).from(sales).where(and(inArray(sales.userId, userIds), isNull(sales.deletedAt), gte(sales.createdAt, input.from), lte(sales.createdAt, input.to))) : [];

      const hoursMap = new Map<string, number>();
      for (const log of logs) {
        if (!log.clockOut) continue;
        const gross = (new Date(log.clockOut).getTime() - new Date(log.clockIn).getTime()) / 3600000;
        const breakH = ((log.breakMinutes ?? 0) / 60);
        hoursMap.set(log.userId, (hoursMap.get(log.userId) ?? 0) + Math.max(0, gross - breakH));
      }
      const salesMap = new Map<string, number>();
      for (const s of tenantSales) {
        if (!s.cashierId) continue;
        salesMap.set(s.cashierId, (salesMap.get(s.cashierId) ?? 0) + (parseFloat(s.total) || 0));
      }

      const now = new Date().toISOString();
      // Create period already in "paid" state — no draft/finalize steps
      const [period] = await db.insert(payrollPeriods as any).values({
        tenantId: user.tenantId,
        userId: user.id,
        createdBy: user.id,
        name: input.name,
        startDate: input.from,
        endDate: input.to,
        status: "paid",
        finalizedAt: now,
        paidAt: now,
      }).returning() as any[];

      // Build entries for employees with a wage type
      const payableUsers = tenantUsers.filter(u => u.wageType && u.wageType !== "none");
      const entries = payableUsers.map(u => {
        const wageType = u.wageType as string;
        const wageRate = parseFloat(u.wageRate ?? "0") || 0;
        const commissionPct = parseFloat(u.commissionPercent ?? "0") || 0;
        const hoursWorked = Number((hoursMap.get(u.id) ?? 0).toFixed(2));
        const salesAmount = Number((salesMap.get(u.id) ?? 0).toFixed(2));
        let payout = 0;
        if (wageType === "hourly") payout = hoursWorked * wageRate;
        else if (wageType === "monthly") payout = wageRate;
        else if (wageType === "commission") payout = (salesAmount * commissionPct) / 100;
        return {
          periodId: period.id,
          employeeUserId: u.id,
          employeeName: u.name || u.email || "Staff",
          wageType,
          wageRate: String(wageRate),
          hoursWorked: hoursWorked.toFixed(2),
          baseAmount: payout.toFixed(2),
          commissionAmount: "0",
          tipAmount: "0",
          bonusAmount: "0",
          deductionAmount: "0",
          advanceAmount: "0",
          netAmount: payout.toFixed(2),
          notes: "",
        };
      });

      if (entries.length > 0) {
        await db.insert(payrollEntries as any).values(entries);
      }

      const totalAmount = entries.reduce((s, e) => s + parseFloat(e.netAmount), 0);
      const [updated] = await db.update(payrollPeriods as any)
        .set({ totalAmount: totalAmount.toFixed(2) })
        .where(eq((payrollPeriods as any).id, period.id))
        .returning() as any[];

      res.status(201).json({ period: updated, entryCount: entries.length, totalAmount });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });
}
