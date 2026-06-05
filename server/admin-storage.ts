import { db } from "./db";
import {
  tenants, branches, users, userBranches, auditLogs, sales, rolePermissions,
  timeLogs,
  type Tenant, type Branch, type User, type AuditLog, type UserBranch, type RolePermission,
} from "@shared/schema";
import { eq, and, desc, inArray, isNull, sql, gte, lte } from "drizzle-orm";
import { invalidateTenantCache } from "./storage";
import crypto from "crypto";

import { hashPassword, verifyPassword } from "./crypto";
export { hashPassword, verifyPassword };

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

export async function getBranches(tenantId: string): Promise<Branch[]> {
  return await db.select().from(branches).where(
    and(eq(branches.tenantId, tenantId), isNull(branches.deletedAt))
  );
}

export async function getBranch(id: number, tenantId: string): Promise<Branch | undefined> {
  const [branch] = await db.select().from(branches).where(
    and(eq(branches.id, id), eq(branches.tenantId, tenantId))
  );
  return branch;
}

export async function createBranch(tenantId: string, data: { name: string; address?: string | null; phone?: string | null; email?: string | null; website?: string | null; description?: string | null; color?: string | null; timezone?: string | null; taxRate?: string | null; openingHours?: any; isActive?: boolean; isMain?: boolean; businessType?: string | null; businessSubType?: string | null }): Promise<Branch> {
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

export async function updateBranch(id: number, tenantId: string, data: Partial<{ name: string; address: string | null; phone: string | null; email: string | null; website: string | null; description: string | null; color: string | null; timezone: string | null; taxRate: string | null; openingHours: any; isActive: boolean; isMain: boolean; businessType: string | null; businessSubType: string | null }>): Promise<Branch | undefined> {
  const [branch] = await db.update(branches)
    .set(data as any)
    .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)))
    .returning();
  return branch;
}

export async function deleteBranch(id: number, tenantId: string): Promise<void> {
  await db.delete(userBranches).where(eq(userBranches.branchId, id));
  await db.update(branches)
    .set({ deletedAt: new Date().toISOString(), isActive: false } as any)
    .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)));
}

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
  role: "manager" | "admin" | "cashier" | "staff";
  hashedPin?: string; // pre-hashed PIN, set immediately if provided
}): Promise<User> {
  // PIN-only staff: no email, no password, no app login.
  // They authenticate exclusively via PIN on the in-store kiosk.
  const id = `staff_${crypto.randomUUID()}`;
  await (db.insert(users) as any).values({
    id,
    email: null,
    name: data.name,
    avatar: null,
    provider: "pin",
    providerId: id,
    tenantId,
    role: data.role,
    staffPin: data.hashedPin ?? null,
  });
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function updateUserRole(userId: string, tenantId: string, role: "owner" | "manager" | "admin" | "cashier" | "staff"): Promise<User | undefined> {
  const [user] = await (db.update(users) as any)
    .set({ role })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .returning();
  // Invalidate tenant cache so the role change is immediately reflected
  invalidateTenantCache(userId);
  return user;
}

export async function deleteUser(userId: string, tenantId: string): Promise<void> {
  await db.update(timeLogs).set({ deletedAt: new Date().toISOString() } as any).where(eq(timeLogs.userId, userId));
  await db.update(users).set({ deletedAt: new Date().toISOString(), isBanned: true } as any).where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
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

export async function createAuditLog(data: {
  tenantId: string;
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const [last] = await db.select({ recordHash: auditLogs.recordHash }).from(auditLogs).where(eq(auditLogs.tenantId, data.tenantId)).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(1);
  const previousHash = last?.recordHash ?? null;
  const payload = JSON.stringify({
    tenantId: data.tenantId,
    userId: data.userId,
    action: data.action,
    entity: data.entity,
    entityId: data.entityId ?? null,
    metadata: data.metadata ?? null,
    previousHash,
    createdAt: new Date().toISOString(),
  });
  const recordHash = crypto.createHash("sha256").update(payload).digest("hex");
  await db.insert(auditLogs).values({ ...data, previousHash, recordHash } as any);
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
      previousHash: auditLogs.previousHash,
      recordHash: auditLogs.recordHash,
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
