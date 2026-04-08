import { db } from "./db";
import {
  tenants, branches, users, userBranches, auditLogs, sales, inviteTokens, rolePermissions,
  timeLogs, shifts, refunds,
  type Tenant, type Branch, type User, type AuditLog, type UserBranch, type InviteToken, type RolePermission,
} from "@shared/schema";
import { eq, and, desc, inArray, isNull, sql, gte, lte, or } from "drizzle-orm";
import crypto from "crypto";

// ─── Password Hashing (unified — delegates to crypto.ts) ──────────────────────
import { hashPassword, verifyPassword } from "./crypto";
export { hashPassword, verifyPassword };

// ─── Tenants ──────────────────────────────────────────────────────────────────

export async function getTenant(tenantId: string): Promise<Tenant | undefined> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  return tenant;
}

export async function createTenant(name: string): Promise<Tenant> {
  const id = crypto.randomUUID();
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 32) + "-" + id.slice(0, 8);
  await db.insert(tenants).values({ id, name, slug });
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
  return tenant;
}

export async function updateTenant(tenantId: string, name: string): Promise<Tenant> {
  await db.update(tenants).set({ name }).where(eq(tenants.id, tenantId));
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  return tenant;
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export async function getBranches(tenantId: string): Promise<Branch[]> {
  return await db.select().from(branches).where(eq(branches.tenantId, tenantId));
}

export async function getBranch(id: number, tenantId: string): Promise<Branch | undefined> {
  const [branch] = await db.select().from(branches).where(
    and(eq(branches.id, id), eq(branches.tenantId, tenantId))
  );
  return branch;
}

export async function createBranch(tenantId: string, data: { name: string; address?: string | null; phone?: string | null; isActive?: boolean; isMain?: boolean }): Promise<Branch> {
  if (data.isMain) {
    // Unset any existing main branch for this tenant
    await (db.update(branches) as any).set({ isMain: false }).where(eq(branches.tenantId, tenantId));
  }
  const [branch] = await db.insert(branches).values({ tenantId, ...data }).returning();
  return branch;
}

export async function setMainBranch(id: number, tenantId: string): Promise<Branch | undefined> {
  await (db.update(branches) as any).set({ isMain: false }).where(eq(branches.tenantId, tenantId));
  const [branch] = await db.update(branches)
    .set({ isMain: true } as any)
    .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)))
    .returning();
  return branch;
}

export async function updateBranch(id: number, tenantId: string, data: Partial<{ name: string; address: string | null; phone: string | null; isActive: boolean; isMain: boolean }>): Promise<Branch | undefined> {
  const [branch] = await db.update(branches)
    .set(data as any)
    .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)))
    .returning();
  return branch;
}

export async function deleteBranch(id: number, tenantId: string): Promise<void> {
  await db.delete(userBranches).where(eq(userBranches.branchId, id));
  await db.delete(branches).where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)));
}

// ─── Users (tenant scoped) ────────────────────────────────────────────────────

export async function getTenantUsers(tenantId: string): Promise<(User & { branches: number[] })[]> {
  const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));
  const userIds = tenantUsers.map(u => u.id);
  let ubRows: UserBranch[] = [];
  if (userIds.length > 0) {
    ubRows = await db.select().from(userBranches).where(inArray(userBranches.userId, userIds));
  }
  return tenantUsers.map(u => ({
    ...u,
    branches: ubRows.filter(ub => ub.userId === u.id).map(ub => ub.branchId),
  }));
}

