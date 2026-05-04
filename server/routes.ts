import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage, invalidateTenantCache } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { registerAdminRoutes } from "./admin-routes";
import { registerAiRoutes } from "./ai-routes";
import { registerSubscriptionRoutes } from "./subscription-routes";
import { registerPayrollRoutes } from "./payroll-routes";
import { createBranch, getBranches, createTenant, createAuditLog, getRolePermissionForRole } from "./admin-storage";
import { db } from "./db";
import { eq, and, sql, desc, isNotNull } from "drizzle-orm";
import { users, branches as branchesTable, tenants, sales as salesTable, shifts as shiftsTable, expenses } from "@shared/schema";
import { signToken, setAuthCookie } from "./auth";
import { requireAuth, requireManagerOrAbove, requirePro, requireProOrBusinessFeature, getSubscription, isProSubscription } from "./middleware";
import { cache, TTL, productsCacheKey, settingsCacheKey, barcodeCacheKey } from "./cache";
import {
  insertCustomerSchema,
  insertExpenseSchema,
  insertShiftSchema,
  closeShiftSchema,
  insertDiscountCodeSchema,
  insertRefundSchema,
  insertTableSchema,
  insertSupplierSchema,
  insertPurchaseOrderSchema,
  insertServiceStaffSchema,
  insertServiceRoomSchema,
  insertAppointmentSchema,
  insertMembershipPlanSchema,
  insertMembershipSchema,
  insertMembershipCheckInSchema,
  insertIngredientSchema,
  insertWifiVoucherSchema,
  insertPayrollPeriodSchema,
  updatePayrollEntrySchema,
  updateUserWageSchema,
} from "@shared/schema";

function userId(req: Request): string {
  if (!req.user) throw new Error("userId() called on unauthenticated request");
  return (req.user as any).id;
}

/** Active branch the user has selected (owner can switch via /api/admin/switch-branch).
 *  Returns null when the user has no branch assigned yet. */
function activeBranchId(req: Request): number | null {
  return (req.user as any)?.activeBranchId ?? null;
}

/** Resolve the branch a created record should belong to.
 *  Always prefers the user's active branch over any client-supplied branchId
 *  to prevent cross-branch leaks (e.g. owner viewing branch A creating a
 *  product accidentally tagged as branch B). Falls back to the tenant's main
 *  branch, or any branch, when no active branch is set. */
