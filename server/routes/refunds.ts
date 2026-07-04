import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireManagerOrAbove } from "../middleware";
import { insertRefundSchema, sales as salesTable, shifts as shiftsTable } from "@shared/schema";
import { getRolePermissionForRole } from "../admin-storage";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import {
  getUserId,
  auditLog,
  handleZodError,
  parsePagination,
  paginatedResponse,
} from "../lib/route-utils";

export function registerRefundRoutes(app: Express): void {
  app.get("/api/refunds", requireAuth, requireManagerOrAbove, async (req, res) => {
    const uid = getUserId(req);
    const { saleId } = req.query as Record<string, string>;

    // B-pattern: ?saleId=:id filters by sale
    const list = saleId
      ? await storage.getRefundsBySale(Number(saleId), uid)
      : await storage.getRefunds(uid);

    const { page, limit, offset } = parsePagination(req.query as Record<string, string>);
    const paged = list.slice(offset, offset + limit);
    paginatedResponse(res, paged, list.length, page, limit);
  });

  app.get("/api/refunds/sale/:saleId", requireAuth, async (req, res) => {
    const list = await storage.getRefundsBySale(Number(req.params.saleId), getUserId(req));
    res.json(list);
  });

  app.post("/api/refunds", requireAuth, requireManagerOrAbove, async (req, res) => {
    try {
      const refundUser = req.user;
      if (refundUser?.tenantId && refundUser.role !== "owner") {
        const perm = await getRolePermissionForRole(refundUser.tenantId, refundUser.role);
        if (perm && perm.canRefund === false) {
          return res.status(403).json({ message: "You don't have permission to process refunds" });
        }
      }
      const input = insertRefundSchema
        .extend({ amount: z.coerce.string(), reason: z.string().trim().min(1, "A refund reason is required to keep the BIR audit trail complete.") })
        .parse(req.body);
      const uid = getUserId(req);

      const sale = await storage.getSaleById(input.saleId, uid);
      if (!sale) return res.status(404).json({ message: "Sale not found" });

      const [saleRow] = await db
        .select({ createdAt: salesTable.createdAt })
        .from(salesTable)
        .where(eq(salesTable.id, input.saleId));
      if (saleRow?.createdAt) {
        const closedShifts = await db
          .select({ openedAt: shiftsTable.openedAt, closedAt: shiftsTable.closedAt })
          .from(shiftsTable)
          .where(and(eq(shiftsTable.userId, uid), eq(shiftsTable.status, "closed")));
        const saleTime = saleRow.createdAt;
        const lockedByShift = closedShifts.some(
          (s) => s.openedAt && s.closedAt && saleTime >= s.openedAt && saleTime <= s.closedAt,
        );
        if (lockedByShift) {
          return res.status(409).json({
            message:
              "This sale is locked inside a closed shift (Z-report already generated). It cannot be refunded to preserve BIR audit integrity.",
          });
        }
      }

      const saleTotal = parseFloat(sale.total || "0");
      const existingRefunds = await storage.getRefundsBySale(input.saleId, uid);
      const alreadyRefunded = existingRefunds.reduce((acc, r) => acc + parseFloat(r.amount || "0"), 0);
      const requestedAmount = parseFloat(input.amount);
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        return res.status(400).json({ message: "Refund amount must be greater than zero." });
      }
      if (requestedAmount > saleTotal - alreadyRefunded + 0.01) {
        return res.status(400).json({
          message: `Refund amount exceeds the remaining refundable balance (${(saleTotal - alreadyRefunded).toFixed(2)}) for this sale.`,
        });
      }

      const refund = await storage.createRefund(uid, input);
      await auditLog(req, "create", "refund", String(refund.id), {
        saleId: refund.saleId,
        saleReceiptNumber: (sale as any)?.receiptNumber ?? null,
        saleOrNumber: (sale as any)?.orNumber ?? null,
        saleInvoiceNumber: (sale as any)?.invoiceNumber ?? null,
        amount: refund.amount,
        reason: refund.reason,
      });
      res.status(201).json(refund);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });
}