export async function getUserById(userId: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

export async function createStaffUser(tenantId: string, data: {
  name: string;
  email: string;
  role: "manager" | "admin" | "cashier";
  password: string;
}): Promise<User> {
  const passwordHash = await hashPassword(data.password);
  const id = `local_${crypto.randomUUID()}`;
  await (db.insert(users) as any).values({
    id,
    email: data.email,
    name: data.name,
    avatar: null,
    provider: "local",
    providerId: data.email,
    tenantId,
    role: data.role,
    passwordHash,
  });
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function updateUserRole(userId: string, tenantId: string, role: "owner" | "manager" | "admin" | "cashier"): Promise<User | undefined> {
  const [user] = await (db.update(users) as any)
    .set({ role })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .returning();
  return user;
}

export async function deleteUser(userId: string, tenantId: string): Promise<void> {
  // Clean up staff-user records in FK dependency order before removing the user row.
  // Note: sales/refunds created by this user contain financial records — we delete refunds
  // (cashier-created) but leave sales in place. If sales exist the delete will throw a FK
  // error, which the caller should surface as a 409 so the admin knows to reassign first.
  await db.delete(timeLogs).where(eq(timeLogs.userId, userId));
  await db.delete(shifts).where(eq(shifts.userId, userId));
  await db.delete(refunds).where(eq(refunds.userId, userId));
  // Invite tokens created or accepted by this staff member
  await db.delete(inviteTokens).where(or(eq(inviteTokens.createdBy, userId), eq(inviteTokens.usedBy, userId)));
  await db.delete(userBranches).where(eq(userBranches.userId, userId));
  await db.delete(users).where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
}

export async function banUser(userId: string, tenantId: string, reason?: string): Promise<User | undefined> {
  const [user] = await (db.update(users) as any)
    .set({ isBanned: true, bannedAt: new Date().toISOString(), banReason: reason ?? null })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .returning();
  return user;
}

export async function unbanUser(userId: string, tenantId: string): Promise<User | undefined> {
  const [user] = await (db.update(users) as any)
    .set({ isBanned: false, bannedAt: null, banReason: null })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .returning();
  return user;
}

const lastSeenCache = new Map<string, number>();
export async function updateLastSeen(userId: string): Promise<void> {
  const now = Date.now();
  const last = lastSeenCache.get(userId) ?? 0;
  if (now - last < 60_000) return;
  lastSeenCache.set(userId, now);
  await (db.update(users) as any)
    .set({ lastSeenAt: new Date().toISOString() })
    .where(eq(users.id, userId));
}

// ─── User Branches ────────────────────────────────────────────────────────────

export async function getUserBranches(userId: string): Promise<number[]> {
  const rows = await db.select().from(userBranches).where(eq(userBranches.userId, userId));
  return rows.map(r => r.branchId);
}

export async function assignBranch(userId: string, branchId: number): Promise<void> {
  const existing = await db.select().from(userBranches).where(
    and(eq(userBranches.userId, userId), eq(userBranches.branchId, branchId))
  );
  if (existing.length === 0) {
    await db.insert(userBranches).values({ userId, branchId } as any);
  }
}

// Bulk-assigns multiple branches to a user in a single INSERT (skip duplicates).
export async function bulkAssignBranches(userId: string, branchIds: number[]): Promise<void> {
  if (branchIds.length === 0) return;
  await db.insert(userBranches)
    .values(branchIds.map(branchId => ({ userId, branchId })) as any)
    .onConflictDoNothing();
}

export async function removeBranch(userId: string, branchId: number): Promise<void> {
  await db.delete(userBranches).where(
    and(eq(userBranches.userId, userId), eq(userBranches.branchId, branchId))
  );
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export async function createAuditLog(data: {
  tenantId: string;
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  await db.insert(auditLogs).values(data as any);
}

export interface AuditLogWithActor extends AuditLog {
  actorName: string | null;
  actorEmail: string | null;
}

export async function getAuditLogs(
  tenantId: string,
  opts: {
    limit?: number;
    userId?: string;
    action?: string;
    entity?: string;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<AuditLogWithActor[]> {
  const { limit = 200, userId: filterUserId, action: filterAction, entity: filterEntity, startDate, endDate } = opts;

  const conditions = [eq(auditLogs.tenantId, tenantId)];
  if (filterUserId) conditions.push(eq(auditLogs.userId, filterUserId));
  if (filterAction) conditions.push(eq(auditLogs.action, filterAction));
  if (filterEntity) conditions.push(eq(auditLogs.entity, filterEntity));
  if (startDate) conditions.push(gte(auditLogs.createdAt, startDate));
  if (endDate) conditions.push(lte(auditLogs.createdAt, endDate));

  const rows = await db
    .select({
      id: auditLogs.id,
      tenantId: auditLogs.tenantId,
      userId: auditLogs.userId,
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return rows as AuditLogWithActor[];
}

// ─── Role Permissions ─────────────────────────────────────────────────────────

export async function getRolePermissions(tenantId: string): Promise<RolePermission[]> {
  return await db.select().from(rolePermissions).where(eq(rolePermissions.tenantId, tenantId));
}

export async function upsertRolePermission(
  tenantId: string,
  role: "manager" | "cashier",
  data: {
    maxDiscountPercent?: number;
    canRefund?: boolean;
    canDeleteSale?: boolean;
    canVoidOrder?: boolean;
  }
): Promise<RolePermission> {
  const existing = await db.select().from(rolePermissions)
    .where(and(eq(rolePermissions.tenantId, tenantId), eq(rolePermissions.role, role)));

  if (existing.length > 0) {
    const [updated] = await (db.update(rolePermissions) as any)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(and(eq(rolePermissions.tenantId, tenantId), eq(rolePermissions.role, role)))
      .returning();
    return updated;
  } else {
    const [created] = await (db.insert(rolePermissions) as any)
      .values({ tenantId, role, ...data })
      .returning();
    return created;
  }
}

export async function getRolePermissionForRole(tenantId: string, role: string): Promise<RolePermission | null> {
  const [perm] = await db.select().from(rolePermissions)
    .where(and(eq(rolePermissions.tenantId, tenantId), eq(rolePermissions.role, role)));
  return perm ?? null;
}

// ─── Invite Tokens ────────────────────────────────────────────────────────────

export async function createInviteToken(data: {
  tenantId: string;
  role: "manager" | "admin" | "cashier";
  branchIds: number[];
  createdBy: string;
}): Promise<InviteToken> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const [invite] = await (db.insert(inviteTokens) as any).values({
    tenantId: data.tenantId,
    token,
    role: data.role,
    branchIds: data.branchIds,
    createdBy: data.createdBy,
    expiresAt,
  }).returning();
  return invite;
}

export async function getInviteToken(token: string): Promise<InviteToken | undefined> {
  const [invite] = await db.select().from(inviteTokens).where(eq(inviteTokens.token, token));
  return invite;
}

export async function redeemInviteToken(token: string, userId: string): Promise<{ ok: boolean; message?: string; role?: string; tenantId?: string }> {
  const invite = await getInviteToken(token);
  if (!invite) return { ok: false, message: "Invite link not found or already used" };
  if (invite.usedAt) return { ok: false, message: "This invite link has already been used" };
  if (new Date(invite.expiresAt) < new Date()) return { ok: false, message: "This invite link has expired" };

  // Check user doesn't already have a different tenant
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return { ok: false, message: "User not found" };
  if (user.tenantId && user.tenantId !== invite.tenantId) {
    return { ok: false, message: "You are already a member of another organization" };
  }

  // Prevent the invite creator from redeeming their own link
  if (invite.createdBy === userId) {
    return { ok: false, message: "You cannot redeem an invite link you created" };
  }

  // Never downgrade an existing owner via an invite link
  if (user.role === "owner" && user.tenantId === invite.tenantId) {
    return { ok: false, message: "Owners cannot be reassigned via invite links" };
  }

  // Assign user to tenant with role
  await (db.update(users) as any)
    .set({ tenantId: invite.tenantId, role: invite.role })
    .where(eq(users.id, userId));

  // Assign branches in a single bulk insert
  const branchIds = (invite.branchIds as number[]) || [];
  await bulkAssignBranches(userId, branchIds);

  // Mark token as used
  await (db.update(inviteTokens) as any)
    .set({ usedBy: userId, usedAt: new Date().toISOString() })
    .where(eq(inviteTokens.token, token));

  return { ok: true, role: invite.role, tenantId: invite.tenantId };
}

export async function getInviteTokens(tenantId: string): Promise<InviteToken[]> {
  const now = new Date().toISOString();
  return await db.select().from(inviteTokens)
    .where(and(
      eq(inviteTokens.tenantId, tenantId),
      isNull(inviteTokens.usedAt),
      sql`(expires_at IS NULL OR expires_at > ${now})`
    ))
    .orderBy(desc(inviteTokens.createdAt));
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getBranchAnalytics(tenantId: string, branchIds?: number[]) {
  const allBranches = await getBranches(tenantId);
  const filteredBranches = branchIds && branchIds.length > 0
    ? allBranches.filter(b => branchIds.includes(b.id))
    : allBranches;

  if (filteredBranches.length === 0) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();

  const filteredIds = filteredBranches.map(b => b.id);
  const branchCondition = filteredIds.length === 1
    ? eq(sales.branchId, filteredIds[0])
    : inArray(sales.branchId, filteredIds);

  // Two GROUP BY queries replace the previous 2×N per-branch queries
  const [allTimeTotals, todayTotals] = await Promise.all([
    db.select({
      branchId: sales.branchId,
      totalRevenue: sql<string>`COALESCE(SUM(CAST(${sales.total} AS REAL)), 0)`,
      totalOrders: sql<string>`COUNT(*)`,
    })
      .from(sales)
      .where(and(branchCondition, isNull(sales.deletedAt)))
      .groupBy(sales.branchId),

    db.select({
      branchId: sales.branchId,
      todayRevenue: sql<string>`COALESCE(SUM(CAST(${sales.total} AS REAL)), 0)`,
      todayOrders: sql<string>`COUNT(*)`,
    })
      .from(sales)
      .where(and(branchCondition, isNull(sales.deletedAt), sql`${sales.createdAt} >= ${todayStr}`))
      .groupBy(sales.branchId),
  ]);

  const allTimeMap = new Map(allTimeTotals.map(r => [r.branchId, r]));
  const todayMap = new Map(todayTotals.map(r => [r.branchId, r]));

  return filteredBranches.map(branch => {
    const at = allTimeMap.get(branch.id);
    const td = todayMap.get(branch.id);
    return {
      branch,
      totalRevenue: Number(at?.totalRevenue) || 0,
      totalOrders: Number(at?.totalOrders) || 0,
      todayRevenue: Number(td?.todayRevenue) || 0,
      todayOrders: Number(td?.todayOrders) || 0,
    };
  });
}