async function resolveBranchId(req: Request): Promise<number | null> {
  const active = activeBranchId(req);
  if (active != null) return active;
  const tid = tenantId(req);
  if (!tid) return null;
  const tenantBranches = await db.select().from(branchesTable).where(eq(branchesTable.tenantId, tid));
  if (tenantBranches.length === 0) return null;
  const main = tenantBranches.find(b => b.isMain);
  return (main ?? tenantBranches[0]).id;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;
function isValidDate(s: string): boolean {
  return ISO_DATE_RE.test(s) && !isNaN(Date.parse(s));
}

function tenantId(req: Request): string | null {
  return (req.user as any).tenantId ?? null;
}

async function auditLog(req: Request, action: string, entity: string, entityId?: string, metadata?: Record<string, any>) {
  const tid = tenantId(req);
  if (!tid) return;
  try {
    await createAuditLog({ tenantId: tid, userId: userId(req), action, entity, entityId, metadata });
  } catch {
    // audit log failures should never break the main request
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerAdminRoutes(app);
  registerAiRoutes(app);
  registerSubscriptionRoutes(app);
  registerPayrollRoutes(app);

  // ── Public branch profile (no auth) ───────────────────────────────────────
  app.get("/api/public/branch/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid branch id" });
      const [row] = await db
        .select({
          id: branchesTable.id,
          name: branchesTable.name,
          address: branchesTable.address,
          phone: branchesTable.phone,
          email: (branchesTable as any).email,
          website: (branchesTable as any).website,
          description: (branchesTable as any).description,
          color: (branchesTable as any).color,
          timezone: (branchesTable as any).timezone,
          openingHours: (branchesTable as any).openingHours,
          businessType: branchesTable.businessType,
          businessSubType: branchesTable.businessSubType,
          isActive: branchesTable.isActive,
          tenantName: tenants.name,
        })
        .from(branchesTable)
        .leftJoin(tenants, eq(tenants.id, branchesTable.tenantId))
        .where(and(eq(branchesTable.id, id), eq(branchesTable.isActive, true)));
      if (!row) return res.status(404).json({ message: "Branch not found" });
      res.json(row);
    } catch (err) { next(err); }
  });

  // ── Products ──────────────────────────────────────────────────────────────

  app.get(api.products.list.path, requireAuth, async (req, res) => {
    const branch = activeBranchId(req);
    const cacheKey = productsCacheKey(userId(req)) + (branch != null ? `:b${branch}` : "");
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);
    const products = await storage.getProducts(userId(req), branch);
    cache.set(cacheKey, products, TTL.PRODUCTS);
    res.json(products);
  });

  app.get(api.products.get.path, requireAuth, async (req, res) => {
    const product = await storage.getProduct(Number(req.params.id), userId(req));
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  app.get("/api/products/low-stock", requireAuth, async (req, res) => {
    const products = await storage.getProducts(userId(req));
    const lowStockProducts = products.filter(p =>
      p.trackStock &&
      typeof p.stock === "number" &&
      typeof p.lowStockThreshold === "number" &&
      p.stock <= p.lowStockThreshold
    ).sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
    res.json(lowStockProducts);
  });

  app.post(api.products.create.path, requireAuth, async (req, res) => {
    try {
      const tid = tenantId(req);
      if (tid) {
        const sub = await getSubscription(tid);
        if (!isProSubscription(sub)) {
          const existing = await storage.getProducts(userId(req));
          if (existing.length >= 50) {
            return res.status(403).json({ message: "The Free plan includes 50 products. Upgrade to Pro when you need a larger catalog.", code: "PRODUCT_LIMIT_REACHED" });
          }
        }
      }
      const bodySchema = api.products.create.input.extend({
        price: z.coerce.string().min(1, "Price is required"),
      });
      const input = bodySchema.parse(req.body);
      // SECURITY: Always force the new product into the user's currently active
      // branch. Ignore any client-supplied branchId to prevent cross-branch leaks.
      const branchId = await resolveBranchId(req);
      const product = await storage.createProduct(userId(req), { ...input, branchId });
      cache.del(productsCacheKey(userId(req)));
      if (branchId != null) cache.del(productsCacheKey(userId(req)) + `:b${branchId}`);
      await auditLog(req, "create", "product", String(product.id), { name: product.name, price: product.price });
      res.status(201).json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      throw err;
    }
  });

  app.put(api.products.update.path, requireAuth, async (req, res) => {
    try {
      const bodySchema = api.products.update.input.extend({
        price: z.coerce.string().optional(),
      });
      const input = bodySchema.parse(req.body);
      const product = await storage.updateProduct(Number(req.params.id), userId(req), input);
      if (!product) return res.status(404).json({ message: "Product not found" });
      cache.del(productsCacheKey(userId(req)));
      await auditLog(req, "update", "product", String(product.id), { name: product.name });
      res.json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      throw err;
    }
  });

  app.delete(api.products.delete.path, requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    // Fetch + delete in parallel — saves one sequential DB round trip
    const [existing] = await Promise.all([
      storage.getProduct(id, userId(req)),
      storage.deleteProduct(id, userId(req)),
    ]);
    cache.del(productsCacheKey(userId(req)));
    await auditLog(req, "delete", "product", String(id), { name: existing?.name });
    res.status(204).end();
  });

  // Stock adjustment
  app.post("/api/products/:id/stock", requireAuth, async (req, res) => {
    try {
      const { delta } = z.object({ delta: z.number() }).parse(req.body);
      const product = await storage.adjustStock(Number(req.params.id), userId(req), delta);
      if (!product) return res.status(404).json({ message: "Product not found" });
      cache.del(productsCacheKey(userId(req)));
      res.json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.patch("/api/products/:id/stock", requireAuth, async (req, res) => {
    try {
      const { stock } = z.object({ stock: z.number().int().min(0) }).parse(req.body);
      const product = await storage.setStock(Number(req.params.id), userId(req), stock);
      if (!product) return res.status(404).json({ message: "Product not found" });
      cache.del(productsCacheKey(userId(req)));
      res.json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get("/api/products/:id/stock-logs", requireAuth, async (req, res, next) => {
    try {
      const logs = await storage.getStockLogs(Number(req.params.id), userId(req));
      res.json(logs);
    } catch (err) { next(err); }
  });

  // ── CSV Export ─────────────────────────────────────────────────────────────

  app.get("/api/products/export", requireAuth, async (req, res, next) => {
    try {
      const prods = await storage.getProducts(userId(req));
      const HEADERS = ["name","category","price","sku","barcode","taxRate","trackStock","stock","lowStockThreshold"];
      const escape = (v: any) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = prods.map(p => [
        p.name, p.category, p.price, p.sku, p.barcode, p.taxRate,
        p.trackStock ? "true" : "false", p.stock ?? "", p.lowStockThreshold ?? ""
      ].map(escape).join(","));
      const csv = [HEADERS.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=\"products.csv\"");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.send(csv);
    } catch (err) { next(err); }
  });

  // ── CSV Import ─────────────────────────────────────────────────────────────

  app.post("/api/products/import", requireAuth, async (req, res, next) => {
    try {
      const { rows } = z.object({
        rows: z.array(z.object({
          name: z.string().min(1),
          category: z.string().optional(),
          price: z.string().optional(),
          sku: z.string().optional(),
          barcode: z.string().optional(),
          taxRate: z.string().optional(),
          trackStock: z.boolean().optional(),
          stock: z.number().int().optional(),
          lowStockThreshold: z.number().int().optional(),
        })),
      }).parse(req.body);

      const uid = userId(req);
      const existing = await storage.getProducts(uid);
      const bySku = new Map(existing.filter(p => p.sku).map(p => [p.sku!.toLowerCase(), p]));
      const byName = new Map(existing.map(p => [p.name.toLowerCase(), p]));

      let created = 0, updated = 0, errors = 0;
      const errorList: string[] = [];

      for (const row of rows) {
        try {
          const payload: any = {
            name: row.name,
            category: row.category || "General",
            price: row.price || "0",
            sku: row.sku || null,
            barcode: row.barcode || null,
            taxRate: row.taxRate || null,
            trackStock: row.trackStock ?? false,
            stock: row.trackStock ? (row.stock ?? 0) : null,
            lowStockThreshold: row.trackStock ? (row.lowStockThreshold ?? 5) : null,
            sizes: [],
            modifiers: [],
            hasSizes: false,
            hasModifiers: false,
          };
          const match = (row.sku ? bySku.get(row.sku.toLowerCase()) : null)
            ?? byName.get(row.name.toLowerCase());
          if (match) {
            await storage.updateProduct(match.id, uid, payload);
            updated++;
          } else {
            await storage.createProduct(uid, payload);
            created++;
          }
        } catch (e: any) {
          errors++;
          errorList.push(`"${row.name}": ${e.message}`);
        }
      }

      cache.del(productsCacheKey(uid));
      res.json({ created, updated, errors, errorList });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // ── Pending Orders ────────────────────────────────────────────────────────

  app.get(api.pendingOrders.list.path, requireAuth, async (req, res) => {
    const orders = await storage.getPendingOrders(userId(req), activeBranchId(req));
    res.json(orders);
  });

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
      // Default cashierId to the authenticated user, and force the active branch
      // so an order placed while viewing branch A can never accidentally land on
      // a different branch.
      const enforcedBranch = await resolveBranchId(req);
      const inputWithCashier = {
        ...input,
        cashierId: input.cashierId ?? userId(req),
        branchId: enforcedBranch,
      };
      const order = await storage.createPendingOrder(userId(req), inputWithCashier);

      // When a POS order is finalized as paid, also record it as a sale so it
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
          const sale = await storage.createSale(userId(req), {
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
            cashierId: userId(req),
            notes: input.notes,
            branchId: enforcedBranch,
            // BIR compliance fields — must be persisted for X/Z reports and eSales
            discountType: rawBody.discountType ?? "regular",
            scPwdId: rawBody.scPwdId ?? null,
            vatableSales: rawBody.vatableSales ?? "0",
            vatExemptSales: rawBody.vatExemptSales ?? "0",
            zeroRatedSales: rawBody.zeroRatedSales ?? "0",
          });
          // Capture sale's BIR receipt identifiers to include in the response
          saleOrNumber = (sale as any).orNumber ?? null;
          saleReceiptNumber = (sale as any).receiptNumber ?? null;
          saleId = sale.id;

          void storage.deductProductStockForSale(userId(req), input.items as any[]).catch(e => console.error("Stock deduction failed:", e));
          if (input.discountCode) {
            try {
              const dc = await storage.getDiscountCodeByCode(input.discountCode, userId(req));
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

      // Merge BIR receipt identifiers from the auto-created sale into the
      // order response so the POS client can display the correct OR number.
      res.status(201).json({
        ...order,
        orNumber: saleOrNumber ?? (order as any).orNumber ?? null,
        receiptNumber: saleReceiptNumber ?? (order as any).receiptNumber ?? null,
        saleId,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      throw err;
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
      const order = await storage.updatePendingOrder(Number(req.params.id), userId(req), input);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      throw err;
    }
  });

  app.delete(api.pendingOrders.delete.path, requireAuth, async (req, res) => {
    const user = req.user as any;
    if (user?.tenantId && user.role !== "owner") {
      const perm = await getRolePermissionForRole(user.tenantId, user.role);
      if (perm && perm.canVoidOrder === false) {
        return res.status(403).json({ message: "You don't have permission to void orders" });
      }
    }
    const id = Number(req.params.id);
    const existing = await storage.getPendingOrder(id, userId(req));
    await storage.deletePendingOrder(id, userId(req));
    await auditLog(req, "delete", "pending_order", String(id), { total: existing?.total });
    res.status(204).end();
  });

  // ── Sales ─────────────────────────────────────────────────────────────────

  app.get(api.sales.list.path, requireAuth, async (req, res) => {
    const { limit, offset, startDate, endDate } = req.query as Record<string, string>;
    if (startDate && !isValidDate(startDate)) {
      return res.status(400).json({ message: "Invalid startDate format" });
    }
    if (endDate && !isValidDate(endDate)) {
      return res.status(400).json({ message: "Invalid endDate format" });
    }
    const salesList = await storage.getSales(userId(req), {
      branchId: activeBranchId(req),
      limit: Math.min(Number(limit) || 200, 1000),
      offset: Math.max(Number(offset) || 0, 0),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    res.json(salesList);
  });

  app.get("/api/sales/export", requireAuth, requireManagerOrAbove, async (req, res) => {
    const salesList = await storage.getSales(userId(req), { limit: 1000 });
    const headers = [
      "id","createdAt","receiptNumber","orNumber","invoiceNumber",
      "subtotal","tax","discount","total","paymentMethod","customerName",
      "discountType","scPwdId","vatableSales","vatExemptSales","zeroRatedSales",
    ];
    const rows = salesList.map((sale) => [
      sale.id,
      sale.createdAt ?? "",
      (sale as any).receiptNumber ?? "",
      (sale as any).orNumber ?? "",
      (sale as any).invoiceNumber ?? "",
      sale.subtotal ?? "",
      sale.tax ?? "",
      sale.discount ?? "",
      sale.total ?? "",
      sale.paymentMethod ?? "",
      sale.customerName ?? "",
      (sale as any).discountType ?? "regular",
      (sale as any).scPwdId ?? "",
      (sale as any).vatableSales ?? "0",
      (sale as any).vatExemptSales ?? "0",
      (sale as any).zeroRatedSales ?? "0",
    ]);
    const csv = [headers.join(","), ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="sales-journal-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.send(csv);
  });

  app.post(api.sales.create.path, requireAuth, async (req, res) => {
    try {
      const bodySchema = api.sales.create.input.extend({
        subtotal: z.coerce.string(),
        total: z.coerce.string(),
        tax: z.coerce.string().optional(),
        discount: z.coerce.string().optional(),
        paymentAmount: z.coerce.string().optional(),
        changeAmount: z.coerce.string().optional(),
        customerId: z.coerce.number().optional().nullable(),
      });
      const input = bodySchema.parse(req.body);

      // Enforce maxDiscountPercent for non-owners
      const saleUser = req.user as any;
      if (saleUser?.tenantId && saleUser.role !== "owner") {
        const perm = await getRolePermissionForRole(saleUser.tenantId, saleUser.role);
        if (perm && perm.maxDiscountPercent != null && perm.maxDiscountPercent < 100) {
          const discountAmt = parseFloat(input.discount || "0") + parseFloat((input as any).loyaltyDiscount || "0");
          const subtotalAmt = parseFloat(input.subtotal || "0");
          if (subtotalAmt > 0 && (discountAmt / subtotalAmt) * 100 > perm.maxDiscountPercent) {
            return res.status(403).json({ message: `Discount exceeds your allowed maximum of ${perm.maxDiscountPercent}%` });
          }
        }
      }

      // Increment discount code usage atomically if provided
      if (input.discountCode) {
        const dc = await storage.getDiscountCodeByCode(input.discountCode, userId(req));
        if (dc) {
          const incremented = await storage.incrementDiscountCodeUsage(dc.id);
          if (!incremented && dc.maxUses != null) {
            return res.status(400).json({ message: "Discount code has reached its usage limit" });
          }
        }
      }

      // Force the active branch so direct /api/sales calls cannot leak across branches.
      const enforcedBranch = await resolveBranchId(req);
      const inputWithCashier = { ...input, cashierId: input.cashierId ?? userId(req), branchId: enforcedBranch };
      const sale = await storage.createSale(userId(req), inputWithCashier);
      void storage.deductProductStockForSale(userId(req), input.items as any[]).catch(e => console.error("Stock deduction failed:", e));
      await auditLog(req, "create", "sale", String(sale.id), {
        total: sale.total,
        itemCount: Array.isArray(sale.items) ? sale.items.length : 0,
        paymentMethod: sale.paymentMethod,
        receiptNumber: (sale as any).receiptNumber ?? null,
        orNumber: (sale as any).orNumber ?? null,
        invoiceNumber: (sale as any).invoiceNumber ?? null,
        discountCode: sale.discountCode,
      });
      res.status(201).json(sale);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      throw err;
    }
  });

  // Note: GET /api/sales/deleted and DELETE /api/sales/:id are registered in admin-routes.ts
  // with proper manager+ authorization. Do not add duplicates here.

  // ── Notifications ─────────────────────────────────────────────────────────

  app.get("/api/notifications", requireAuth, async (req, res) => {
    const list = await storage.getNotifications(userId(req));
    res.json(list);
  });

  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    await storage.markAllNotificationsRead(userId(req));
    res.json({ ok: true });
  });

  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    await storage.markNotificationRead(Number(req.params.id), userId(req));
    res.json({ ok: true });
  });

  // ── Settings ──────────────────────────────────────────────────────────────

  app.get(api.settings.get.path, requireAuth, async (req, res) => {
    const cacheKey = settingsCacheKey(userId(req));
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const settings = await storage.getSettings(userId(req));
    if (!settings) {
      // No settings yet (pre-onboarding) — don't cache, it will change soon
      return res.json({
        id: 0,
        userId: userId(req),
        storeName: "My Store",
        currency: "$",
        taxRate: "0",
        address: null,
        phone: null,
        emailContact: null,
        receiptFooter: "Thank you for your business!",
        timezone: null,
        onboardingComplete: 0,
      });
    }
    // Auto-heal: existing users who were set up before onboarding was introduced
    // have onboardingComplete = 0 in the DB but have already configured their store.
    // If the store name has been customised (≠ default), mark onboarding as done.
    if (!settings.onboardingComplete && settings.storeName && settings.storeName !== "My Store") {
      storage.updateSettings(userId(req), { onboardingComplete: 1 }).catch(() => {});
      const healed = { ...settings, onboardingComplete: 1 };
      cache.set(cacheKey, healed, TTL.SETTINGS);
      return res.json(healed);
    }
    cache.set(cacheKey, settings, TTL.SETTINGS);
    res.json(settings);
  });

  app.put(api.settings.update.path, requireAuth, async (req, res) => {
    try {
      const bodySchema = api.settings.update.input.extend({
        taxRate: z.coerce.string().optional(),
      });
      const input = bodySchema.parse(req.body);

      // Bust settings cache so the next GET returns fresh data
      cache.del(settingsCacheKey(userId(req)));

      // Guard: ensure the user row exists before inserting settings (FK constraint)
      // This handles cases where the JWT was issued but the DB row was never persisted.
      try {
        const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId(req))).limit(1);
        if (!existingUser) {
          const u = req.user as any;
          console.warn(`[settings] User row missing for ${u.id} — auto-creating from JWT`);
          await db.insert(users).values({
            id: u.id,
            email: u.email ?? null,
            name: u.name ?? null,
            avatar: u.avatar ?? null,
            provider: u.provider ?? "email",
            providerId: u.email ?? u.id,
          } as any).onConflictDoNothing();
        }
      } catch (userCheckErr: any) {
        console.error("[settings] Failed to ensure user row:", userCheckErr);
      }

      let settings: any;
      try {
        settings = await storage.updateSettings(userId(req), input);
      } catch (settingsErr: any) {
        console.error("[settings] updateSettings failed:", settingsErr);
        return res.status(500).json({
          message: `Failed to save settings: ${settingsErr?.message || String(settingsErr)}`,
        });
      }

      // Auto-create tenant + main branch when owner completes onboarding
      if (input.onboardingComplete === 1) {
        try {
          const user = req.user as any;
          const branchName = (input.storeName as string | undefined) || settings.storeName || "Main Branch";

          // Always re-read the user row from the DB instead of trusting the
          // JWT's tenantId. The JWT is stale right after registration and a
          // double-clicked "Complete onboarding" used to race itself into
          // creating two tenants for the same user.
          const [freshUser] = await db.select().from(users).where(eq(users.id, userId(req)));
          let tenantId = (freshUser?.tenantId as string | null) ?? null;

          // If the user has no tenant yet (email/password owners), create one
          // — but guarded by an UPDATE … WHERE tenantId IS NULL so concurrent
          // requests can't both win.
          if (!tenantId) {
            const newTenant = await createTenant(branchName);
            const claim = await db.execute(
              sql`UPDATE users SET tenant_id = ${newTenant.id} WHERE id = ${userId(req)} AND tenant_id IS NULL`
            );
            const claimed = (claim as any).rowCount === 1 || (claim as any).rowsAffected === 1;
            if (claimed) {
              tenantId = newTenant.id;
            } else {
              // Another concurrent request beat us to it — drop the spare
              // tenant we just created and use the one already linked.
              const [refreshed] = await db.select().from(users).where(eq(users.id, userId(req)));
              tenantId = refreshed?.tenantId ?? null;
              try { await db.delete(tenants).where(eq(tenants.id, newTenant.id)); } catch {}
            }
            invalidateTenantCache(userId(req));

            if (tenantId) {
              // Re-issue the auth cookie so the new tenantId is in the JWT
              const updatedUser = { ...user, tenantId };
              try { setAuthCookie(res, updatedUser); } catch (cookieErr) {
                console.error("[onboarding] Failed to re-issue auth cookie:", cookieErr);
              }
            }
          }

          // Create main branch if one doesn't already exist. Pass through the
          // businessType + subType the user picked during onboarding so the
          // branch is correctly tagged from the very first store.
          if (tenantId) {
            const existingBranches = await getBranches(tenantId);
            const hasMain = existingBranches.some((b: any) => b.isMain);
            if (!hasMain) {
              await createBranch(tenantId, {
                name: branchName,
                address: (input.address as string | undefined) || settings.address || null,
                phone: (input.phone as string | undefined) || settings.phone || null,
                isMain: true,
                isActive: true,
                businessType: (input.businessType as string | undefined) || (settings as any).businessType || null,
                businessSubType: (input.businessSubType as string | undefined) || (settings as any).businessSubType || null,
              });
            }
          }
        } catch (onboardErr: any) {
          console.error("[onboarding] Failed to create tenant/branch:", onboardErr);
          return res.status(500).json({
            message: `Failed to set up your store: ${onboardErr?.message || String(onboardErr)}`,
          });
        }
      }

      // Log settings changes (skip onboarding-only updates)
      if (input.onboardingComplete !== 1 && tenantId(req)) {
        const changed: Record<string, any> = {};
        if (input.taxRate !== undefined) changed.taxRate = input.taxRate;
        if (input.loyaltyPointsPerUnit !== undefined) changed.loyaltyPointsPerUnit = input.loyaltyPointsPerUnit;
        if (input.loyaltyRedemptionRate !== undefined) changed.loyaltyRedemptionRate = input.loyaltyRedemptionRate;
        if (input.storeName !== undefined) changed.storeName = input.storeName;
        if (input.currency !== undefined) changed.currency = input.currency;
        if (Object.keys(changed).length > 0) {
          await auditLog(req, "update", "settings", undefined, changed);
        }
      }

      res.json(settings);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      throw err;
    }
  });

  // ── Customers ─────────────────────────────────────────────────────────────

  app.get("/api/customers", requireAuth, requireProOrBusinessFeature("/customers"), async (req, res) => {
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const opts: { limit?: number; offset?: number; orderByTopSpenders?: boolean } = {};
    if (!isNaN(limitRaw) && limitRaw > 0) opts.limit = Math.min(limitRaw, 1000);
    if (!isNaN(offsetRaw) && offsetRaw >= 0) opts.offset = offsetRaw;
    if (req.query.orderByTopSpenders === "true") opts.orderByTopSpenders = true;
    const list = await storage.getCustomers(userId(req), opts);
    res.json(list);
  });

  app.get("/api/customers/:id", requireAuth, requireProOrBusinessFeature("/customers"), async (req, res) => {
    const customer = await storage.getCustomer(Number(req.params.id), userId(req));
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.post("/api/customers", requireAuth, requireProOrBusinessFeature("/customers"), async (req, res) => {
    try {
      const input = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(userId(req), input);
      await auditLog(req, "create", "customer", String(customer.id), { name: customer.name });
      res.status(201).json(customer);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put("/api/customers/:id", requireAuth, requireProOrBusinessFeature("/customers"), async (req, res) => {
    try {
      const input = insertCustomerSchema.partial().parse(req.body);
      const customer = await storage.updateCustomer(Number(req.params.id), userId(req), input);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      await auditLog(req, "update", "customer", String(customer.id), { name: customer.name });
      res.json(customer);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete("/api/customers/:id", requireAuth, requireProOrBusinessFeature("/customers"), async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getCustomer(id, userId(req));
    await storage.deleteCustomer(id, userId(req));
    await auditLog(req, "delete", "customer", String(id), { name: existing?.name });
    res.status(204).end();
  });

  // Customer sales history
  app.get("/api/customers/:id/sales", requireAuth, requireProOrBusinessFeature("/customers"), async (req, res) => {
    const customerSales = await storage.getSales(userId(req), {
      customerId: Number(req.params.id),
      limit: 500,
    });
    res.json(customerSales);
  });

  // ── Expenses ──────────────────────────────────────────────────────────────

  app.get("/api/expenses", requireAuth, requirePro, async (req, res) => {
    const list = await storage.getExpenses(userId(req), activeBranchId(req));
    res.json(list);
  });

  app.post("/api/expenses", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertExpenseSchema.extend({ amount: z.coerce.string() }).parse(req.body);
      const branchId = await resolveBranchId(req);
      const expense = await storage.createExpense(userId(req), { ...input, branchId });
      await auditLog(req, "create", "expense", String(expense.id), { description: expense.description, amount: expense.amount, category: expense.category });
      res.status(201).json(expense);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put("/api/expenses/:id", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertExpenseSchema.partial().extend({ amount: z.coerce.string().optional() }).parse(req.body);
      const expense = await storage.updateExpense(Number(req.params.id), userId(req), input);
      if (!expense) return res.status(404).json({ message: "Expense not found" });
      await auditLog(req, "update", "expense", String(expense.id), { description: expense.description, amount: expense.amount });
      res.json(expense);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete("/api/expenses/:id", requireAuth, requirePro, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(expenses).where(eq(expenses.id, id));
      await storage.deleteExpense(id, userId(req));
      await auditLog(req, "delete", "expense", String(id), { description: existing?.description, amount: existing?.amount });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ── Shifts ────────────────────────────────────────────────────────────────

  app.get("/api/shifts", requireAuth, requirePro, async (req, res) => {
    const { limit, offset } = req.query as Record<string, string>;
    const list = await storage.getShifts(userId(req), {
      limit: Math.min(Number(limit) || 200, 1000),
      offset: Math.max(Number(offset) || 0, 0),
    });
    res.json(list);
  });

  app.get("/api/shifts/open", requireAuth, requirePro, async (req, res) => {
    const shift = await storage.getOpenShift(userId(req));
    res.json(shift ?? null);
  });

  app.post("/api/shifts/open", requireAuth, requirePro, async (req, res) => {
    try {
      const { openingBalance, notes } = insertShiftSchema.parse(req.body);
      // Check for existing open shift
      const existing = await storage.getOpenShift(userId(req));
      if (existing) return res.status(400).json({ message: "A shift is already open" });
      const shift = await storage.openShift(userId(req), openingBalance, notes ?? undefined);
      res.status(201).json(shift);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get("/api/shifts/:id/z-report", requireAuth, requirePro, async (req, res) => {
    const shiftId = Number(req.params.id);
    const uid = userId(req);
    const allShifts = await storage.getShifts(uid, { limit: 2000 });
    const shift = allShifts.find(s => s.id === shiftId);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    const startDate = shift.openedAt!;
    const endDate = shift.closedAt ?? new Date().toISOString();
    const salesList = await storage.getSales(uid, { limit: 10000, startDate, endDate });

    // OR number range (numeric sort to avoid lexicographic errors)
    const orNumbers = salesList.map(s => s.orNumber).filter(Boolean) as string[];
    const { orFrom, orTo } = orNumericRange(orNumbers);

    // Payment method breakdown
    const paymentBreakdown: Record<string, { count: number; total: number }> = {};
    for (const sale of salesList) {
      const pm = sale.paymentMethod || "cash";
      if (!paymentBreakdown[pm]) paymentBreakdown[pm] = { count: 0, total: 0 };
      paymentBreakdown[pm].count++;
      paymentBreakdown[pm].total += parseFloat(sale.total || "0");
    }

    // Discount type breakdown
    const discountBreakdown: Record<string, { count: number; total: number; discount: number }> = {};
    for (const sale of salesList) {
      const dt = (sale as any).discountType || "regular";
      if (!discountBreakdown[dt]) discountBreakdown[dt] = { count: 0, total: 0, discount: 0 };
      discountBreakdown[dt].count++;
      discountBreakdown[dt].total += parseFloat(sale.total || "0");
      discountBreakdown[dt].discount += parseFloat(sale.discount || "0");
    }

    // Real VAT breakdown from actual sales columns
    const vatableSalesTotal = salesList.reduce((a, s) => a + parseFloat((s as any).vatableSales || "0"), 0);
    const vatExemptTotal    = salesList.reduce((a, s) => a + parseFloat((s as any).vatExemptSales || "0"), 0);
    const zeroRatedTotal    = salesList.reduce((a, s) => a + parseFloat((s as any).zeroRatedSales || "0"), 0);
    const vatAmountTotal    = salesList.reduce((a, s) => a + parseFloat(s.tax || "0"), 0);

    // Top items by quantity
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
      const { closingBalance, notes } = closeShiftSchema.parse(req.body);
      const shift = await storage.closeShift(Number(req.params.id), userId(req), closingBalance, notes ?? undefined);
      if (!shift) return res.status(404).json({ message: "Shift not found" });
      res.json(shift);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // ── BIR Compliance ────────────────────────────────────────────────────────

  // Helper: compute OR number min/max using numeric ordering (avoids lexicographic bugs
  // where "9" > "100"). Falls back to lexicographic sort for alphanumeric OR numbers.
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

  app.get("/api/bir/x-report", requireAuth, async (req, res) => {
    const uid = userId(req);
    const openShift = await storage.getOpenShift(uid);
    if (!openShift) return res.json({ shift: null });
    const startDate = openShift.openedAt!;
    const salesList = await storage.getSales(uid, { limit: 10000, startDate });
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
    res.json({
      shift: openShift,
      orFrom, orTo,
      totalTransactions: salesList.length,
      grossSales: salesList.reduce((a, s) => a + parseFloat(s.total || "0"), 0),
      netSales:   salesList.reduce((a, s) => a + parseFloat(s.total || "0") - parseFloat(s.tax || "0"), 0),
      totalDiscount: salesList.reduce((a, s) => a + parseFloat(s.discount || "0"), 0),
      totalLoyaltyDiscount: salesList.reduce((a, s) => a + parseFloat((s as any).loyaltyDiscount || "0"), 0),
      vatableSalesTotal: salesList.reduce((a, s) => a + parseFloat((s as any).vatableSales || "0"), 0),
      vatExemptTotal:    salesList.reduce((a, s) => a + parseFloat((s as any).vatExemptSales  || "0"), 0),
      zeroRatedTotal:    salesList.reduce((a, s) => a + parseFloat((s as any).zeroRatedSales  || "0"), 0),
      vatAmountTotal:    salesList.reduce((a, s) => a + parseFloat(s.tax  || "0"), 0),
      paymentBreakdown,
      discountBreakdown,
    });
  });

  app.get("/api/bir/summary", requireAuth, requireManagerOrAbove, async (req, res) => {
    const { month } = req.query as Record<string, string>;
    if (!month || !/^\d{4}-\d{2}$/.test(month))
      return res.status(400).json({ message: "Invalid month format. Use YYYY-MM" });
    const [year, mon] = month.split("-").map(Number);
    // Use Philippine Standard Time (UTC+8) for month boundaries
    const monStr = String(mon).padStart(2, "0");
    const lastDay = new Date(year, mon, 0).getDate();
    const lastDayStr = String(lastDay).padStart(2, "0");
    const startDate = new Date(`${year}-${monStr}-01T00:00:00+08:00`).toISOString();
    const endDate   = new Date(`${year}-${monStr}-${lastDayStr}T23:59:59.999+08:00`).toISOString();
    const salesList = await storage.getSales(userId(req), { limit: 10000, startDate, endDate });
    const orNumbers = salesList.map(s => s.orNumber).filter(Boolean) as string[];
    const { orFrom, orTo } = orNumericRange(orNumbers);
    const paymentBreakdown: Record<string, { count: number; total: number }> = {};
    for (const s of salesList) {
      const pm = s.paymentMethod || "cash";
      if (!paymentBreakdown[pm]) paymentBreakdown[pm] = { count: 0, total: 0 };
      paymentBreakdown[pm].count++;
      paymentBreakdown[pm].total += parseFloat(s.total || "0");
    }
    const scPwdSales = salesList.filter(s => ["sc","pwd"].includes((s as any).discountType));
    res.json({
      month, orFrom, orTo,
      totalTransactions: salesList.length,
      grossSales:    salesList.reduce((a, s) => a + parseFloat(s.total       || "0"), 0),
      netSales:      salesList.reduce((a, s) => a + parseFloat(s.total || "0") - parseFloat(s.tax || "0"), 0),
      outputVat:     salesList.reduce((a, s) => a + parseFloat(s.tax         || "0"), 0),
      vatableSales:  salesList.reduce((a, s) => a + parseFloat((s as any).vatableSales  || "0"), 0),
      vatExemptSales:salesList.reduce((a, s) => a + parseFloat((s as any).vatExemptSales|| "0"), 0),
      zeroRatedSales:salesList.reduce((a, s) => a + parseFloat((s as any).zeroRatedSales|| "0"), 0),
      totalDiscount: salesList.reduce((a, s) => a + parseFloat(s.discount    || "0"), 0),
      scPwdCount:    scPwdSales.length,
      scPwdDiscount: scPwdSales.reduce((a, s) => a + parseFloat(s.discount   || "0"), 0),
      paymentBreakdown,
    });
  });

  app.get("/api/bir/esales-export", requireAuth, requireManagerOrAbove, async (req, res) => {
    const { month } = req.query as Record<string, string>;
    if (!month || !/^\d{4}-\d{2}$/.test(month))
      return res.status(400).json({ message: "Invalid month format. Use YYYY-MM" });
    const [year, mon] = month.split("-").map(Number);
    // Use Philippine Standard Time (UTC+8) for month boundaries
    const monStr2 = String(mon).padStart(2, "0");
    const lastDay2 = new Date(year, mon, 0).getDate();
    const lastDayStr2 = String(lastDay2).padStart(2, "0");
    const startDate = new Date(`${year}-${monStr2}-01T00:00:00+08:00`).toISOString();
    const endDate   = new Date(`${year}-${monStr2}-${lastDayStr2}T23:59:59.999+08:00`).toISOString();
    const [salesList, settingsData] = await Promise.all([
      storage.getSales(userId(req), { limit: 10000, startDate, endDate }),
      storage.getSettings(userId(req)),
    ]);
    const tin = (settingsData as any)?.tin || "";
    const storeName = (settingsData as any)?.storeName || "";
    const ptu = (settingsData as any)?.ptuNumber || "";
    const accredNo = (settingsData as any)?.accreditationNumber || "";
    const machSN = (settingsData as any)?.machineSerialNumber || "";
    const headers = [
      "Date","OR Number","Customer Name","Payment Method",
      "Gross Sales (incl. VAT)","VATable Sales","Output VAT",
      "VAT-Exempt Sales","Zero-Rated Sales","Discount","Discount Type",
      "SC/PWD ID","Net Amount",
    ];
    const rows = salesList.map(s => {
      // Format date in Philippine Standard Time (UTC+8) for BIR compliance
      const date = s.createdAt
        ? new Date(s.createdAt).toLocaleDateString("en-PH", { month:"2-digit", day:"2-digit", year:"numeric", timeZone:"Asia/Manila" })
        : "";
      const netAmount = (
        parseFloat(s.total || "0") -
        parseFloat(s.tax   || "0")
      ).toFixed(2);
      return [
        date,
        (s as any).orNumber || (s as any).receiptNumber || "",
        s.customerName || "WALK-IN",
        s.paymentMethod || "cash",
        parseFloat(s.total || "0").toFixed(2),
        parseFloat((s as any).vatableSales  || "0").toFixed(2),
        parseFloat(s.tax                    || "0").toFixed(2),
        parseFloat((s as any).vatExemptSales|| "0").toFixed(2),
        parseFloat((s as any).zeroRatedSales|| "0").toFixed(2),
        parseFloat(s.discount               || "0").toFixed(2),
        (s as any).discountType || "regular",
        (s as any).scPwdId || "",
        netAmount,
      ];
    });
    const csv = [
      `# BIR eSales Report`,
      `# Taxpayer: ${storeName}`,
      `# TIN: ${tin}`,
      `# PTU No.: ${ptu}`,
      ...(accredNo ? [`# Accreditation No.: ${accredNo}`] : []),
      ...(machSN   ? [`# Machine S/N: ${machSN}`]         : []),
      `# Period: ${month}`,
      `# Timezone: Asia/Manila (PST UTC+8)`,
      `# Generated: ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })} PST`,
      `#`,
      headers.join(","),
      ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="BIR-eSales-${month}.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(csv);
  });

  // ── BIR Electronic Journal (E-Journal) ───────────────────────────────────
  // Generates a sequential, fixed-width text log of all POS transactions for a
  // given month — grouped by calendar day with daily subtotals and a period
  // summary. This is the standard CAS E-Journal format required by BIR.
  app.get("/api/bir/ejournal", requireAuth, requireManagerOrAbove, async (req, res) => {
    const { month } = req.query as Record<string, string>;
    if (!month || !/^\d{4}-\d{2}$/.test(month))
      return res.status(400).json({ message: "Invalid month format. Use YYYY-MM" });

    const [year, mon] = month.split("-").map(Number);
    const monStr = String(mon).padStart(2, "0");
    const lastDay = new Date(year, mon, 0).getDate();
    const lastDayStr = String(lastDay).padStart(2, "0");
    const startDate = new Date(`${year}-${monStr}-01T00:00:00+08:00`).toISOString();
    const endDate   = new Date(`${year}-${monStr}-${lastDayStr}T23:59:59.999+08:00`).toISOString();

    const [salesList, settingsData] = await Promise.all([
      storage.getSales(userId(req), { limit: 50000, startDate, endDate }),
      storage.getSettings(userId(req)),
    ]);

    // Sort ascending by creation time
    salesList.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());

    const tin        = (settingsData as any)?.tin               || "";
    const storeName  = (settingsData as any)?.storeName         || "STORE";
    const ptu        = (settingsData as any)?.ptuNumber         || "";
    const accredNo   = (settingsData as any)?.accreditationNumber || "";
    const machSN     = (settingsData as any)?.machineSerialNumber || "";
    const currency   = (settingsData as any)?.currency           || "PHP";

    const now       = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const periodLabel = new Date(`${year}-${monStr}-01`).toLocaleString("en-PH", { month: "long", year: "numeric", timeZone: "Asia/Manila" });

    const SEP  = "=".repeat(96);
    const DASH = "-".repeat(96);

    function pad(s: string | number, len: number, right = false): string {
      const str = String(s);
      return right ? str.padStart(len) : str.padEnd(len);
    }

    function fmtDate(d: Date): string {
      return d.toLocaleDateString("en-PH", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "Asia/Manila" });
    }

    function fmtTime(d: Date): string {
      return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Manila" });
    }

    function fmtDay(d: Date): string {
      return d.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).toUpperCase();
    }

    function amt(n: number): string { return n.toFixed(2).padStart(12); }

    const lines: string[] = [];

    // ── Header ──────────────────────────────────────────────────────────────
    lines.push(SEP);
    lines.push(pad("ELECTRONIC JOURNAL (E-JOURNAL)", 96).replace(/^/, " ".repeat(32)));
    lines.push(pad(`${storeName.toUpperCase()}`, 96).replace(/^/, " ".repeat(Math.max(0, Math.floor((96 - storeName.length) / 2)))));
    if (tin)      lines.push(`   TIN: ${pad(tin, 30)}${ptu ? `PTU No.: ${ptu}` : ""}`);
    if (machSN)   lines.push(`   Machine S/N: ${pad(machSN, 24)}${accredNo ? `Accreditation No.: ${accredNo}` : ""}`);
    lines.push(`   Period: ${periodLabel.padEnd(30)}Timezone: Asia/Manila (PST UTC+8)`);
    lines.push(`   Generated: ${now} PST`);
    lines.push(SEP);
    lines.push("");

    // ── Column headers ───────────────────────────────────────────────────────
    const COL_HDR = `${"EJ#".padEnd(7)}${"DATE".padEnd(12)}${"TIME".padEnd(10)}${"OR #".padEnd(14)}${"PAYMENT".padEnd(12)}${"DISC TYPE".padEnd(12)}${amt("GROSS")}${amt("DISC")}${amt("TAX")}${amt("NET")}`;
    lines.push(COL_HDR);
    lines.push(DASH);

    // ── Transaction rows grouped by day ─────────────────────────────────────
    let ejSeq  = 0;
    let periodGross   = 0, periodDisc = 0, periodTax = 0, periodNet = 0;
    let periodVatable = 0, periodExempt = 0, periodZero = 0;
    let orNumbers: string[] = [];

    // Group by calendar day in PH time
    const dayMap = new Map<string, typeof salesList>();
    for (const s of salesList) {
      const dayKey = new Date(s.createdAt!).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
      dayMap.get(dayKey)!.push(s);
    }

    for (const [, daySales] of dayMap) {
      const firstDate = new Date(daySales[0].createdAt!);
      lines.push(`-- ${fmtDay(firstDate)} --`);

      let dayGross = 0, dayDisc = 0, dayTax = 0, dayNet = 0;

      for (const s of daySales) {
        ejSeq++;
        const d     = new Date(s.createdAt!);
        const gross = parseFloat(s.total    || "0");
        const disc  = parseFloat(s.discount || "0");
        const tax   = parseFloat(s.tax      || "0");
        const net   = gross - tax;
        const orNum = (s as any).orNumber || (s as any).receiptNumber || "";
        const pm    = (s.paymentMethod || "cash").toUpperCase().slice(0, 10);
        const dt    = ((s as any).discountType || "regular").toUpperCase().slice(0, 10);

        dayGross   += gross; dayDisc += disc; dayTax += tax; dayNet += net;
        periodVatable += parseFloat((s as any).vatableSales  || "0");
        periodExempt  += parseFloat((s as any).vatExemptSales|| "0");
        periodZero    += parseFloat((s as any).zeroRatedSales|| "0");
        if (orNum) orNumbers.push(orNum);

        lines.push(
          `${pad(String(ejSeq).padStart(5, "0"), 7)}${fmtDate(d).padEnd(12)}${fmtTime(d).padEnd(10)}${pad(orNum, 14)}${pad(pm, 12)}${pad(dt, 12)}${amt(gross)}${amt(disc)}${amt(tax)}${amt(net)}`
        );
      }

      periodGross += dayGross; periodDisc += dayDisc; periodTax += dayTax; periodNet += dayNet;

      lines.push(
        `${"DAILY TOTAL:".padEnd(43)}${pad(`${daySales.length} txn${daySales.length !== 1 ? "s" : ""}`, 8, true)}${amt(dayGross)}${amt(dayDisc)}${amt(dayTax)}${amt(dayNet)}`
      );
      lines.push(DASH);
    }

    if (salesList.length === 0) {
      lines.push("   No transactions recorded for this period.");
      lines.push(DASH);
    }

    // ── Period summary ───────────────────────────────────────────────────────
    lines.push("");
    lines.push(`PERIOD SUMMARY — ${periodLabel.toUpperCase()}`);
    lines.push(DASH);

    const orNums = orNumbers.filter(o => /^\d+$/.test(o)).map(Number).sort((a, b) => a - b);
    const orFrom = orNums.length ? String(orNums[0]).padStart(7, "0") : "(none)";
    const orTo   = orNums.length ? String(orNums[orNums.length - 1]).padStart(7, "0") : "(none)";

    const summaryRows: [string, string][] = [
      ["Total Transactions:", `${salesList.length}`],
      ["OR Range:",           `${orFrom} — ${orTo}`],
      ["Currency:",           currency],
      ["Gross Sales:",        periodGross.toFixed(2)],
      ["Total Discount:",     periodDisc.toFixed(2)],
      ["Output VAT:",         periodTax.toFixed(2)],
      ["VATable Sales:",      periodVatable.toFixed(2)],
      ["VAT-Exempt Sales:",   periodExempt.toFixed(2)],
      ["Zero-Rated Sales:",   periodZero.toFixed(2)],
      ["Net Sales:",          periodNet.toFixed(2)],
    ];
    for (const [label, value] of summaryRows) {
      lines.push(`   ${label.padEnd(26)}${value.padStart(16)}`);
    }

    lines.push("");
    lines.push(SEP);
    lines.push("END OF ELECTRONIC JOURNAL");
    lines.push(SEP);

    const body = lines.join("\n");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="EJournal-${month}.txt"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(body);
  });

  // ── BIR OR Gap Detection ──────────────────────────────────────────────────
  // Uses a DB-level window function so we never load full sale rows into memory.
  app.get("/api/bir/or-gaps", requireAuth, async (req, res) => {
    const uid = userId(req);
    // Fetch only numeric OR numbers for this tenant — no full row hydration.
    const rows = await db.execute(sql`
      SELECT CAST(or_number AS bigint) AS n
      FROM   sales
      WHERE  user_id = ANY(
               SELECT id FROM users WHERE tenant_id = (
                 SELECT tenant_id FROM users WHERE id = ${uid}
               )
             )
        AND  or_number ~ '^[0-9]+$'
        AND  deleted_at IS NULL
      ORDER  BY n
    `);

    const orNumbers: number[] = (rows.rows as any[]).map(r => Number(r.n));

    if (orNumbers.length < 2) {
      return res.json({ gaps: [], totalChecked: orNumbers.length, gapCount: 0 });
    }

    const gaps: { from: number; to: number; count: number }[] = [];
    for (let i = 0; i < orNumbers.length - 1; i++) {
      const diff = orNumbers[i + 1] - orNumbers[i];
      if (diff > 1) {
        gaps.push({ from: orNumbers[i] + 1, to: orNumbers[i + 1] - 1, count: diff - 1 });
      }
    }

    res.json({
      gaps: gaps.slice(0, 50),
      totalChecked: orNumbers.length,
      gapCount: gaps.reduce((a, g) => a + g.count, 0),
      orMin: orNumbers[0],
      orMax: orNumbers[orNumbers.length - 1],
    });
  });

  // ── BIR Hash Integrity Audit ──────────────────────────────────────────────
  // Recomputes every sale's SHA-256 hash from stored fiscal fields and compares
  // it against the recorded sale_hash. Any mismatch proves the row was modified
  // after initial creation — the audit result can be exported for BIR review.
  app.get("/api/bir/hash-verify", requireAuth, requireManagerOrAbove, async (req, res) => {
    const uid = userId(req);
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    // Fetch raw rows for all users in the same tenant — scoping to only the
    // requesting user's ID would miss sales created by other staff members,
    // producing an incomplete integrity report for the BIR auditor.
    const rows = await db.execute(sql`
      SELECT
        id, user_id, receipt_number, or_number, invoice_number,
        subtotal, tax, discount, vatable_sales, vat_exempt_sales, zero_rated_sales,
        total, discount_type, created_at, sale_hash
      FROM sales
      WHERE user_id = ANY(
              SELECT id FROM users WHERE tenant_id = (
                SELECT tenant_id FROM users WHERE id = ${uid}
              )
            )
        AND deleted_at IS NULL
        ${startDate ? sql`AND created_at >= ${startDate}` : sql``}
        ${endDate   ? sql`AND created_at <= ${endDate}`   : sql``}
      ORDER BY id ASC
    `);

    let passed = 0;
    let failed = 0;
    let missing = 0;
    const tamperedRows: { id: number; orNumber: string; createdAt: string }[] = [];

    for (const r of rows.rows as any[]) {
      if (!r.sale_hash) { missing++; continue; }

      const payload = [
        r.user_id,
        r.receipt_number  ?? "",
        r.or_number       ?? "",
        r.invoice_number  ?? "",
        r.subtotal        ?? "0",
        r.tax             ?? "0",
        r.discount        ?? "0",
        r.vatable_sales   ?? "0",
        r.vat_exempt_sales ?? "0",
        r.zero_rated_sales ?? "0",
        r.total,
        r.discount_type   ?? "regular",
        r.created_at,
      ].join("|");

      const { createHash } = await import("crypto");
      const expected = createHash("sha256").update(payload).digest("hex");

      if (expected === r.sale_hash) {
        passed++;
      } else {
        failed++;
        tamperedRows.push({ id: r.id, orNumber: r.or_number ?? "", createdAt: r.created_at ?? "" });
      }
    }

    res.json({
      totalChecked: rows.rows.length,
      passed,
      failed,
      missingHash: missing,
      integrityOk: failed === 0,
      tamperedRows: tamperedRows.slice(0, 100),
      checkedAt: new Date().toISOString(),
    });
  });

  // ── Discount Codes ────────────────────────────────────────────────────────

  app.get("/api/discount-codes", requireAuth, requirePro, async (req, res) => {
    const list = await storage.getDiscountCodes(userId(req));
    res.json(list);
  });

  app.post("/api/discount-codes/validate", requireAuth, requirePro, async (req, res) => {
    try {
      const { code, orderTotal } = z.object({ code: z.string(), orderTotal: z.number() }).parse(req.body);
      const dc = await storage.getDiscountCodeByCode(code, userId(req));
      if (!dc) return res.status(404).json({ message: "Invalid discount code" });
      if (!dc.isActive) return res.status(400).json({ message: "Discount code is inactive" });
      if (dc.expiresAt && new Date(dc.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Discount code has expired" });
      }
      if (dc.maxUses && (dc.usedCount ?? 0) >= dc.maxUses) {
        return res.status(400).json({ message: "Discount code has reached its usage limit" });
      }
      const minOrder = parseFloat(dc.minOrder ?? "0");
      if (orderTotal < minOrder) {
        return res.status(400).json({ message: `Minimum order amount is ${minOrder}` });
      }
      const value = parseFloat(dc.value);
      const discountAmount = dc.type === "percentage"
        ? (orderTotal * value) / 100
        : Math.min(value, orderTotal);
      res.json({ ...dc, discountAmount: discountAmount.toFixed(2) });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.post("/api/discount-codes", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertDiscountCodeSchema.parse(req.body);
      const dc = await storage.createDiscountCode(userId(req), input);
      await auditLog(req, "create", "discount_code", String(dc.id), { code: dc.code, type: dc.type, value: dc.value });
      res.status(201).json(dc);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put("/api/discount-codes/:id", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertDiscountCodeSchema.partial().parse(req.body);
      const dc = await storage.updateDiscountCode(Number(req.params.id), userId(req), input);
      if (!dc) return res.status(404).json({ message: "Discount code not found" });
      await auditLog(req, "update", "discount_code", String(dc.id), { code: dc.code });
      res.json(dc);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete("/api/discount-codes/:id", requireAuth, requirePro, async (req, res) => {
    const id = Number(req.params.id);
    const list = await storage.getDiscountCodes(userId(req));
    const existing = list.find(d => d.id === id);
    await storage.deleteDiscountCode(id, userId(req));
    await auditLog(req, "delete", "discount_code", String(id), { code: existing?.code });
    res.status(204).end();
  });

  // ── Refunds ───────────────────────────────────────────────────────────────

  app.get("/api/refunds", requireAuth, requireManagerOrAbove, async (req, res) => {
    const list = await storage.getRefunds(userId(req));
    res.json(list);
  });

  app.get("/api/refunds/sale/:saleId", requireAuth, async (req, res) => {
    const list = await storage.getRefundsBySale(Number(req.params.saleId), userId(req));
    res.json(list);
  });

  app.post("/api/refunds", requireAuth, requireManagerOrAbove, async (req, res) => {
    try {
      const refundUser = req.user as any;
      if (refundUser?.tenantId && refundUser.role !== "owner") {
        const perm = await getRolePermissionForRole(refundUser.tenantId, refundUser.role);
        if (perm && perm.canRefund === false) {
          return res.status(403).json({ message: "You don't have permission to process refunds" });
        }
      }
      const input = insertRefundSchema.extend({ amount: z.coerce.string() }).parse(req.body);
      const refund = await storage.createRefund(userId(req), input);
      const sale = await storage.getSaleById(refund.saleId, userId(req));
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
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete("/api/sales/:id", requireAuth, requireManagerOrAbove, async (req, res) => {
    const saleUser = req.user as any;
    if (saleUser?.tenantId && saleUser.role !== "owner") {
      const perm = await getRolePermissionForRole(saleUser.tenantId, saleUser.role);
      if (perm && perm.canDeleteSale === false) {
        return res.status(403).json({ message: "You don't have permission to delete sales" });
      }
    }
    const id = Number(req.params.id);

    // ── BIR Z-report lock ──────────────────────────────────────────────────
    // A sale that was included in a closed shift (Z-report already generated)
    // cannot be retroactively voided. This preserves the integrity of the
    // sealed period for BIR audit purposes.
    const uid = userId(req);
    const [saleRow] = await db
      .select({ id: salesTable.id, createdAt: salesTable.createdAt })
      .from(salesTable)
      .where(eq(salesTable.id, id));

    if (saleRow?.createdAt) {
      const closedShifts = await db
        .select({ openedAt: shiftsTable.openedAt, closedAt: shiftsTable.closedAt })
        .from(shiftsTable)
        .where(and(eq(shiftsTable.userId, uid), eq(shiftsTable.status, "closed")));

      const saleTime = saleRow.createdAt;
      const lockedByShift = closedShifts.some(
        s => s.openedAt && s.closedAt && saleTime >= s.openedAt && saleTime <= s.closedAt
      );
      if (lockedByShift) {
        return res.status(409).json({
          message: "This sale is locked inside a closed shift (Z-report already generated). It cannot be voided to preserve BIR audit integrity.",
        });
      }
    }

    const deleted = await storage.softDeleteSale(id, uid, uid);
    if (!deleted) return res.status(404).json({ message: "Sale not found" });
    await auditLog(req, "delete", "sale", String(id), { softDelete: true });
    res.status(204).end();
  });

  // ── Barcode Lookup ────────────────────────────────────────────────────────

  app.get("/api/products/barcode/:barcode", requireAuth, async (req, res) => {
    const cacheKey = barcodeCacheKey(userId(req), req.params.barcode as string);
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);
    const product = await storage.getProductByBarcode(req.params.barcode as string, userId(req));
    if (!product) return res.status(404).json({ message: "Product not found" });
    cache.set(cacheKey, product, TTL.BARCODE);
    res.json(product);
  });

  // ── Tables ────────────────────────────────────────────────────────────────

  app.get("/api/tables", requireAuth, requireProOrBusinessFeature("/tables"), async (req, res) => {
    const list = await storage.getTables(userId(req));
    res.json(list);
  });

  app.post("/api/tables", requireAuth, requireProOrBusinessFeature("/tables"), async (req, res) => {
    try {
      const input = insertTableSchema.parse(req.body);
      const table = await storage.createTable(userId(req), input);
      res.status(201).json(table);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put("/api/tables/:id", requireAuth, requireProOrBusinessFeature("/tables"), async (req, res) => {
    try {
      const input = insertTableSchema.partial().parse(req.body);
      const table = await storage.updateTable(Number(req.params.id), userId(req), input);
      if (!table) return res.status(404).json({ message: "Table not found" });
      res.json(table);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/tables/:id", requireAuth, requireProOrBusinessFeature("/tables"), async (req, res, next) => {
    try {
      await storage.deleteTable(Number(req.params.id), userId(req));
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ── Suppliers ─────────────────────────────────────────────────────────────

  app.get("/api/suppliers", requireAuth, requirePro, async (req, res) => {
    const list = await storage.getSuppliers(userId(req));
    res.json(list);
  });

  app.post("/api/suppliers", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertSupplierSchema.parse(req.body);
      const supplier = await storage.createSupplier(userId(req), input);
      res.status(201).json(supplier);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put("/api/suppliers/:id", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertSupplierSchema.partial().parse(req.body);
      const supplier = await storage.updateSupplier(Number(req.params.id), userId(req), input);
      if (!supplier) return res.status(404).json({ message: "Supplier not found" });
      res.json(supplier);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/suppliers/:id", requireAuth, requirePro, async (req, res, next) => {
    try {
      const sid = Number(req.params.id);
      const [existing] = await storage.getSuppliers(userId(req)).then(list => [list.find(s => s.id === sid)]);
      await storage.deleteSupplier(sid, userId(req));
      await auditLog(req, "delete", "supplier", String(sid), { name: existing?.name });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ── Purchase Orders ───────────────────────────────────────────────────────

  app.get("/api/purchase-orders", requireAuth, requirePro, async (req, res) => {
    const list = await storage.getPurchaseOrders(userId(req));
    res.json(list);
  });

  app.post("/api/purchase-orders", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertPurchaseOrderSchema.parse(req.body);
      const po = await storage.createPurchaseOrder(userId(req), input);
      await auditLog(req, "create", "purchase_order", String(po.id), { totalAmount: po.totalAmount, status: po.status });
      res.status(201).json(po);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.post("/api/purchase-orders/:id/receive", requireAuth, requirePro, async (req, res) => {
    const po = await storage.receivePurchaseOrder(Number(req.params.id), userId(req));
    if (!po) return res.status(404).json({ message: "Purchase order not found" });
    await auditLog(req, "receive", "purchase_order", String(po.id), { totalAmount: po.totalAmount });
    res.json(po);
  });

  app.post("/api/purchase-orders/:id/cancel", requireAuth, requirePro, async (req, res) => {
    const po = await storage.cancelPurchaseOrder(Number(req.params.id), userId(req));
    if (!po) return res.status(404).json({ message: "Purchase order not found" });
    await auditLog(req, "cancel", "purchase_order", String(po.id), { totalAmount: po.totalAmount });
    res.json(po);
  });

  // ── Time Logs ─────────────────────────────────────────────────────────────

  app.get("/api/time-logs", requireAuth, requirePro, async (req, res) => {
    const list = await storage.getTimeLogs(userId(req));
    res.json(list);
  });

  app.get("/api/time-logs/active", requireAuth, requirePro, async (req, res) => {
    const log = await storage.getActiveTimeLog(userId(req));
    res.json(log ?? null);
  });

  app.post("/api/time-logs/clock-in", requireAuth, requirePro, async (req, res) => {
    try {
      // Check if already clocked in
      const active = await storage.getActiveTimeLog(userId(req));
      if (active) return res.status(400).json({ message: "Already clocked in" });
      const { notes } = z.object({ notes: z.string().optional() }).parse(req.body);
      const log = await storage.clockIn(userId(req), notes);
      res.status(201).json(log);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.post("/api/time-logs/clock-out", requireAuth, requirePro, async (req, res) => {
    try {
      const { notes } = z.object({ notes: z.string().optional() }).parse(req.body);
      const log = await storage.clockOut(userId(req), notes);
      if (!log) return res.status(400).json({ message: "Not clocked in" });
      res.json(log);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ── Loyalty Points ────────────────────────────────────────────────────────

  app.post("/api/customers/:id/loyalty", requireAuth, requirePro, async (req, res) => {
    try {
      const { delta, reason, saleId, note } = z.object({
        delta: z.number(),
        reason: z.string().optional(),
        saleId: z.number().optional(),
        note: z.string().optional(),
      }).parse(req.body);
      const customer = await storage.adjustLoyaltyPoints(Number(req.params.id), delta, userId(req), { reason, saleId, note });
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      res.json(customer);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.get("/api/customers/:id/loyalty-log", requireAuth, requirePro, async (req, res, next) => {
    try {
      const logs = await storage.getLoyaltyPointsLog(Number(req.params.id), userId(req));
      res.json(logs);
    } catch (err) { next(err); }
  });

  app.post("/api/customers/:id/redeem-reward", requireAuth, requirePro, async (req, res, next) => {
    try {
      const { rewardId } = z.object({ rewardId: z.number().int() }).parse(req.body);
      const result = await storage.redeemLoyaltyReward(Number(req.params.id), rewardId, userId(req));
      if (!result) return res.status(400).json({ message: "Cannot redeem: insufficient points or invalid reward" });
      await auditLog(req, "create", "customer", String(req.params.id), { rewardId });
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // ── Loyalty Tiers ─────────────────────────────────────────────────────────

  app.get("/api/loyalty/tiers", requireAuth, requirePro, async (req, res, next) => {
    try { res.json(await storage.getLoyaltyTiers(userId(req))); } catch (err) { next(err); }
  });

  app.post("/api/loyalty/tiers", requireAuth, requirePro, async (req, res, next) => {
    try {
      const body = z.object({
        name: z.string().min(1), minLifetimePoints: z.number().int().min(0),
        multiplier: z.string().default("1"), color: z.string().default("#CD7F32"),
        perks: z.string().optional().nullable(), sortOrder: z.number().int().default(0),
      }).parse(req.body);
      const tier = await storage.createLoyaltyTier(userId(req), body);
      await auditLog(req, "create", "loyalty_tier", String(tier.id), { name: tier.name, minLifetimePoints: tier.minLifetimePoints });
      res.status(201).json(tier);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.patch("/api/loyalty/tiers/:id", requireAuth, requirePro, async (req, res, next) => {
    try {
      const body = req.body;
      const updated = await storage.updateLoyaltyTier(Number(req.params.id), userId(req), body);
      if (!updated) return res.status(404).json({ message: "Tier not found" });
      await auditLog(req, "update", "loyalty_tier", String(updated.id), { name: updated.name });
      res.json(updated);
    } catch (err) { next(err); }
  });

  app.delete("/api/loyalty/tiers/:id", requireAuth, requirePro, async (req, res, next) => {
    try {
      const existing = await storage.getLoyaltyTiers(userId(req)).then(list => list.find(t => t.id === Number(req.params.id)));
      await storage.deleteLoyaltyTier(Number(req.params.id), userId(req));
      await auditLog(req, "delete", "loyalty_tier", String(req.params.id), { name: existing?.name });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ── Loyalty Rewards Catalog ───────────────────────────────────────────────

  app.get("/api/loyalty/rewards", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getLoyaltyRewards(userId(req))); } catch (err) { next(err); }
  });

  app.post("/api/loyalty/rewards", requireAuth, requirePro, async (req, res, next) => {
    try {
      const body = z.object({
        name: z.string().min(1),
        description: z.string().optional().nullable(),
        type: z.enum(["discount_fixed", "discount_percent", "free_product", "stamp_card", "custom"]),
        pointsCost: z.number().int().min(1),
        value: z.string().default("0"),
        productId: z.number().int().optional().nullable(),
        isActive: z.boolean().default(true),
        maxRedemptions: z.number().int().optional().nullable(),
        expiresAt: z.string().optional().nullable(),
      }).parse(req.body);
      const reward = await storage.createLoyaltyReward(userId(req), body);
      await auditLog(req, "create", "loyalty_reward", String(reward.id), { name: reward.name, type: reward.type });
      res.status(201).json(reward);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.patch("/api/loyalty/rewards/:id", requireAuth, requirePro, async (req, res, next) => {
    try {
      const updated = await storage.updateLoyaltyReward(Number(req.params.id), userId(req), req.body);
      if (!updated) return res.status(404).json({ message: "Reward not found" });
      await auditLog(req, "update", "loyalty_reward", String(updated.id), { name: updated.name, isActive: updated.isActive });
      res.json(updated);
    } catch (err) { next(err); }
  });

  app.delete("/api/loyalty/rewards/:id", requireAuth, requirePro, async (req, res, next) => {
    try {
      const existing = await storage.getLoyaltyRewards(userId(req)).then(list => list.find(r => r.id === Number(req.params.id)));
      await storage.deleteLoyaltyReward(Number(req.params.id), userId(req));
      await auditLog(req, "delete", "loyalty_reward", String(req.params.id), { name: existing?.name });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ── Kitchen Status Update ─────────────────────────────────────────────────

  app.patch("/api/pending-orders/:id/kitchen", requireAuth, requireProOrBusinessFeature("/kitchen"), async (req, res) => {
    try {
      const { kitchenStatus } = z.object({ kitchenStatus: z.enum(["pending", "preparing", "ready", "done"]) }).parse(req.body);
      const order = await storage.updatePendingOrder(Number(req.params.id), userId(req), { kitchenStatus });
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ── Service Staff ─────────────────────────────────────────────────────────

  app.get("/api/service-staff", requireAuth, requireProOrBusinessFeature("/staff"), async (req, res) => {
    const staff = await storage.getServiceStaff(userId(req));
    res.json(staff);
  });

  app.get("/api/service-staff/:id", requireAuth, requireProOrBusinessFeature("/staff"), async (req, res) => {
    const member = await storage.getServiceStaffMember(Number(req.params.id), userId(req));
    if (!member) return res.status(404).json({ message: "Staff member not found" });
    res.json(member);
  });

  app.post("/api/service-staff", requireAuth, requireProOrBusinessFeature("/staff"), async (req, res) => {
    try {
      const input = insertServiceStaffSchema.parse(req.body);
      const member = await storage.createServiceStaff(userId(req), input);
      await auditLog(req, "create", "service_staff", String(member.id), { name: member.name });
      res.status(201).json(member);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put("/api/service-staff/:id", requireAuth, requireProOrBusinessFeature("/staff"), async (req, res) => {
    try {
      const input = insertServiceStaffSchema.partial().parse(req.body);
      const member = await storage.updateServiceStaff(Number(req.params.id), userId(req), input);
      if (!member) return res.status(404).json({ message: "Staff member not found" });
      await auditLog(req, "update", "service_staff", String(member.id), { name: member.name });
      res.json(member);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/service-staff/:id", requireAuth, requireProOrBusinessFeature("/staff"), async (req, res, next) => {
    try {
      const existing = await storage.getServiceStaffMember(Number(req.params.id), userId(req));
      await storage.deleteServiceStaff(Number(req.params.id), userId(req));
      await auditLog(req, "delete", "service_staff", String(req.params.id), { name: existing?.name });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ── Service Rooms ─────────────────────────────────────────────────────────

  app.get("/api/service-rooms", requireAuth, requireProOrBusinessFeature("/rooms"), async (req, res) => {
    const rooms = await storage.getServiceRooms(userId(req));
    res.json(rooms);
  });

  app.post("/api/service-rooms", requireAuth, requireProOrBusinessFeature("/rooms"), async (req, res) => {
    try {
      const input = insertServiceRoomSchema.parse(req.body);
      const room = await storage.createServiceRoom(userId(req), input);
      await auditLog(req, "create", "service_room", String(room.id), { name: room.name });
      res.status(201).json(room);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put("/api/service-rooms/:id", requireAuth, requireProOrBusinessFeature("/rooms"), async (req, res) => {
    try {
      const input = insertServiceRoomSchema.partial().parse(req.body);
      const room = await storage.updateServiceRoom(Number(req.params.id), userId(req), input);
      if (!room) return res.status(404).json({ message: "Room not found" });
      await auditLog(req, "update", "service_room", String(room.id), { name: room.name });
      res.json(room);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/service-rooms/:id", requireAuth, requireProOrBusinessFeature("/rooms"), async (req, res, next) => {
    try {
      const existing = await storage.getServiceRooms(userId(req)).then(list => list.find(r => r.id === Number(req.params.id)));
      await storage.deleteServiceRoom(Number(req.params.id), userId(req));
      await auditLog(req, "delete", "service_room", String(req.params.id), { name: existing?.name });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ── Appointments ──────────────────────────────────────────────────────────

  app.get("/api/appointments", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    const { date, staffId, status } = req.query as Record<string, string>;
    const appts = await storage.getAppointments(userId(req), {
      date: date || undefined,
      staffId: staffId ? Number(staffId) : undefined,
      status: status || undefined,
    });
    res.json(appts);
  });

  app.get("/api/appointments/:id", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    const appt = await storage.getAppointment(Number(req.params.id), userId(req));
    if (!appt) return res.status(404).json({ message: "Appointment not found" });
    res.json(appt);
  });

  app.post("/api/appointments", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    try {
      const input = insertAppointmentSchema.parse(req.body);
      const appt = await storage.createAppointment(userId(req), input);
      await auditLog(req, "create", "appointment", String(appt.id), { title: appt.title, customerId: appt.customerId });
      res.status(201).json(appt);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put("/api/appointments/:id", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    try {
      const input = insertAppointmentSchema.partial().parse(req.body);
      const appt = await storage.updateAppointment(Number(req.params.id), userId(req), input);
      if (!appt) return res.status(404).json({ message: "Appointment not found" });
      await auditLog(req, "update", "appointment", String(appt.id), { title: appt.title, customerId: appt.customerId });
      res.json(appt);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/appointments/:id", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    const existing = await storage.getAppointment(Number(req.params.id), userId(req));
    await storage.deleteAppointment(Number(req.params.id), userId(req));
    await auditLog(req, "delete", "appointment", String(req.params.id), { title: existing?.title, customerId: existing?.customerId });
    res.status(204).end();
  });

  // ── Membership Plans ──────────────────────────────────────────────────────

  app.get("/api/membership-plans", requireAuth, requireProOrBusinessFeature("/memberships"), async (req, res) => {
    const plans = await storage.getMembershipPlans(userId(req));
    res.json(plans);
  });

  app.post("/api/membership-plans", requireAuth, requireProOrBusinessFeature("/memberships"), requireManagerOrAbove, async (req, res) => {
    try {
      const input = insertMembershipPlanSchema.parse(req.body);
      const plan = await storage.createMembershipPlan(userId(req), input);
      await auditLog(req, "create", "membership_plan", String(plan.id), { name: plan.name, price: plan.price });
      res.status(201).json(plan);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put("/api/membership-plans/:id", requireAuth, requireProOrBusinessFeature("/memberships"), requireManagerOrAbove, async (req, res) => {
    try {
      const input = insertMembershipPlanSchema.partial().parse(req.body);
      const plan = await storage.updateMembershipPlan(Number(req.params.id), userId(req), input);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      await auditLog(req, "update", "membership_plan", String(plan.id), { name: plan.name, price: plan.price });
      res.json(plan);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/membership-plans/:id", requireAuth, requireProOrBusinessFeature("/memberships"), requireManagerOrAbove, async (req, res) => {
    const existing = await storage.getMembershipPlans(userId(req)).then(list => list.find(p => p.id === Number(req.params.id)));
    await storage.deleteMembershipPlan(Number(req.params.id), userId(req));
    await auditLog(req, "delete", "membership_plan", String(req.params.id), { name: existing?.name });
    res.status(204).end();
  });

  // ── Memberships ───────────────────────────────────────────────────────────

  app.get("/api/memberships", requireAuth, requireProOrBusinessFeature("/memberships"), async (req, res) => {
    const list = await storage.getMemberships(userId(req));
    res.json(list);
  });

  app.get("/api/memberships/:id", requireAuth, requireProOrBusinessFeature("/memberships"), async (req, res) => {
    const m = await storage.getMembership(Number(req.params.id), userId(req));
    if (!m) return res.status(404).json({ message: "Membership not found" });
    res.json(m);
  });

  app.post("/api/memberships", requireAuth, requireProOrBusinessFeature("/memberships"), async (req, res) => {
    try {
      const input = insertMembershipSchema.parse(req.body);
      const m = await storage.createMembership(userId(req), input);
      await auditLog(req, "create", "membership", String(m.id), { customerId: m.customerId, planId: m.planId, status: m.status });
      res.status(201).json(m);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put("/api/memberships/:id", requireAuth, requireProOrBusinessFeature("/memberships"), async (req, res) => {
    try {
      const input = insertMembershipSchema.partial().parse(req.body);
      const m = await storage.updateMembership(Number(req.params.id), userId(req), input);
      if (!m) return res.status(404).json({ message: "Membership not found" });
      await auditLog(req, "update", "membership", String(m.id), { status: m.status, planId: m.planId });
      res.json(m);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/memberships/:id", requireAuth, requireProOrBusinessFeature("/memberships"), requireManagerOrAbove, async (req, res) => {
    const existing = await storage.getMembership(Number(req.params.id), userId(req));
    await storage.deleteMembership(Number(req.params.id), userId(req));
    await auditLog(req, "delete", "membership", String(req.params.id), { customerId: existing?.customerId, planId: existing?.planId });
    res.status(204).end();
  });

  app.post("/api/memberships/:id/check-in", requireAuth, requireProOrBusinessFeature("/memberships"), async (req, res) => {
    try {
      const m = await storage.getMembership(Number(req.params.id), userId(req));
      if (!m) return res.status(404).json({ message: "Membership not found" });
      if (m.status !== "active") return res.status(400).json({ message: "Membership is not active" });
      const input = insertMembershipCheckInSchema.parse({ membershipId: m.id, customerId: m.customerId, ...req.body });
      const checkIn = await storage.checkInMember(userId(req), input);
      res.status(201).json(checkIn);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.get("/api/memberships/:id/check-ins", requireAuth, requirePro, async (req, res) => {
    const checkIns = await storage.getCheckIns(Number(req.params.id), userId(req));
    res.json(checkIns);
  });

  // ── Ingredients ───────────────────────────────────────────────────────────

  app.get("/api/ingredients", requireAuth, async (req, res) => {
    const list = await storage.getIngredients(userId(req));
    res.json(list);
  });

  app.post("/api/ingredients", requireAuth, requireManagerOrAbove, async (req, res) => {
    try {
      const input = insertIngredientSchema.parse(req.body);
      const created = await storage.createIngredient(userId(req), input);
      await auditLog(req, "create", "ingredient", String(created.id), { name: created.name });
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.put("/api/ingredients/:id", requireAuth, requireManagerOrAbove, async (req, res) => {
    try {
      const input = insertIngredientSchema.partial().parse(req.body);
      const updated = await storage.updateIngredient(Number(req.params.id), userId(req), input);
      if (!updated) return res.status(404).json({ message: "Ingredient not found" });
      await auditLog(req, "update", "ingredient", String(updated.id), { name: updated.name });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/ingredients/:id", requireAuth, requireManagerOrAbove, async (req, res) => {
    const existing = await storage.getIngredients(userId(req)).then(list => list.find(i => i.id === Number(req.params.id)));
    await storage.deleteIngredient(Number(req.params.id), userId(req));
    await auditLog(req, "delete", "ingredient", String(req.params.id), { name: existing?.name });
    res.status(204).end();
  });

  app.post("/api/ingredients/:id/stock", requireAuth, requireManagerOrAbove, async (req, res) => {
    const delta = Number(req.body?.delta);
    if (!Number.isFinite(delta)) return res.status(400).json({ message: "delta must be a number" });
    const updated = await storage.adjustIngredientStock(Number(req.params.id), userId(req), delta);
    if (!updated) return res.status(404).json({ message: "Ingredient not found" });
    res.json(updated);
  });

  // ── Product Recipes ───────────────────────────────────────────────────────

  app.get("/api/products/:id/recipe", requireAuth, async (req, res) => {
    const items = await storage.getRecipeForProduct(Number(req.params.id), userId(req));
    res.json(items);
  });

  app.put("/api/products/:id/recipe", requireAuth, requireManagerOrAbove, async (req, res) => {
    try {
      const schema = z.object({
        items: z.array(z.object({
          ingredientId: z.coerce.number(),
          quantity: z.coerce.string(),
        })),
      });
      const input = schema.parse(req.body);
      const items = input.items.map(i => ({ ingredientId: i.ingredientId, quantity: i.quantity }));
      await storage.setRecipeForProduct(Number(req.params.id), userId(req), items);
      const result = await storage.getRecipeForProduct(Number(req.params.id), userId(req));
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  // ── WiFi Vouchers ─────────────────────────────────────────────────────────

  app.get("/api/wifi-vouchers", requireAuth, async (req, res) => {
    const list = await storage.getWifiVouchers(userId(req));
    res.json(list);
  });

  app.post("/api/wifi-vouchers", requireAuth, async (req, res) => {
    try {
      const input = insertWifiVoucherSchema.parse(req.body);
      const created = await storage.createWifiVoucher(userId(req), input);
      await auditLog(req, "create", "wifi_voucher", String(created.id), { code: created.code });
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.post("/api/wifi-vouchers/redeem", requireAuth, async (req, res) => {
    const code = String(req.body?.code || "").trim();
    if (!code) return res.status(400).json({ message: "code is required" });
    const v = await storage.redeemWifiVoucher(code, userId(req));
    if (!v) return res.status(404).json({ message: "Voucher not found" });
    await auditLog(req, "redeem", "wifi_voucher", String(v.id), { code: v.code });
    res.json(v);
  });

  // ── Payroll (Pro) ─────────────────────────────────────────────────────────

  app.get("/api/payroll/periods", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const list = await storage.getPayrollPeriods(userId(req));
    res.json(list);
  });

  app.post("/api/payroll/periods", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    try {
      const input = insertPayrollPeriodSchema.parse(req.body);
      const period = await storage.createPayrollPeriod(userId(req), input);
      await auditLog(req, "create", "payroll_period", String(period.id), { name: period.name });
      res.status(201).json(period);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.get("/api/payroll/periods/:id", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const period = await storage.getPayrollPeriod(Number(req.params.id), userId(req));
    if (!period) return res.status(404).json({ message: "Period not found" });
    res.json(period);
  });

  app.get("/api/payroll/periods/:id/entries", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const entries = await storage.getPayrollEntries(Number(req.params.id), userId(req));
    res.json(entries);
  });

  app.put("/api/payroll/entries/:id", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    try {
      const input = updatePayrollEntrySchema.parse(req.body);
      const updated = await storage.updatePayrollEntry(Number(req.params.id), userId(req), input);
      if (!updated) return res.status(404).json({ message: "Entry not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.post("/api/payroll/periods/:id/finalize", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const updated = await storage.finalizePayrollPeriod(Number(req.params.id), userId(req));
    if (!updated) return res.status(404).json({ message: "Period not found" });
    await auditLog(req, "finalize", "payroll_period", String(updated.id), { name: updated.name });
    res.json(updated);
  });

  app.post("/api/payroll/periods/:id/pay", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const updated = await storage.markPayrollPeriodPaid(Number(req.params.id), userId(req));
    if (!updated) return res.status(404).json({ message: "Period not found" });
    await auditLog(req, "pay", "payroll_period", String(updated.id), { name: updated.name });
    res.json(updated);
  });

  app.delete("/api/payroll/periods/:id", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const existing = await storage.getPayrollPeriod(Number(req.params.id), userId(req));
    await storage.deletePayrollPeriod(Number(req.params.id), userId(req));
    await auditLog(req, "delete", "payroll_period", String(req.params.id), { name: existing?.name });
    res.status(204).end();
  });

  app.put("/api/users/:id/wage", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    try {
      const input = updateUserWageSchema.parse(req.body);
      const updated = await storage.updateUserWage(String(req.params.id), userId(req), {
        wageType: input.wageType,
        wageRate: input.wageRate,
        commissionPercent: input.commissionPercent,
      });
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  return httpServer;
}
