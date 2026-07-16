import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { requireAuth } from "../middleware";
import { emit as emitTenantEvent } from "../events";
import { getRolePermissionForRole } from "../admin-storage";
import {
  getUserId,
  getTenantId,
  getActiveBranchId,
  resolveBranchId,
  auditLog,
  handleZodError,
} from "../lib/route-utils";
import { cache, dashboardCacheKey } from "../cache";
import { pool } from "../db";
import { runAsAdmin } from "../tenant-context";

const IDEM_TTL_MS = 60 * 60 * 1000;

export function registerPendingOrderRoutes(app: Express): void {
  app.get(api.pendingOrders.list.path, requireAuth, async (req, res) => {
    const orders = await storage.getPendingOrders(getUserId(req), getActiveBranchId(req));
    res.json(orders);
  });

  app.post(api.pendingOrders.create.path, requireAuth, async (req, res) => {
    try {
      const rawIdempotencyKey =
        typeof (req.body as Record<string, unknown>).idempotencyKey === "string"
          ? ((req.body as Record<string, unknown>).idempotencyKey as string)
          : undefined;
      const idemTenantId = (req.user as Record<string, unknown> | undefined)?.tenantId as
        | string
        | undefined;

      if (rawIdempotencyKey && idemTenantId) {
        const idemCacheKey = `idem:po:${idemTenantId}:${rawIdempotencyKey}`;
        const cached = cache.get<object>(idemCacheKey);
        if (cached) {
          return res.status(201).json(cached);
        }
      }

      const bodySchema = api.pendingOrders.create.input.extend({
        subtotal: z.coerce.string(),
        total: z.coerce.string(),
        tax: z.coerce.string().optional(),
        discount: z.coerce.string().optional(),
        paymentAmount: z.coerce.string().optional(),
        changeAmount: z.coerce.string().optional(),
      });
      const input = bodySchema.parse(req.body);
      const uid = getUserId(req);

      const enforcedBranch = await resolveBranchId(req);
      const inputWithCashier = {
        ...input,
        cashierId: input.cashierId ?? uid,
        branchId: enforcedBranch,
      };
      const order = await storage.createPendingOrder(uid, inputWithCashier);

      let saleOrNumber: string | null = null;
      let saleReceiptNumber: string | null = null;
      let saleId: number | null = null;

      const tid = getTenantId(req);

      const deferSale = (req.body as any).deferSale === true;

      if (input.status === "paid" && !deferSale) {
        try {
          const rawBody = req.body as any;
          const sale = await storage.createSale(uid, {
            items: input.items,
            subtotal: input.subtotal,
            tax: input.tax,
            discount: input.discount,
            discountCode: input.discountCode,
            loyaltyDiscount: input.loyaltyDiscount,
            tip: rawBody.tip,
            total: input.total,
            paymentMethod: input.paymentMethod,
            paymentAmount: input.paymentAmount,
            changeAmount: input.changeAmount,
            customerId: input.customerId,
            customerName: rawBody.customerName,
            tableId: input.tableId,
            cashierId: uid,
            notes: input.notes,
            branchId: enforcedBranch,

            discountType: rawBody.discountType ?? "regular",
            scPwdId: rawBody.scPwdId ?? null,
            vatableSales: rawBody.vatableSales ?? "0",
            vatExemptSales: rawBody.vatExemptSales ?? "0",
            zeroRatedSales: rawBody.zeroRatedSales ?? "0",
          });

          saleOrNumber = (sale as any).orNumber ?? null;
          saleReceiptNumber = (sale as any).receiptNumber ?? null;
          saleId = sale.id;

          await storage.updatePendingOrder(order.id, uid, { saleId: sale.id } as any).catch((e) =>
            console.error(`[pending-order] saleId stamp failed for order ${order.id}:`, e),
          );

          const capturedSale = sale;
          const capturedUid = uid;
          const capturedInput = input;
          const capturedTid = tid;
          const capturedReq = req;
          runAsAdmin(pool, async () => {
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                await storage.deductProductStockForSale(capturedUid, capturedInput.items as any[]);
                break;
              } catch (stockErr) {
                if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * attempt));
                else
                  console.error(
                    `[CRITICAL] Stock deduction failed for sale ${capturedSale.id} — inventory may be inconsistent:`,
                    stockErr,
                  );
              }
            }

            if (capturedInput.discountCode) {
              try {
                const dc = await storage.getDiscountCodeByCode(
                  capturedInput.discountCode,
                  capturedUid,
                );
                if (dc) await storage.incrementDiscountCodeUsage(dc.id);
              } catch (dcErr) {
                console.error("Failed to increment discount code usage:", dcErr);
              }
            }

            try {
              await auditLog(capturedReq, "create", "sale", String(capturedSale.id), {
                total: capturedSale.total,
                itemCount: Array.isArray(capturedSale.items) ? capturedSale.items.length : 0,
                paymentMethod: capturedSale.paymentMethod,
                source: "pos",
              });
            } catch {}

            if (capturedTid) {
              emitTenantEvent(capturedTid, {
                type: "stats-update",
                saleId: capturedSale.id,
                total: capturedSale.total,
              });
            }
          }).catch((e) =>
            console.error(`[pending-order] runAsAdmin failed for sale ${capturedSale.id}:`, e),
          );
        } catch (saleErr) {
          console.error("Failed to auto-create sale for paid order:", saleErr);
          return res.status(500).json({
            message: "Failed to create sale. Please try again.",
            orderId: order.id,
          });
        }

        // Clear caches so dashboard + sales list reflect the new sale immediately
        cache.del(dashboardCacheKey(uid, enforcedBranch));
        cache.delByPrefix(`sales:${uid}`);
      }

      if (tid) {
        emitTenantEvent(tid, {
          type: "kitchen-new-order",
          orderId: order.id,
          orderNumber: (order as any).orderNumber ?? null,
          itemCount: Array.isArray(input.items) ? input.items.length : 0,
        });
        // Push notifications for every new order were removed — too noisy
        // for the owner. The kitchen display still gets a live update via
        // the SSE event above.
      }

      const responseBody = {
        ...order,
        orNumber: saleOrNumber ?? (order as any).orNumber ?? null,
        receiptNumber: saleReceiptNumber ?? (order as any).receiptNumber ?? null,
        saleId,
      };

      if (rawIdempotencyKey && idemTenantId) {
        const idemCacheKey = `idem:po:${idemTenantId}:${rawIdempotencyKey}`;
        cache.set(idemCacheKey, responseBody, IDEM_TTL_MS);
      }

      res.status(201).json(responseBody);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.put(api.pendingOrders.update.path, requireAuth, async (req, res) => {
    try {
      const bodySchema = api.pendingOrders.update.input.extend({
        subtotal: z.coerce.string().optional(),
        total: z.coerce.string().optional(),
        tax: z.coerce.string().optional(),
        discount: z.coerce.string().optional(),
        paymentAmount: z.coerce.string().optional(),
        changeAmount: z.coerce.string().optional(),
      });
      const input = bodySchema.parse(req.body);
      const order = await storage.updatePendingOrder(Number(req.params.id), getUserId(req), input);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.delete(api.pendingOrders.delete.path, requireAuth, async (req, res) => {
    const user = req.user;
    if (user?.tenantId && user.role !== "owner") {
      const perm = await getRolePermissionForRole(user.tenantId, user.role);
      if (perm && perm.canVoidOrder === false) {
        return res.status(403).json({ message: "You don't have permission to void orders" });
      }
    }
    const id = Number(req.params.id);
    const uid = getUserId(req);
    const existing = await storage.getPendingOrder(id, uid);
    await storage.deletePendingOrder(id, uid);
    await auditLog(req, "delete", "pending_order", String(id), { total: existing?.total });
    res.status(204).end();
  });

  app.patch("/api/pending-orders/:id/kitchen", requireAuth, async (req, res) => {
    try {
      const { kitchenStatus } = z
        .object({
          kitchenStatus: z.enum(["pending", "preparing", "ready", "done"]),
        })
        .parse(req.body);
      const order = await storage.updatePendingOrder(Number(req.params.id), getUserId(req), {
        kitchenStatus,
      });
      if (!order) return res.status(404).json({ message: "Order not found" });
      const tid = getTenantId(req);
      if (tid) {
        emitTenantEvent(tid, {
          type: "kitchen-update",
          orderId: order.id,
          kitchenStatus,
          orderNumber: (order as any).orderNumber ?? null,
        });
      }
      res.json(order);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });
}
