import type { Express } from "express";
import { z } from "zod";
import {
  requireAuth, requireOwner, requireAdminOrAbove, requireManagerOrAbove,
  requireTenant, getAuthUser, getSubscription, isProSubscription
} from "./middleware";
import {
  getTenant, updateTenant, createTenant,
  getBranches, getBranch, createBranch, updateBranch, deleteBranch, setMainBranch,
  getTenantUsers, createStaffUser, updateUserRole, deleteUser, getUserById,
  getUserBranches, assignBranch, removeBranch, bulkAssignBranches,
  getAuditLogs, createAuditLog,
  getBranchAnalytics,
  getUserByEmail, verifyPassword, hashPassword,
  banUser, unbanUser,
  getRolePermissions, upsertRolePermission, getRolePermissionForRole,
} from "./admin-storage";
import { bannedUserIds } from "./auth";
import { bruteForceGuard, recordFailedAttempt, recordSuccessfulLogin } from "./brute-force";
import { invalidateTenantCache, storage } from "./storage";
import { db } from "./db";
import {
  users, sales, products, tables, productSizes, productModifiers,
  productRecipes, purchaseOrderItems, pendingOrders, userBranches,
} from "@shared/schema";
import { eq, and, isNull, isNotNull, inArray, sql, desc } from "drizzle-orm";
import { signToken, AUTH_COOKIE, AUTH_COOKIE_OPTIONS, getBaseUrl, type TokenUser } from "./auth";
import { getSeedTemplate, SEED_TEMPLATES } from "./branch-seeds";

