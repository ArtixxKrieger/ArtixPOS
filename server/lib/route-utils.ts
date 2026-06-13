

import type { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { branches as branchesTable } from "@shared/schema";
import { createAuditLog } from "../admin-storage";

export function getUserId(req: Request): string {
  if (!req.user) throw new Error("getUserId() called on unauthenticated request");
  return req.user.id;
}

export function getTenantId(req: Request): string | null {
  return req.user?.tenantId ?? null;
}

export function getActiveBranchId(req: Request): number | null {
  return req.user?.activeBranchId ?? null;
}

export async function resolveBranchId(req: Request): Promise<number | null> {
  const active = getActiveBranchId(req);
  if (active != null) return active;

  const tid = getTenantId(req);
  if (!tid) return null;

  const tenantBranches = await db
    .select()
    .from(branchesTable)
    .where(eq(branchesTable.tenantId, tid));

  if (tenantBranches.length === 0) return null;
  const main = tenantBranches.find(b => b.isMain);
  return (main ?? tenantBranches[0]).id;
}

export async function auditLog(
  req: Request,
  action: string,
  entity: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const tid = getTenantId(req);
  if (!tid) return;
  try {
    await createAuditLog({
      tenantId: tid,
      userId: getUserId(req),
      action,
      entity,
      entityId,
      metadata,
    });
  } catch {

  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

export function isValidDate(s: string): boolean {
  return ISO_DATE_RE.test(s) && !isNaN(Date.parse(s));
}

export function handleZodError(err: unknown, res: Response): boolean {
  if (err instanceof z.ZodError) {
    const first = err.errors[0];
    res.status(400).json({
      message: first.message,
      field: first.path.join("."),
    });
    return true;
  }
  return false;
}
