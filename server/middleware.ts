import type { Request, Response, NextFunction } from "express";
import type { UserRole, TenantSubscription } from "@shared/schema";
import { db } from "./db";
import { tenantSubscriptions, userSettings, users } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { isEssentialBusinessUrl } from "@shared/business-access";

// Short-lived in-memory cache for subscription lookups.
// Avoids a DB round-trip on every request that goes through requirePro.
// TTL of 30s keeps staleness to at most half a minute; every subscription
// write path calls invalidateSubscriptionCache() for immediate eviction.
//
// NOTE: This is a per-process cache. In a multi-worker cluster, a write in
// worker A only invalidates worker A's cache. On Vercel (serverless) each
// warm invocation is isolated, so cross-instance staleness is bounded by TTL.
// If horizontal scaling with shared state is needed, migrate to a Redis cache.
const SUB_CACHE_TTL = 30_000; // 30 seconds
const _subCache = new Map<string, { data: TenantSubscription | null; at: number }>();

/** Call this whenever tenant_subscriptions is written to, to prevent stale gate checks. */
export function invalidateSubscriptionCache(tenantId: string): void {
  _subCache.delete(tenantId);
}

function _pruneSubCache() {
  const now = Date.now();
  for (const [key, entry] of _subCache) {
    if (now - entry.at >= SUB_CACHE_TTL) _subCache.delete(key);
  }
}

export interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  provider: string;
  tenantId: string | null;
  role: UserRole;
  activeBranchId: number | null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  const user = req.user as AuthUser;
  if (!user.tenantId) {
    return res.status(403).json({ message: "No tenant associated with this account" });
  }
  next();
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  const user = req.user as AuthUser;
  if (user.role !== "owner") {
    return res.status(403).json({ message: "Forbidden: owner access required" });
  }
  next();
}

export function requireManagerOrAbove(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  const user = req.user as AuthUser;
  if (user.role !== "owner" && user.role !== "manager") {
    return res.status(403).json({ message: "Forbidden: manager access required" });
  }
  next();
}

export function requireAdminOrAbove(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  const user = req.user as AuthUser;
  if (!["owner", "manager", "admin"].includes(user.role)) {
    return res.status(403).json({ message: "Forbidden: admin access required" });
  }
  next();
}

export function getAuthUser(req: Request): AuthUser {
  return req.user as AuthUser;
}

export async function getSubscription(tenantId: string): Promise<TenantSubscription | null> {
  const cached = _subCache.get(tenantId);
  if (cached && Date.now() - cached.at < SUB_CACHE_TTL) return cached.data;
  const rows = await db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tenantId));
  const data = (rows[0] as TenantSubscription) ?? null;
  // Prune stale entries occasionally to prevent unbounded map growth
  if (_subCache.size > 500) _pruneSubCache();
  _subCache.set(tenantId, { data, at: Date.now() });
  return data;
}

export function isProSubscription(sub: { plan: string; status: string; currentPeriodEnd?: string | null } | null): boolean {
  if (!sub) return false;
  if ((sub.plan !== "pro" && sub.plan !== "business") || sub.status !== "active") return false;
  if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < new Date()) return false;
  return true;
}

export function isBusinessSubscription(sub: { plan: string; status: string; currentPeriodEnd?: string | null } | null): boolean {
  if (!sub) return false;
  if (sub.plan !== "business" || sub.status !== "active") return false;
  if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < new Date()) return false;
  return true;
}

export async function requirePro(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  const user = req.user as AuthUser;
  const tenantId = user.tenantId;
  if (!tenantId) {
    return res.status(403).json({ message: "Pro plan required", code: "PRO_REQUIRED" });
  }
  try {
    const sub = await getSubscription(tenantId);
    if (!isProSubscription(sub)) {
      return res.status(403).json({ message: "This feature requires a Pro plan", code: "PRO_REQUIRED" });
    }
    next();
  } catch (err) {
    console.error("[requirePro] subscription check error:", err);
    return res.status(500).json({ message: "Failed to verify subscription" });
  }
}

async function getBusinessAccessContext(user: AuthUser) {
  const direct = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
  if (direct[0]) return direct[0];

  if (!user.tenantId) return null;
  const ownerRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, user.tenantId), eq(users.role, "owner")))
    .limit(1);

  if (!ownerRows[0]) return null;
  const ownerSettings = await db.select().from(userSettings).where(eq(userSettings.userId, ownerRows[0].id));
  return ownerSettings[0] ?? null;
}

export function requireProOrBusinessFeature(url: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as AuthUser;
    const tenantId = user.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: "Pro plan required", code: "PRO_REQUIRED" });
    }
    try {
      const sub = await getSubscription(tenantId);
      if (isProSubscription(sub)) return next();

      const settings = await getBusinessAccessContext(user);
      if (isEssentialBusinessUrl(url, settings?.businessType, settings?.businessSubType)) return next();

      return res.status(403).json({ message: "This feature requires a Pro plan", code: "PRO_REQUIRED" });
    } catch (err) {
      console.error("[requireProOrBusinessFeature] access check error:", err);
      return res.status(500).json({ message: "Failed to verify feature access" });
    }
  };
}
