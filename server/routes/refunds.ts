import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireManagerOrAbove } from "../middleware";
import { insertRefundSchema } from "@shared/schema";
import { getRolePermissionForRole } from "../admin-storage";
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
      const input = insertRefundSchema.extend({ amount: z.coerce.string() }).parse(req.body);
      const uid = getUserId(req);
      const refund = await storage.createRefund(uid, input);
      const sale = await storage.getSaleById(refund.saleId, uid);
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
