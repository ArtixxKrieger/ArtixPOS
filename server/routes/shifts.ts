import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requirePro } from "../middleware";
import { insertShiftSchema, closeShiftSchema, shifts as shiftsTable } from "@shared/schema";
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { getUserId, handleZodError, auditLog } from "../lib/route-utils";

function orNumericRange(orNums: string[]): { orFrom: string | null; orTo: string | null } {
  if (orNums.length === 0) return { orFrom: null, orTo: null };
  const allNumeric = orNums.every(n => /^\d+$/.test(n));
  if (allNumeric) {
    const sorted = orNums.map(Number).sort((a, b) => a - b);
    return { orFrom: String(sorted[0]), orTo: String(sorted[sorted.length - 1]) };
  }
  const sorted = [...orNums].sort();
  return { orFrom: sorted[0], orTo: sorted[sorted.length - 1] };
}

export { orNumericRange };

export function registerShiftRoutes(app: Express): void {

app.get("/api/shifts", requireAuth, requirePro, async (req, res) => {
    const { limit, offset } = req.query as Record<string, string>;
    const list = await storage.getShifts(getUserId(req), {
      limit: Math.min(Number(limit) || 200, 1000),
      offset: Math.max(Number(offset) || 0, 0),
    });
    res.json(list);
  });

app.get("/api/shifts/open", requireAuth, requirePro, async (req, res) => {
    const shift = await storage.getOpenShift(getUserId(req));
    res.json(shift ?? null);
  });

app.post("/api/shifts/open", requireAuth, requirePro, async (req, res) => {
    try {
      const { openingBalance, notes, denominationOpen } = insertShiftSchema.parse(req.body);
      const uid = getUserId(req);
      const existing = await storage.getOpenShift(uid);
      if (existing) return res.status(409).json({ message: "A shift is already open" });
      const shift = await storage.openShift(uid, openingBalance, notes ?? undefined, denominationOpen ?? undefined);
      await auditLog(req, "shift_open", "shift", String(shift.id), {
        openingBalance, notes: notes ?? null,
      });
      res.status(201).json(shift);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

app.get("/api/shifts/:id/z-report", requireAuth, requirePro, async (req, res) => {
    const shiftId = Number(req.params.id);
    const uid = getUserId(req);
    const [shift] = await db
      .select()
      .from(shiftsTable)
      .where(and(eq(shiftsTable.id, shiftId), eq(shiftsTable.userId, uid)))
      .limit(1);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    const startDate = shift.openedAt!;
    const endDate = shift.closedAt ?? new Date().toISOString();
    const salesList = await storage.getSales(uid, { limit: 10000, startDate, endDate });

    const orNumbers = salesList.map(s => s.orNumber).filter(Boolean) as string[];
    const { orFrom, orTo } = orNumericRange(orNumbers);

    const paymentBreakdown: Record<string, { count: number; total: number }> = {};
    for (const sale of salesList) {
      const pm = sale.paymentMethod || "cash";
      if (!paymentBreakdown[pm]) paymentBreakdown[pm] = { count: 0, total: 0 };
      paymentBreakdown[pm].count++;
      paymentBreakdown[pm].total += parseFloat(sale.total || "0");
    }

    const discountBreakdown: Record<string, { count: number; total: number; discount: number }> = {};
    for (const sale of salesList) {
      const dt = (sale as any).discountType || "regular";
      if (!discountBreakdown[dt]) discountBreakdown[dt] = { count: 0, total: 0, discount: 0 };
      discountBreakdown[dt].count++;
      discountBreakdown[dt].total += parseFloat(sale.total || "0");
      discountBreakdown[dt].discount += parseFloat(sale.discount || "0");
    }

    const vatableSalesTotal = salesList.reduce((a, s) => a + parseFloat((s as any).vatableSales || "0"), 0);
    const vatExemptTotal    = salesList.reduce((a, s) => a + parseFloat((s as any).vatExemptSales || "0"), 0);
    const zeroRatedTotal    = salesList.reduce((a, s) => a + parseFloat((s as any).zeroRatedSales || "0"), 0);
    const vatAmountTotal    = salesList.reduce((a, s) => a + parseFloat(s.tax || "0"), 0);

    const itemMap: Record<string, { name: string; qty: number; total: number }> = {};
    for (const sale of salesList) {
      const items = Array.isArray(sale.items) ? (sale.items as any[]) : [];
      for (const item of items) {
        const key = String(item.productId ?? item.name ?? "unknown");
        if (!itemMap[key]) itemMap[key] = { name: item.name || "Item", qty: 0, total: 0 };
        const qty = item.quantity || 1;
        itemMap[key].qty += qty;
        const price = parseFloat(item.size?.price ?? item.price ?? "0");
        itemMap[key].total += price * qty;
      }
    }
    const topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 8);

    res.json({
      shift,
      orFrom,
      orTo,
      totalTransactions: salesList.length,
      grossSales: salesList.reduce((a, s) => a + parseFloat(s.total || "0"), 0),
      netSales: salesList.reduce((a, s) => a + parseFloat(s.total || "0") - parseFloat(s.tax || "0"), 0),
      totalDiscount: salesList.reduce((a, s) => a + parseFloat(s.discount || "0"), 0),
      totalLoyaltyDiscount: salesList.reduce((a, s) => a + parseFloat((s as any).loyaltyDiscount || "0"), 0),
      paymentBreakdown,
      discountBreakdown,
      vatableSalesTotal,
      vatExemptTotal,
      zeroRatedTotal,
      vatAmountTotal,
      topItems,
    });
  });

app.post("/api/shifts/:id/close", requireAuth, requirePro, async (req, res) => {
    try {
      const { closingBalance, notes, denominationClose, variance } = closeShiftSchema.parse(req.body);
      const shift = await storage.closeShift(
        Number(req.params.id),
        getUserId(req),
        closingBalance,
        notes ?? undefined,
        denominationClose ?? undefined,
        variance ?? undefined,
      );
      if (!shift) return res.status(404).json({ message: "Shift not found" });
      await auditLog(req, "shift_close", "shift", String(shift.id), {
        closingBalance, variance: variance ?? null, notes: notes ?? null,
      });
      res.json(shift);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

app.post("/api/shifts/:id/cash-adjustment", requireAuth, requirePro, async (req, res) => {
    try {
      const { type, amount, reason } = z.object({
        type: z.enum(["in", "out"]),
        amount: z.string(),
        reason: z.string().optional().default(""),
      }).parse(req.body);
      const shift = await storage.addCashAdjustment(Number(req.params.id), getUserId(req), type, amount, reason);
      if (!shift) return res.status(404).json({ message: "Shift not found or not open" });
      await auditLog(req, "cash_adjustment", "shift", String(shift.id), { type, amount, reason });
      res.json(shift);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });
}
