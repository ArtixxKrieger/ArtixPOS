import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { requireAuth } from "../middleware";
import { emit as emitTenantEvent } from "../events";
import { getRolePermissionForRole } from "../admin-storage";
import { getUserId, getTenantId, getActiveBranchId, resolveBranchId, auditLog, handleZodError } from "../lib/route-utils";

export function registerPendingOrderRoutes(app: Express): void {

  // ── List pending orders for current branch ─────────────────────────────────
  app.get(api.pendingOrders.list.path, requireAuth, async (req, res) => {
    const orders = await storage.getPendingOrders(getUserId(req), getActiveBranchId(req));
    res.json(orders);
  });

  // ── Create pending order (also auto-creates a sale when status = "paid") ──
  app.post(api.pendingOrders.create.path, requireAuth, async (req, res) => {
    try {
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

      // Force the active branch so an order placed while viewing branch A can
      // never accidentally land on a different branch.
      const enforcedBranch = await resolveBranchId(req);
      const inputWithCashier = {
        ...input,
        cashierId: input.cashierId ?? uid,
        branchId: enforcedBranch,
      };
      const order = await storage.createPendingOrder(uid, inputWithCashier);

      // When a POS order is finalised as paid, also record it as a sale so it
      // immediately appears in Dashboard, Analytics, and Sales History.
      // Capture BIR receipt fields from the auto-created sale so the client
      // can display the correct OR number on the receipt without a second fetch.
      let saleOrNumber: string | null = null;
      let saleReceiptNumber: string | null = null;
      let saleId: number | null = null;

      if (input.status === "paid") {
        try {
          // Create the sale FIRST. Only after it succeeds do we increment the
          // discount-code usage — otherwise a failed sale would leave the
          // discount counter inflated and rob the merchant of legitimate uses.
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
            // BIR compliance fields — must be persisted for X/Z reports and eSales
            discountType: rawBody.discountType ?? "regular",
            scPwdId: rawBody.scPwdId ?? null,
            vatableSales: rawBody.vatableSales ?? "0",
            vatExemptSales: rawBody.vatExemptSales ?? "0",
            zeroRatedSales: rawBody.zeroRatedSales ?? "0",
          });

          saleOrNumber = (sale as any).orNumber ?? null;
          saleReceiptNumber = (sale as any).receiptNumber ?? null;
          saleId = sale.id;

          try {
            await storage.deductProductStockForSale(uid, input.items as any[]);
          } catch (stockErr) {
            // Log prominently — stock is now inconsistent and needs manual review.
            console.error("[CRITICAL] Stock deduction failed for sale", sale.id, "— inventory may be inconsistent:", stockErr);
          }

          if (input.discountCode) {
            try {
              const dc = await storage.getDiscountCodeByCode(input.discountCode, uid);
              if (dc) await storage.incrementDiscountCodeUsage(dc.id);
            } catch (dcErr) {
              // Don't fail the whole flow if the counter bump fails — the sale
              // and order are already recorded correctly.
              console.error("Failed to increment discount code usage:", dcErr);
            }
          }

          await auditLog(req, "create", "sale", String(sale.id), {
            total: sale.total,
            itemCount: Array.isArray(sale.items) ? sale.items.length : 0,
            paymentMethod: sale.paymentMethod,
            source: "pos",
          });
        } catch (saleErr) {
          // Sale creation failure is non-fatal — the order is already saved.
          console.error("Failed to auto-create sale for paid order:", saleErr);
        }
      }

      // Notify connected kitchen SSE clients about the new order.
      // Emit for ALL orders regardless of payment status — quick-pay F&B
      // orders (paid at counter, prepared in kitchen) must also reach the display.
      const tid = getTenantId(req);
      if (tid) {
        emitTenantEvent(tid, {
          type: "kitchen-new-order",
          orderId: order.id,
          orderNumber: (order as any).orderNumber ?? null,
          itemCount: Array.isArray(input.items) ? input.items.length : 0,
        });
        // Send background push notification so staff are alerted even when the
        // kitchen display tab is closed or the device screen is off.
        const itemCount  = Array.isArray(input.items) ? input.items.length : 1;
        const orderLabel = (order as any).orderNumber ? `#${(order as any).orderNumber}` : `#${order.id}`;
        setImmediate(async () => {
          try {
            const { sendPushToTenant } = await import("../push");
            await sendPushToTenant(tid, {
              title: `🍽️ New Order ${orderLabel}`,
              body:  `${itemCount} item${itemCount !== 1 ? "s" : ""} waiting in the kitchen.`,
              tag:   `order-${order.id}`,
              url:   "/kitchen",
            });
          } catch {}
        });
      }

      // Merge BIR receipt identifiers from the auto-created sale into the
      // order response so the POS client can display the correct OR number.
      res.status(201).json({
        ...order,
        orNumber: saleOrNumber ?? (order as any).orNumber ?? null,
        receiptNumber: saleReceiptNumber ?? (order as any).receiptNumber ?? null,
        saleId,
      });
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Update pending order ───────────────────────────────────────────────────
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

  // ── Delete (void) pending order ────────────────────────────────────────────
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

  // ── Update kitchen status ─────────────────────────────────────────────────
  // Kept here (not in sse.ts) because it mutates an order — only the SSE push
  // is related to the real-time channel.
  app.patch("/api/pending-orders/:id/kitchen", requireAuth, async (req, res) => {
    try {
      const { kitchenStatus } = z.object({
        kitchenStatus: z.enum(["pending", "preparing", "ready", "done"]),
      }).parse(req.body);
      const order = await storage.updatePendingOrder(Number(req.params.id), getUserId(req), { kitchenStatus });
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
