import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@shared/schema";

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
