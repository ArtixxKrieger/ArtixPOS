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
  getUserByEmail, verifyPassword,
  createInviteToken, redeemInviteToken, getInviteTokens,
  banUser, unbanUser,
  getRolePermissions, upsertRolePermission,
} from "./admin-storage";
import { bannedUserIds } from "./auth";
import { invalidateTenantCache } from "./storage";
import { db } from "./db";
import { users, sales, type UserRole } from "@shared/schema";
import { eq, and, isNull, isNotNull, inArray } from "drizzle-orm";
import { signToken } from "./auth";

export function registerAdminRoutes(app: Express) {

  // ─── Local Login (email/password for staff) ───────────────────────────────

  app.post("/api/auth/local-login", async (req, res, next) => {
    try {
      const { email, password } = z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }).parse(req.body);

      const user = await getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = signToken(user);
      res.cookie("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId } });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      next(err);
    }
  });

  // ─── Invite Tokens ────────────────────────────────────────────────────────

  app.post("/api/admin/invite", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const input = z.object({
        role: z.enum(["manager", "admin", "cashier"]),
        branchIds: z.array(z.number()).optional().default([]),
      }).parse(req.body);

      const invite = await createInviteToken({
        tenantId: user.tenantId!,
        role: input.role,
        branchIds: input.branchIds,
        createdBy: user.id,
      });

      await createAuditLog({
        tenantId: user.tenantId!,
        userId: user.id,
        action: "create_invite",
        entity: "invite_token",
        entityId: String(invite.id),
        metadata: { role: input.role },
      });

      // Return the invite link for the frontend to display
      // Prefer APP_URL (e.g. Vercel production), fall back to localhost for dev
      const baseUrl = process.env.APP_URL || "http://localhost:5000";
      const link = `${baseUrl}/login?invite=${invite.token}`;
      res.json({ token: invite.token, link, expiresAt: invite.expiresAt });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.post("/api/admin/invite/redeem", requireAuth, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
      const result = await redeemInviteToken(token, user.id);
      if (!result.ok) {
        return res.status(400).json({ message: result.message });
      }

      // Fetch updated user and issue new JWT
      const updatedUser = await getUserById(user.id);
      if (!updatedUser) return res.status(404).json({ message: "User not found" });

      const newToken = signToken(updatedUser);
      res.cookie("auth_token", newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.json({ ok: true, token: newToken, role: result.role, tenantId: result.tenantId });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.get("/api/admin/invites", requireAuth, requireTenant, requireOwner, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const invites = await getInviteTokens(user.tenantId!);
      res.json(invites);
    } catch (err) { next(err); }
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
        isActive: z.boolean().optional().default(true),
      }).parse(req.body);
      const branch = await createBranch(user.tenantId!, input as { name: string; address?: string | null; phone?: string | null; isActive?: boolean });
      await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "create", entity: "branch", entityId: String(branch.id), metadata: { name: branch.name } });
      res.status(201).json(branch);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
  });

  app.put("/api/admin/branches/:id", requireAuth, requireTenant, requireAdminOrAbove, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const id = Number(req.params.id);
      // Admins can only update their assigned branches
      if (user.role === "admin") {
        const assigned = await getUserBranches(user.id);
        if (!assigned.includes(id)) return res.status(403).json({ message: "You are not assigned to this branch" });
      }
      const input = z.object({
        name: z.string().min(1).optional(),
        address: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        isActive: z.boolean().optional(),
      }).parse(req.body);
      const branch = await updateBranch(id, user.tenantId!, input);
      if (!branch) return res.status(404).json({ message: "Branch not found" });
      await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "update", entity: "branch", entityId: String(id), metadata: input });
      res.json(branch);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      next(err);
    }
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
      res.json(tenantUsers.map(u => ({ ...u, passwordHash: undefined })));
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
        email: z.string().email(),
        role: z.enum(["manager", "admin", "cashier"]),
        password: z.string().min(8),
        branchIds: z.array(z.number()).optional().default([]),
      }).parse(req.body);

      // Admins cannot create admins or managers
      if (user.role === "admin" && (input.role === "admin" || input.role === "manager")) {
        return res.status(403).json({ message: "Admins cannot create admin or manager users" });
      }

      const existing = await getUserByEmail(input.email);
      if (existing) return res.status(409).json({ message: "A user with this email already exists" });

      const newUser = await createStaffUser(user.tenantId!, {
        name: input.name,
        email: input.email,
        role: input.role as "manager" | "admin" | "cashier",
        password: input.password,
      });

      await bulkAssignBranches(newUser.id, input.branchIds);

      await createAuditLog({ tenantId: user.tenantId!, userId: user.id, action: "create", entity: "user", entityId: newUser.id, metadata: { name: newUser.name, role: newUser.role } });
      res.status(201).json({ ...newUser, passwordHash: undefined, branches: input.branchIds });
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
        role: z.enum(["owner", "manager", "admin", "cashier"]).optional(),
        name: z.string().min(1).optional(),
      }).parse(req.body);

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

  app.post("/api/admin/switch-branch", requireAuth, requireTenant, async (req, res, next) => {
    try {
      const user = getAuthUser(req);
      const { branchId } = z.object({ branchId: z.number().nullable() }).parse(req.body);

      if (branchId !== null && user.role === "cashier") {
        const assigned = await getUserBranches(user.id);
        if (!assigned.includes(branchId)) return res.status(403).json({ message: "Not assigned to this branch" });
      }

      const dbUser = await getUserById(user.id);
      if (!dbUser) return res.status(404).json({ message: "User not found" });

      const token = signToken({ ...dbUser, activeBranchId: branchId });
      res.cookie("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
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
        metadata: { total: sale.total, deletedBy: user.name || user.id },
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
      res.json({ role: user.role, ...perm });
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
