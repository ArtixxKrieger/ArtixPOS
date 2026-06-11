import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { requireAuth } from "../middleware";
import { emit as emitTenantEvent } from "../events";
import { getRolePermissionForRole } from "../admin-storage";
import { getUserId, getTenantId, getActiveBranchId, resolveBranchId, auditLog, handleZodError } from "../lib/route-utils";
import { cache } from "../cache";

const IDEM_TTL_MS = 60 * 60 * 1000; // 1 hour idempotency window

export function registerPendingOrderRoutes(app: Express): void {

  app.get(api.pendingOrders.list.path, requireAuth, async (req, res) => {
    const orders = await storage.getPendingOrders(getUserId(req), getActiveBranchId(req));
    res.json(orders);
  });

  app.post(api.pendingOrders.create.path, requireAuth, async (req, res) => {
    try {
      // The frontend generates a nanoid() `idempotencyKey` per checkout attempt.
      // If the server processed the request but the response was lost (e.g. a
      // WiFi hiccup), the offline-sync layer replays the same POST body including
      // the same key. We return the cached result instead of creating a duplicate
      // sale. The key is NOT in the Drizzle schema — we read it from the raw body
      // before Zod strips unknown fields.
      const rawIdempotencyKey = typeof (req.body as Record<string, unknown>).idempotencyKey === "string"
        ? (req.body as Record<string, unknown>).idempotencyKey as string
        : undefined;
      const idemTenantId = (req.user as Record<string, unknown> | undefined)?.tenantId as string | undefined;

      if (rawIdempotencyKey && idemTenantId) {
        const idemCacheKey = `idem:po:${idemTenantId}:${rawIdempotencyKey}`;
        const cached = cache.get<object>(idemCacheKey);
        if (cached) {
          // Already processed — return the original response, no duplicate side-effects.
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

      // Resolve tenant ID early — needed both for kitchen SSE and the
      // background stats-update ping added below.
      const tid = getTenantId(req);

      if (input.status === "paid") {
        try {
          // Create the sale record synchronously — we need the OR / receipt
          // numbers for the receipt the cashier is about to print.
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

          // ── Non-blocking background work ──────────────────────────────────
          // Stock deduction, discount-code counter, audit log, and the
          // dashboard stats-update SSE ping are all fire-and-forget.
          // Keeping them in the hot path was adding 300-800 ms of visible
          // latency on every POS checkout.
          const capturedSale   = sale;
          const capturedUid    = uid;
          const capturedInput  = input;
          const capturedTid    = tid;
          const capturedReq    = req;
          setImmediate(async () => {
            // Stock deduction — with 3 retries, matching the direct-sale route
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                await storage.deductProductStockForSale(capturedUid, capturedInput.items as any[]);
                break;
              } catch (stockErr) {
                if (attempt < 3) await new Promise(r => setTimeout(r, 300 * attempt));
                else console.error(`[CRITICAL] Stock deduction failed for sale ${capturedSale.id} — inventory may be inconsistent:`, stockErr);
              }
            }

            // Discount-code usage counter
            if (capturedInput.discountCode) {
              try {
                const dc = await storage.getDiscountCodeByCode(capturedInput.discountCode, capturedUid);
                if (dc) await storage.incrementDiscountCodeUsage(dc.id);
              } catch (dcErr) {
                console.error("Failed to increment discount code usage:", dcErr);
              }
            }

            // Audit log
            try {
              await auditLog(capturedReq, "create", "sale", String(capturedSale.id), {
                total: capturedSale.total,
                itemCount: Array.isArray(capturedSale.items) ? capturedSale.items.length : 0,
                paymentMethod: capturedSale.paymentMethod,
                source: "pos",
              });
            } catch {}

            // Stats-update SSE — notify all open dashboard tabs so they refresh
            // in real time.  This was the missing link: /api/pending-orders
            // creates the sale but never emitted stats-update, so the dashboard
            // SSE was completely silent for every POS checkout.
            if (capturedTid) {
              emitTenantEvent(capturedTid, {
                type: "stats-update",
                saleId: capturedSale.id,
                total: capturedSale.total,
              });
            }
          });
        } catch (saleErr) {
          // Sale creation failure is non-fatal — the order is already saved.
          console.error("Failed to auto-create sale for paid order:", saleErr);
        }
      }

      // Emit kitchen-new-order for ALL orders (paid at counter or tab-style)
      // so the kitchen display lights up instantly.
      if (tid) {
        emitTenantEvent(tid, {
          type: "kitchen-new-order",
          orderId: order.id,
          orderNumber: (order as any).orderNumber ?? null,
          itemCount: Array.isArray(input.items) ? input.items.length : 0,
        });
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

      // Merge BIR receipt identifiers from the auto-created sale into the order response
      const responseBody = {
        ...order,
        orNumber: saleOrNumber ?? (order as any).orNumber ?? null,
        receiptNumber: saleReceiptNumber ?? (order as any).receiptNumber ?? null,
        saleId,
      };

      // Cache successful response so a replay of the same idempotency key
      // returns the original result without creating a second sale.
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
