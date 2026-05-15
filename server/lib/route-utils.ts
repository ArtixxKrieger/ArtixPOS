/**
 * Shared route utilities used across all domain route files.
 *
 * Centralising these helpers means:
 *   - A single place to update auth/tenant extraction logic.
 *   - Consistent error shapes across every endpoint.
 *   - Junior developers have a clear "how do I get the current user?" reference.
 */
import type { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { branches as branchesTable } from "@shared/schema";
import { createAuditLog } from "../admin-storage";

// ─── Auth context helpers ─────────────────────────────────────────────────────

/** Returns the authenticated user's ID. Throws if the request is unauthenticated. */
export function getUserId(req: Request): string {
  if (!req.user) throw new Error("getUserId() called on unauthenticated request");
  return (req.user as any).id;
}

/** Returns the authenticated user's tenant ID, or null for unattached accounts. */
export function getTenantId(req: Request): string | null {
  return (req.user as any)?.tenantId ?? null;
}

/**
 * Returns the branch the user is currently viewing.
 * Branch owners switch via /api/admin/switch-branch; staff members are assigned a fixed branch.
 * Returns null when no branch is yet assigned (e.g. during onboarding).
 */
export function getActiveBranchId(req: Request): number | null {
  return (req.user as any)?.activeBranchId ?? null;
}

/**
 * Resolves which branch a newly-created record should belong to.
 *
 * Priority:
 *   1. User's active branch (prevents cross-branch leaks from client-supplied IDs).
 *   2. Tenant's main branch (the branch flagged isMain=true).
 *   3. Any branch belonging to the tenant.
 *   4. null (onboarding path — no branches created yet).
 */
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

// ─── Audit logging ────────────────────────────────────────────────────────────

/**
 * Records an audit trail entry. Failures are swallowed intentionally —
 * an audit log error must never break the primary request.
 */
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
    // intentionally silent
  }
}

// ─── Input validation helpers ─────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

/** Returns true for ISO 8601 date strings (YYYY-MM-DD or full datetime). */
export function isValidDate(s: string): boolean {
  return ISO_DATE_RE.test(s) && !isNaN(Date.parse(s));
}

/**
 * Handles a ZodError by sending a 400 response with the first validation message.
 * Re-throws anything that isn't a ZodError.
 *
 * Usage:
 *   try { ... }
 *   catch (err) { if (!handleZodError(err, res)) throw err; }
 */
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
