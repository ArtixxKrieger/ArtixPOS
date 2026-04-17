import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@shared/schema";
import { db } from "./db";
import { tenantSubscriptions } from "@shared/schema";
import { eq } from "drizzle-orm";

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

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = req.user as AuthUser;
    if (!roles.includes(user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }
    next();
  };
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

// owner | manager
export function requireManagerOrAbove(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  const user = req.user as AuthUser;
  if (user.role !== "owner" && user.role !== "manager") {
    return res.status(403).json({ message: "Forbidden: manager access required" });
  }
  next();
}

// owner | manager | admin
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

export async function getSubscription(tenantId: string) {
  const rows = await db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tenantId));
  return rows[0] ?? null;
}

export function isProSubscription(sub: { plan: string; status: string; currentPeriodEnd?: string | null } | null): boolean {
  if (!sub) return false;
  if (sub.plan !== "pro" || sub.status !== "active") return false;
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
