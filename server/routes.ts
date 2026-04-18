import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage, invalidateTenantCache } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { registerAdminRoutes } from "./admin-routes";
import { registerAiRoutes } from "./ai-routes";
import { registerSubscriptionRoutes } from "./subscription-routes";
import { createBranch, getBranches, createTenant, createAuditLog } from "./admin-storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
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
} from "@shared/schema";

function userId(req: Request): string {
  if (!req.user) throw new Error("userId() called on unauthenticated request");
  return (req.user as any).id;
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

  // ── Products ──────────────────────────────────────────────────────────────

  app.get(api.products.list.path, requireAuth, async (req, res) => {
    const cacheKey = productsCacheKey(userId(req));
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);
    const products = await storage.getProducts(userId(req));
    cache.set(cacheKey, products, TTL.PRODUCTS);
    res.json(products);
  });

  app.get(api.products.get.path, requireAuth, async (req, res) => {
    const product = await storage.getProduct(Number(req.params.id), userId(req));
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
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
      const product = await storage.createProduct(userId(req), input);
      cache.del(productsCacheKey(userId(req)));
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

  // ── Pending Orders ────────────────────────────────────────────────────────

  app.get(api.pendingOrders.list.path, requireAuth, async (req, res) => {
    const orders = await storage.getPendingOrders(userId(req));
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
      const order = await storage.createPendingOrder(userId(req), input);

      // When a POS order is finalized as paid, also record it as a sale so it
      // immediately appears in Dashboard, Analytics, and Sales History.
      if (input.status === "paid") {
        try {
          if (input.discountCode) {
            const dc = await storage.getDiscountCodeByCode(input.discountCode, userId(req));
            if (dc) await storage.incrementDiscountCodeUsage(dc.id);
          }
          const sale = await storage.createSale(userId(req), {
            items: input.items,
            subtotal: input.subtotal,
            tax: input.tax,
            discount: input.discount,
            discountCode: input.discountCode,
            loyaltyDiscount: input.loyaltyDiscount,
            total: input.total,
            paymentMethod: input.paymentMethod,
            paymentAmount: input.paymentAmount,
            changeAmount: input.changeAmount,
            customerId: input.customerId,
            tableId: input.tableId,
            notes: input.notes,
            branchId: input.branchId,
          });
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

      res.status(201).json(order);
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
      limit: Math.min(Number(limit) || 200, 1000),
      offset: Math.max(Number(offset) || 0, 0),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    res.json(salesList);
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

      const sale = await storage.createSale(userId(req), input);
      await auditLog(req, "create", "sale", String(sale.id), {
        total: sale.total,
        itemCount: Array.isArray(sale.items) ? sale.items.length : 0,
        paymentMethod: sale.paymentMethod,
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
        currency: "₱",
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
          let tenantId = user?.tenantId as string | null;
          const branchName = (input.storeName as string | undefined) || settings.storeName || "Main Branch";

          // If the user has no tenant yet (email/password owners), create one now
          if (!tenantId) {
            const newTenant = await createTenant(branchName);
            tenantId = newTenant.id;

            // Link the user to this new tenant
            await db.update(users).set({ tenantId } as any).where(eq(users.id, userId(req)));
            invalidateTenantCache(userId(req));

            // Re-issue the auth cookie so the new tenantId is in the JWT
            const updatedUser = { ...user, tenantId };
            try { setAuthCookie(res, updatedUser); } catch (cookieErr) {
              console.error("[onboarding] Failed to re-issue auth cookie:", cookieErr);
            }
          }

          // Create main branch if one doesn't already exist
          const existingBranches = await getBranches(tenantId);
          const hasMain = existingBranches.some((b: any) => b.isMain);
          if (!hasMain) {
            await createBranch(tenantId, {
              name: branchName,
              address: (input.address as string | undefined) || settings.address || null,
              phone: (input.phone as string | undefined) || settings.phone || null,
              isMain: true,
              isActive: true,
            });
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
    const list = await storage.getCustomers(userId(req));
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
    const list = await storage.getExpenses(userId(req));
    res.json(list);
  });

  app.post("/api/expenses", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertExpenseSchema.extend({ amount: z.coerce.string() }).parse(req.body);
      const expense = await storage.createExpense(userId(req), input);
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

  app.delete("/api/expenses/:id", requireAuth, requirePro, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getExpenses(userId(req)).then(list => list.find(e => e.id === id));
    await storage.deleteExpense(id, userId(req));
    await auditLog(req, "delete", "expense", String(id), { description: existing?.description, amount: existing?.amount });
    res.status(204).end();
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
      const input = insertRefundSchema.extend({ amount: z.coerce.string() }).parse(req.body);
      const refund = await storage.createRefund(userId(req), input);
      await auditLog(req, "create", "refund", String(refund.id), { saleId: refund.saleId, amount: refund.amount, reason: refund.reason });
      res.status(201).json(refund);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
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
      await storage.deleteSupplier(Number(req.params.id), userId(req));
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
      const { delta } = z.object({ delta: z.number() }).parse(req.body);
      const customer = await storage.adjustLoyaltyPoints(Number(req.params.id), delta, userId(req));
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      res.json(customer);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
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
      res.json(member);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/service-staff/:id", requireAuth, requireProOrBusinessFeature("/staff"), async (req, res, next) => {
    try {
      await storage.deleteServiceStaff(Number(req.params.id), userId(req));
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
      res.json(room);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/service-rooms/:id", requireAuth, requireProOrBusinessFeature("/rooms"), async (req, res, next) => {
    try {
      await storage.deleteServiceRoom(Number(req.params.id), userId(req));
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
      res.json(appt);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/appointments/:id", requireAuth, requireProOrBusinessFeature("/appointments"), async (req, res) => {
    await storage.deleteAppointment(Number(req.params.id), userId(req));
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
      res.json(plan);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/membership-plans/:id", requireAuth, requireProOrBusinessFeature("/memberships"), requireManagerOrAbove, async (req, res) => {
    await storage.deleteMembershipPlan(Number(req.params.id), userId(req));
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
      res.json(m);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      throw err;
    }
  });

  app.delete("/api/memberships/:id", requireAuth, requireProOrBusinessFeature("/memberships"), requireManagerOrAbove, async (req, res) => {
    await storage.deleteMembership(Number(req.params.id), userId(req));
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

  return httpServer;
}