export function registerAdminRoutes(app: Express) {

  // ─── Local Login (email/password for staff) ───────────────────────────────

  app.post("/api/auth/local-login", bruteForceGuard, async (req, res, next) => {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";
    try {
      const { email, password } = z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }).parse(req.body);

      const user = await getUserByEmail(email);
      if (!user || !user.passwordHash) {
        recordFailedAttempt(ip);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        recordFailedAttempt(ip);
        return res.status(401).json({ message: "Invalid credentials" });
      }

      recordSuccessfulLogin(ip);
      const token = signToken({ id: user.id, name: user.name, email: user.email, avatar: user.avatar, provider: user.provider, tenantId: user.tenantId, role: user.role ?? "owner", activeBranchId: (user as any).activeBranchId ?? null });
      res.cookie(AUTH_COOKIE, token, { ...AUTH_COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 });
      res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId } });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      next(err);
    }
  });

  // ─── Tenant ───────────────────────────────────────────────────────────────

  app.get("/api/admin/tenant", requireAuth, requireTenant, async (req, res, next) => {
    try {
      const { tenantId } = getAuthUser(req);
      const tenant = await getTenant(tenantId!);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });
      res.json(tenant);
    } catch (err) { next(err); }
  });

  app.put("/api/admin/tenant", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
      const tenant = await updateTenant(user.tenantId!, name);
      await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "update", entity: "tenant", entityId: user.tenantId!, metadata: { name } });
      res.json(tenant);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // ─── Branches ─────────────────────────────────────────────────────────────

  app.get("/api/admin/branches", requireAuth, requireTenant, requireAdminOrAbove, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      let branchList = await getBranches(user.tenantId!);
      // Admins only see their assigned branches
      if (user.role === "admin") {
        const assigned = await getUserBranches(user.id);
        branchList = branchList.filter(b => assigned.includes(b.id));
      }
      res.json(branchList);
    } catch (err) { next(err); }
  });

  app.post("/api/admin/branches", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const sub = await getSubscription(user.tenantId!);
      if (!isProSubscription(sub)) {
        const existingBranches = await getBranches(user.tenantId!);
        if (existingBranches.length >= 1) {
          return res.status(403).json({ message: "The Free plan includes 1 branch. Upgrade to Pro when you are ready to manage multiple locations.", code: "BRANCH_LIMIT_REACHED" });
        }
      }
      const input = z.object({
        name: z.string().min(1),
        address: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        email: z.string().email().optional().nullable(),
        website: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        color: z.string().optional().nullable(),
        timezone: z.string().optional().nullable(),
        taxRate: z.string().optional().nullable(),
        openingHours: z.record(z.object({ open: z.string(), close: z.string(), closed: z.boolean() })).optional().nullable(),
        isActive: z.boolean().optional().default(true),
        businessType: z.string().optional().nullable(),
        businessSubType: z.string().optional().nullable(),
      }).parse(req.body);
      const branch = await createBranch(user.tenantId!, input as any);
      await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "create", entity: "branch", entityId: String(branch.id), metadata: { name: branch.name } });

      // If this is the owner's first branch, auto-assign them to it and set it active
      const allBranches = await getBranches(user.tenantId!);
      let newToken: string | undefined;
      if (allBranches.length === 1) {
        await assignBranch(user.id, branch.id);
        const dbUser = await getUserById(user.id);
        if (dbUser) {
          newToken = signToken({ id: dbUser.id, name: dbUser.name, email: dbUser.email, avatar: dbUser.avatar, provider: dbUser.provider, tenantId: dbUser.tenantId, role: dbUser.role ?? "owner", activeBranchId: branch.id });
          res.cookie(AUTH_COOKIE, newToken, { ...AUTH_COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 });
        }
      }

      res.status(201).json({ ...branch, autoSelected: allBranches.length === 1 });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // ─── Branch onboarding: preview & seed default catalog ───────────────────
  // GET returns the matching template (so the UI can ask "want a sample
  // coffee menu?" before committing). POST actually inserts the products
  // (and tables, where applicable) for the branch.

  app.get("/api/admin/branches/:id/seed-template", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      const branch = await getBranch(id, user.tenantId!);
      if (!branch) return res.status(404).json({ message: "Branch not found" });
      const template = getSeedTemplate(branch.businessType, branch.businessSubType);
      if (!template) return res.json({ available: false });
      res.json({
        available: true,
        label: template.label,
        description: template.description,
        itemCount: template.items.length,
        tableCount: template.tables?.length ?? 0,
      });
    } catch (err) { next(err); }
  });

  app.post("/api/admin/branches/:id/seed", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      const branch = await getBranch(id, user.tenantId!);
      if (!branch) return res.status(404).json({ message: "Branch not found" });

      // Allow the client to override which template to use (e.g. owner picks
      // "cafe" defaults for an "other F&B" branch). Defaults to the auto-match.
      const body = z.object({
        templateKey: z.string().optional(),
      }).parse(req.body ?? {});

      const template = body.templateKey
        ? SEED_TEMPLATES[body.templateKey] ?? null
        : getSeedTemplate(branch.businessType, branch.businessSubType);

      if (!template) {
        return res.status(400).json({ message: "No seed template available for this business type." });
      }

      let productsCreated = 0;
      for (const item of template.items) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await storage.createProduct(user.id, {
            name: item.name,
            price: item.price,
            category: item.category,
            branchId: branch.id,
          } as any);
          productsCreated++;
        } catch (err) {
          console.error("[branch-seed] failed to create product", item.name, err);
        }
      }

      let tablesCreated = 0;
      if (template.tables?.length) {
        for (const t of template.tables) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await storage.createTable(user.id, {
              name: t.name,
              seats: t.seats,
              branchId: branch.id,
            } as any);
            tablesCreated++;
          } catch (err) {
            console.error("[branch-seed] failed to create table", t.name, err);
          }
        }
      }

      await createAuditLog({
        tenantId: user.tenantId!,
        userId: user.id,
        action: "seed",
        entity: "branch",
        entityId: String(branch.id),
        metadata: { template: template.label, productsCreated, tablesCreated },
      });

      res.json({ ok: true, productsCreated, tablesCreated, template: template.label });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // ─── Reset branch: wipe all products & tables for the branch, then
  // optionally re-seed with the starter template. Useful for clearing demo
  // data and starting from a clean catalog.
  app.post("/api/admin/branches/:id/reset", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      const branch = await getBranch(id, user.tenantId!);
      if (!branch) return res.status(404).json({ message: "Branch not found" });

      const body = z.object({
        reseed: z.boolean().optional().default(false),
        templateKey: z.string().optional(),
      }).parse(req.body ?? {});

      // Find every product and table currently scoped to this branch (across
      // every user in the tenant — staff-created items count too).
      const tenantUserIds = (await getTenantUsers(user.tenantId!)).map(u => u.id);
      if (tenantUserIds.length === 0) {
        return res.status(400).json({ message: "No tenant users found" });
      }

      const branchProducts = await db.select({ id: products.id })
        .from(products)
        .where(and(eq(products.branchId, branch.id), inArray(products.userId, tenantUserIds)));
      const branchTables = await db.select({ id: tables.id })
        .from(tables)
        .where(and(eq(tables.branchId, branch.id), inArray(tables.userId, tenantUserIds)));

      const productIds = branchProducts.map(p => p.id);
      const tableIds = branchTables.map(t => t.id);

      // Wipe everything inside a transaction so a failure leaves the branch in
      // its previous state instead of half-deleted.
      await db.transaction(async (tx) => {
        if (productIds.length) {
          // Children that reference products via FK must go first.
          await tx.delete(productRecipes).where(inArray(productRecipes.productId, productIds));
          await tx.delete(productSizes).where(inArray(productSizes.productId, productIds));
          await tx.delete(productModifiers).where(inArray(productModifiers.productId, productIds));
          // purchase_order_items keeps the historical row but unlinks the deleted product.
          await tx.update(purchaseOrderItems)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .set({ productId: null } as any)
            .where(inArray(purchaseOrderItems.productId, productIds));
          await tx.delete(products).where(inArray(products.id, productIds));
        }
        if (tableIds.length) {
          // Detach historical sales/pending orders from the deleted tables (FKs are nullable).
          await tx.update(sales)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .set({ tableId: null } as any)
            .where(inArray(sales.tableId, tableIds));
          await tx.update(pendingOrders)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .set({ tableId: null } as any)
            .where(inArray(pendingOrders.tableId, tableIds));
          await tx.delete(tables).where(inArray(tables.id, tableIds));
        }
      });

      let productsCreated = 0;
      let tablesCreated = 0;
      let templateLabel: string | null = null;

      if (body.reseed) {
        const template = body.templateKey
          ? SEED_TEMPLATES[body.templateKey] ?? null
          : getSeedTemplate(branch.businessType, branch.businessSubType);

        if (template) {
          templateLabel = template.label;
          for (const item of template.items) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await storage.createProduct(user.id, {
                name: item.name,
                price: item.price,
                category: item.category,
                branchId: branch.id,
              } as any);
              productsCreated++;
            } catch (err) {
              console.error("[branch-reset] failed to create product", item.name, err);
            }
          }
          if (template.tables?.length) {
            for (const t of template.tables) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await storage.createTable(user.id, {
                  name: t.name,
                  seats: t.seats,
                  branchId: branch.id,
                } as any);
                tablesCreated++;
              } catch (err) {
                console.error("[branch-reset] failed to create table", t.name, err);
              }
            }
          }
        }
      }

      await createAuditLog({
        tenantId: user.tenantId!,
        userId: user.id,
        action: "reset",
        entity: "branch",
        entityId: String(branch.id),
        metadata: {
          productsDeleted: productIds.length,
          tablesDeleted: tableIds.length,
          reseed: body.reseed,
          template: templateLabel,
          productsCreated,
          tablesCreated,
        },
      });

      res.json({
        ok: true,
        productsDeleted: productIds.length,
        tablesDeleted: tableIds.length,
        productsCreated,
        tablesCreated,
        template: templateLabel,
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.put("/api/admin/branches/:id", requireAuth, requireTenant, requireAdminOrAbove, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      if (user.role === "admin") {
        const assigned = await getUserBranches(user.id);
        if (!assigned.includes(id)) return res.status(403).json({ message: "You are not assigned to this branch" });
      }
      const input = z.object({
        name: z.string().min(1).optional(),
        address: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        email: z.string().email().optional().nullable(),
        website: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        color: z.string().optional().nullable(),
        timezone: z.string().optional().nullable(),
        taxRate: z.string().optional().nullable(),
        openingHours: z.record(z.object({
          open: z.string(),
          close: z.string(),
          closed: z.boolean(),
        })).optional().nullable(),
        isActive: z.boolean().optional(),
        businessType: z.string().optional().nullable(),
        businessSubType: z.string().optional().nullable(),
      }).parse(req.body);
      const branch = await updateBranch(id, user.tenantId!, input as any);
      if (!branch) return res.status(404).json({ message: "Branch not found" });
      await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "update", entity: "branch", entityId: String(id), metadata: { name: input.name } });
      res.json(branch);
    } catch (err: unknown) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // ─── Branch stats ─────────────────────────────────────────────────────────
  app.get("/api/admin/branches/:id/stats", requireAuth, requireTenant, requireAdminOrAbove, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      const branch = await getBranch(id, user.tenantId!);
      if (!branch) return res.status(404).json({ message: "Branch not found" });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();

      const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

      const [allTimeRow, todayRow, monthRow, _staffCount, topProductRows, last7Days] = await Promise.all([
        db.select({
          revenue: sql<string>`COALESCE(SUM(CAST(${sales.total} AS REAL)), 0)`,
          orders: sql<string>`COUNT(*)`,
        }).from(sales).where(and(eq(sales.branchId, id), isNull(sales.deletedAt))),

        db.select({
          revenue: sql<string>`COALESCE(SUM(CAST(${sales.total} AS REAL)), 0)`,
          orders: sql<string>`COUNT(*)`,
        }).from(sales).where(and(eq(sales.branchId, id), isNull(sales.deletedAt), sql`${sales.createdAt} >= ${todayStr}`)),

        db.select({
          revenue: sql<string>`COALESCE(SUM(CAST(${sales.total} AS REAL)), 0)`,
          orders: sql<string>`COUNT(*)`,
        }).from(sales).where(and(eq(sales.branchId, id), isNull(sales.deletedAt), sql`${sales.createdAt} >= ${thisMonth}`)),

        db.select({ count: sql<string>`COUNT(DISTINCT user_id)` })
          .from(userBranches)
          .where(eq(userBranches.branchId, id)),

        db.execute(sql`
          SELECT items.product_name, CAST(SUM(items.qty) AS INTEGER) as total_qty
          FROM sales s, LATERAL jsonb_array_elements(s.items) AS items
          WHERE s.branch_id = ${id} AND s.deleted_at IS NULL
          GROUP BY items.product_name
          ORDER BY total_qty DESC
          LIMIT 5
        `),

        db.execute(sql`
          SELECT
            DATE_TRUNC('day', CAST(created_at AS TIMESTAMP)) as day,
            COALESCE(SUM(CAST(total AS REAL)), 0) as revenue,
            COUNT(*) as orders
          FROM sales
          WHERE branch_id = ${id}
            AND deleted_at IS NULL
            AND CAST(created_at AS TIMESTAMP) >= NOW() - INTERVAL '7 days'
          GROUP BY day
          ORDER BY day ASC
        `),
      ]);

      const allUsers = await getTenantUsers(user.tenantId!);
      const branchStaff = allUsers.filter(u => u.branches.includes(id) || u.role === "owner");

      res.json({
        allTime: {
          revenue: Number(allTimeRow[0]?.revenue) || 0,
          orders: Number(allTimeRow[0]?.orders) || 0,
        },
        today: {
          revenue: Number(todayRow[0]?.revenue) || 0,
          orders: Number(todayRow[0]?.orders) || 0,
        },
        thisMonth: {
          revenue: Number(monthRow[0]?.revenue) || 0,
          orders: Number(monthRow[0]?.orders) || 0,
        },
        staffCount: branchStaff.length,
        topProducts: (topProductRows.rows as any[]).map(r => ({
          name: r.product_name,
          qty: Number(r.total_qty),
        })),
        last7Days: (last7Days.rows as any[]).map(r => ({
          day: r.day,
          revenue: Number(r.revenue),
          orders: Number(r.orders),
        })),
      });
    } catch (err: unknown) { next(err); }
  });

  // ─── Duplicate branch (copy settings only, not data) ──────────────────────
  app.post("/api/admin/branches/:id/duplicate", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      const source = await getBranch(id, user.tenantId!);
      if (!source) return res.status(404).json({ message: "Branch not found" });

      const sub = await getSubscription(user.tenantId!);
      if (!isProSubscription(sub)) {
        const existingBranches = await getBranches(user.tenantId!);
        if (existingBranches.length >= 1) {
          return res.status(403).json({ message: "Upgrade to Pro to duplicate branches.", code: "BRANCH_LIMIT_REACHED" });
        }
      }

      const newBranch = await createBranch(user.tenantId!, {
        name: `${source.name} (Copy)`,
        address: source.address,
        phone: source.phone,
        email: (source as any).email,
        website: (source as any).website,
        description: (source as any).description,
        color: (source as any).color,
        timezone: (source as any).timezone,
        taxRate: (source as any).taxRate,
        openingHours: (source as any).openingHours,
        isActive: false,
        businessType: source.businessType,
        businessSubType: source.businessSubType,
      });

      await createAuditLog({
        tenantId: user.tenantId!,
        userId: user.id,
        action: "duplicate",
        entity: "branch",
        entityId: String(newBranch.id),
        metadata: { sourceId: id, sourceName: source.name },
      });

      res.status(201).json(newBranch);
    } catch (err) { next(err); }
  });

  app.delete("/api/admin/branches/:id", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      await deleteBranch(id, user.tenantId!);
      await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "delete", entity: "branch", entityId: String(id) });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  app.patch("/api/admin/branches/:id/set-main", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      const branch = await setMainBranch(id, user.tenantId!);
      if (!branch) return res.status(404).json({ message: "Branch not found" });
      await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "set_main", entity: "branch", entityId: String(id) });
      res.json(branch);
    } catch (err) { next(err); }
  });

  // ─── Users ────────────────────────────────────────────────────────────────

  app.get("/api/admin/users", requireAuth, requireTenant, requireAdminOrAbove, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const tenantUsers = await getTenantUsers(user.tenantId!);
      const isOwner = user.role === "owner";
      res.json(tenantUsers.map(u => {
        // Strip security/recovery tokens from every response.
        const { passwordHash: _ph, resetToken: _rt, resetTokenExpires: _rte, ...safe } = u as any;
        // Only owners can see compensation details — admins/managers should not
        // be able to see what their peers are paid.
        if (!isOwner && u.id !== user.id) {
          return { ...safe, wageType: undefined, wageRate: undefined, commissionPercent: undefined };
        }
        return safe;
      }));
    } catch (err) { next(err); }
  });

  app.post("/api/admin/users", requireAuth, requireTenant, requireAdminOrAbove, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const sub = await getSubscription(user.tenantId!);
      if (!isProSubscription(sub)) {
        const tenantUsers = await getTenantUsers(user.tenantId!);
        if (tenantUsers.length >= 3) {
          return res.status(403).json({ message: "The Free plan includes the owner plus 2 staff accounts. Upgrade to Pro to add more team members.", code: "STAFF_LIMIT_REACHED" });
        }
      }
      const input = z.object({
        name: z.string().min(1),
        role: z.enum(["manager", "admin", "cashier", "staff"]),
        branchIds: z.array(z.number()).min(1, "Assign at least one branch"),
        pin: z.string().min(4).max(6).regex(/^\d+$/, "PIN must be 4–6 digits").optional(),
      }).parse(req.body);

      // Admins cannot create admins or managers
      if (user.role === "admin" && (input.role === "admin" || input.role === "manager")) {
        return res.status(403).json({ message: "Admins cannot create admin or manager users" });
      }

      const hashedPin = input.pin ? await hashPassword(input.pin) : undefined;

      const newUser = await createStaffUser(user.tenantId!, {
        name: input.name,
        role: input.role as "manager" | "admin" | "cashier" | "staff",
        hashedPin,
      });

      await bulkAssignBranches(newUser.id, input.branchIds);

      await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "create", entity: "user", entityId: newUser.id, metadata: { name: newUser.name, role: newUser.role } });
      res.status(201).json({ ...newUser, staffPin: undefined, branches: input.branchIds });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.put("/api/admin/users/:id", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const targetId = req.params.id as string;
      const input = z.object({
        role: z.enum(["owner", "manager", "admin", "cashier", "staff"]).optional(),
        name: z.string().min(1).optional(),
      }).parse(req.body);

      // Owners cannot change their own role — prevents accidental self-lockout
      // and blocks any privilege-escalation attack that gains owner-level access
      // and then tries to use this endpoint to demote the real owner.
      if (input.role && targetId === user.id) {
        return res.status(403).json({ message: "You cannot change your own role." });
      }

      if (input.role) {
        const updated = await updateUserRole(targetId, user.tenantId!, input.role);
        if (!updated) return res.status(404).json({ message: "User not found" });
        invalidateTenantCache(targetId);
        await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "update_role", entity: "user", entityId: targetId, metadata: { role: input.role } });
      }
      const updated = await getUserById(targetId);
      res.json({ ...updated, passwordHash: undefined });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.delete("/api/admin/users/:id", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const targetId = req.params.id as string;
      if (targetId === user.id) return res.status(400).json({ message: "Cannot delete yourself" });
      const target = await getUserById(targetId);
      if (!target || target.tenantId !== user.tenantId) return res.status(404).json({ message: "User not found" });
      await deleteUser(targetId, user.tenantId!);
      bannedUserIds.delete(targetId);
      await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "delete", entity: "user", entityId: targetId, metadata: { name: target.name } });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  app.patch("/api/admin/users/:id/ban", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const targetId = req.params.id as string;
      if (targetId === user.id) return res.status(400).json({ message: "Cannot revoke your own access" });
      const { banned } = z.object({ banned: z.boolean() }).parse(req.body);
      let updated;
      if (banned) {
        updated = await banUser(targetId, user.tenantId!);
        bannedUserIds.add(targetId);
        await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "ban", entity: "user", entityId: targetId, metadata: {} });
      } else {
        updated = await unbanUser(targetId, user.tenantId!);
        bannedUserIds.delete(targetId);
        await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "unban", entity: "user", entityId: targetId, metadata: {} });
      }
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json({ ok: true, isBanned: updated.isBanned });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // ─── User Branch Assignment ───────────────────────────────────────────────

  app.post("/api/admin/users/:id/branches", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const { branchId } = z.object({ branchId: z.number() }).parse(req.body);
      const branch = await getBranch(branchId, user.tenantId!);
      if (!branch) return res.status(404).json({ message: "Branch not found" });
      await assignBranch(req.params.id as string, branchId);
      await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "assign_branch", entity: "user", entityId: req.params.id as string, metadata: { branchId } });
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.delete("/api/admin/users/:id/branches/:branchId", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      await removeBranch(req.params.id as string, Number(req.params.branchId));
      await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "remove_branch", entity: "user", entityId: req.params.id as string, metadata: { branchId: Number(req.params.branchId) } });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ─── Branch Switch ────────────────────────────────────────────────────────

  app.post("/api/admin/switch-branch", requireAuth, requireTenant, requireAdminOrAbove, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const { branchId } = z.object({ branchId: z.number().nullable() }).parse(req.body);

      if (branchId !== null && user.role === "cashier") {
        const assigned = await getUserBranches(user.id);
        if (!assigned.includes(branchId)) return res.status(403).json({ message: "Not assigned to this branch" });
      }

      const dbUser = await getUserById(user.id);
      if (!dbUser) return res.status(404).json({ message: "User not found" });

      const token = signToken({ id: dbUser.id, name: dbUser.name, email: dbUser.email, avatar: dbUser.avatar, provider: dbUser.provider, tenantId: dbUser.tenantId, role: dbUser.role ?? "owner", activeBranchId: branchId });
      await createAuditLog({
        tenantId: user.tenantId!,
        userId: user.id,
        action: "switch_branch",
        entity: "user",
        entityId: user.id,
        metadata: { branchId },
      });
      res.cookie(AUTH_COOKIE, token, { ...AUTH_COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 });
      res.json({ token, activeBranchId: branchId });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // ─── Sales (manager/owner scope) ─────────────────────────────────────────

  // Manager+ can soft-delete any sale in their tenant
  app.delete("/api/sales/:id", requireAuth, requireTenant, requireManagerOrAbove, async (req, res, next) => {
    try {
      const user = getAuthUser(req);

      // Granular permission check — owners always allowed, others check canDeleteSale
      if (user.role !== "owner") {
        const perm = await getRolePermissionForRole(user.tenantId!, user.role);
        if (perm && perm.canDeleteSale === false) {
          return res.status(403).json({ message: "You don't have permission to delete sales" });
        }
      }

      const saleId = Number(req.params.id);

      // Find the sale belonging to any user in this tenant
      const tenantUsers = await getTenantUsers(user.tenantId!);
      const userIds = tenantUsers.map(u => u.id);

      const [sale] = await db.select().from(sales).where(
        and(eq(sales.id, saleId), inArray(sales.userId, userIds), isNull(sales.deletedAt))
      );

      if (!sale) return res.status(404).json({ message: "Sale not found" });

      await (db.update(sales) as any)
        .set({ deletedAt: new Date().toISOString(), deletedBy: user.id })
        .where(eq(sales.id, saleId));

      await createAuditLog({
        tenantId: user.tenantId!,
        userId: user.id,
        action: "delete_sale",
        entity: "sale",
        entityId: String(saleId),
        metadata: { total: sale.total, receiptNumber: (sale as any).receiptNumber ?? null, orNumber: (sale as any).orNumber ?? null, invoiceNumber: (sale as any).invoiceNumber ?? null, deletedBy: user.name || user.id },
      });

      res.status(204).end();
    } catch (err) { next(err); }
  });

  // Owner can see all deleted sales in their tenant
  app.get("/api/sales/deleted", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const tenantUsers = await getTenantUsers(user.tenantId!);
      const userIds = tenantUsers.map(u => u.id);

      const deletedSales = await db.select().from(sales).where(
        and(inArray(sales.userId, userIds), isNotNull(sales.deletedAt))
      );

      res.json(deletedSales);
    } catch (err) { next(err); }
  });

  app.get("/api/sales/export", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const tenantUsers = await getTenantUsers(user.tenantId!);
      const userIds = tenantUsers.map(u => u.id);
      const rows = await db.select().from(sales).where(and(inArray(sales.userId, userIds), isNull(sales.deletedAt))).orderBy(desc(sales.createdAt));
      const headers = ["id","createdAt","receiptNumber","orNumber","invoiceNumber","subtotal","tax","discount","total","paymentMethod","customerName"];
      const csv = [headers.join(","), ...rows.map((sale) => [
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
      ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="sales-journal-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.send(csv);
    } catch (err) { next(err); }
  });

  // ─── Analytics ────────────────────────────────────────────────────────────

  app.get("/api/admin/analytics", requireAuth, requireTenant, requireAdminOrAbove, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      let branchIds: number[] | undefined;
      if (user.role === "admin") {
        branchIds = await getUserBranches(user.id);
      }
      const analytics = await getBranchAnalytics(user.tenantId!, branchIds);
      res.json(analytics);
    } catch (err) { next(err); }
  });

  // ─── Audit Logs ───────────────────────────────────────────────────────────

  app.get("/api/admin/audit-logs", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const limit = Math.min(Number(req.query.limit) || 200, 1000);
      const { userId: filterUserId, action, entity, startDate, endDate } = req.query as Record<string, string>;
      const logs = await getAuditLogs(user.tenantId!, {
        limit,
        userId: filterUserId || undefined,
        action: action || undefined,
        entity: entity || undefined,
        startDate: startDate || undefined,
        endDate: endDate ? endDate + "T23:59:59.999Z" : undefined,
      });
      res.json(logs);
    } catch (err) { next(err); }
  });

  // ─── Role Permissions ─────────────────────────────────────────────────────

  app.get("/api/admin/permissions", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const perms = await getRolePermissions(user.tenantId!);
      res.json(perms);
    } catch (err) { next(err); }
  });

  app.put("/api/admin/permissions/:role", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const role = req.params.role as "manager" | "cashier";
      if (!["manager", "cashier"].includes(role)) {
        return res.status(400).json({ message: "Invalid role. Only manager and cashier permissions can be configured." });
      }
      const input = z.object({
        maxDiscountPercent: z.number().min(0).max(100).optional(),
        canRefund: z.boolean().optional(),
        canDeleteSale: z.boolean().optional(),
        canVoidOrder: z.boolean().optional(),
      }).parse(req.body);
      const perm = await upsertRolePermission(user.tenantId!, role, input);
      await createAuditLog({
        tenantId: user.tenantId!,
        userId: user.id,
        action: "update_permissions",
        entity: "role_permissions",
        metadata: { role, ...input },
      });
      res.json(perm);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  // Public endpoint — allows POS to read permissions for the current tenant user's role
  app.get("/api/my-permissions", requireAuth, requireTenant, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const { getRolePermissionForRole } = await import("./admin-storage");
      const perm = await getRolePermissionForRole(user.tenantId!, user.role);
      // Owners and managers (without custom rules) get full permissions
      if (!perm) {
        return res.json({
          role: user.role,
          maxDiscountPercent: 100,
          canRefund: true,
          canDeleteSale: true,
          canVoidOrder: true,
        });
      }
      res.json({ ...perm, role: user.role });
    } catch (err) { next(err); }
  });

  // ─── Ensure tenant exists (called after login) ────────────────────────────

  app.post("/api/admin/ensure-tenant", requireAuth, async (req, res, next) => {
    try {
      const user = getAuthUser(req);

      if (user.tenantId) {
        return res.json({ tenantId: user.tenantId, alreadyExists: true });
      }

      // Create a tenant for this user and make them owner
      const tenant = await createTenant(user.name || user.email || "My Business");
      await (db.update(users) as any).set({ tenantId: tenant.id, role: "owner" }).where(eq(users.id, user.id));

      // Fetch updated user and issue new JWT
      const updatedUser = { ...user, tenantId: tenant.id, role: "owner" as const };
      const token = signToken(updatedUser);
      res.cookie("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      await createAuditLog({ tenantId: tenant.id, userId: user.id, action: "create", entity: "tenant", entityId: tenant.id, metadata: { name: tenant.name } });

      res.json({ tenantId: tenant.id, token, alreadyExists: false });
    } catch (err) { next(err); }
  });
}
