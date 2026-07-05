/**
 * Staff PIN authentication — persistence layer.
 *
 * All DB operations for PIN login, clock-in/out, PIN management,
 * and the auto-clockout job live here. Business logic (JWT signing,
 * password hashing, brute-force tracking) stays in the route layer.
 */

import { db } from "../../db";
import { users, timeLogs, userBranches, revokedTokens, type TimeLog } from "@shared/schema";
import { eq, and, isNull, or, sql } from "drizzle-orm";

// ── Roster ──────────────────────────────────────────────────────────────────

export interface StaffRosterRow {
  id: string;
  name: string | null;
  role: string;
  avatar: string | null;
  hasPin: boolean;
  isLocked: boolean;
}

export async function getStaffRoster(tenantId: string, branchId: number): Promise<StaffRosterRow[]> {
  const rows = await db
    .select({
      id:            users.id,
      name:          users.name,
      role:          users.role,
      avatar:        users.avatar,
      hasPin:        users.staffPin,
      pinLockedUntil: users.pinLockedUntil,
    })
    .from(users)
    .where(and(
      eq(users.tenantId, tenantId),
      eq(users.isBanned, false),
      or(
        eq(users.role, "owner"),
        sql`EXISTS (
          SELECT 1 FROM ${userBranches}
          WHERE ${userBranches.userId} = ${users.id}
            AND ${userBranches.branchId} = ${branchId}
        )`,
      ),
    ));

  const now = new Date().toISOString();
  return rows.map(r => ({
    id:       r.id,
    name:     r.name,
    role:     r.role ?? "staff",
    avatar:   r.avatar,
    hasPin:   !!r.hasPin,
    isLocked: !!(r.pinLockedUntil && r.pinLockedUntil > now),
  }));
}

// ── User lookups ─────────────────────────────────────────────────────────────

export async function getUserForPin(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

export async function getUserInTenant(userId: string, tenantId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId)))
    .limit(1);
  if (!user || user.tenantId !== tenantId) return null;
  return user;
}

// ── PIN management ───────────────────────────────────────────────────────────

export async function lockUserPin(userId: string, until: string): Promise<void> {
  await db.update(users).set({ pinLockedUntil: until }).where(eq(users.id, userId));
}

export async function clearUserPinLock(userId: string): Promise<void> {
  await db.update(users).set({ pinLockedUntil: null }).where(eq(users.id, userId));
}

/** Sets or clears the hashed PIN. Pass `null` to remove it. */
export async function setUserPin(userId: string, hashedPin: string | null): Promise<void> {
  await db.update(users).set({ staffPin: hashedPin, pinLockedUntil: null }).where(eq(users.id, userId));
}

// ── Branch assignment ────────────────────────────────────────────────────────

export async function checkBranchAssignment(userId: string, branchId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: userBranches.userId })
    .from(userBranches)
    .where(and(eq(userBranches.userId, userId), eq(userBranches.branchId, branchId)))
    .limit(1);
  return !!row;
}

// ── Time logs ────────────────────────────────────────────────────────────────

export async function getOpenTimeLog(userId: string): Promise<TimeLog | null> {
  const [log] = await db
    .select()
    .from(timeLogs)
    .where(and(eq(timeLogs.userId, userId), isNull(timeLogs.clockOut), isNull(timeLogs.deletedAt)))
    .limit(1);
  return log ?? null;
}

export async function createClockIn(
  userId: string,
  branchId: number,
): Promise<TimeLog> {
  const [log] = await db
    .insert(timeLogs)
    .values({ userId, branchId, clockIn: new Date().toISOString(), notes: "PIN clock-in" })
    .returning();
  return log;
}

export async function closeTimeLog(
  logId: number,
  data: { clockOut: string; breakMinutes: number; clockOutNotes?: string | null },
): Promise<void> {
  await db
    .update(timeLogs)
    .set({
      clockOut:      data.clockOut,
      clockOutNotes: data.clockOutNotes ?? null,
      breakStart:    null,
      breakMinutes:  data.breakMinutes,
    })
    .where(eq(timeLogs.id, logId));
}

// ── Token revocation ─────────────────────────────────────────────────────────

export async function revokeJti(jti: string, userId: string, expiresAt: string): Promise<void> {
  await db
    .insert(revokedTokens)
    .values({ jti, userId, expiresAt })
    .onConflictDoNothing();
}

// ── Auto clock-out job ───────────────────────────────────────────────────────

/**
 * Closes any time-log open for more than 8 hours.
 * Returns the count of logs that were auto-closed.
 */
export async function autoClockoutStaleLogs(): Promise<number> {
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
  const now           = new Date().toISOString();

  const staleLogs = await db
    .select({ id: timeLogs.id, breakStart: timeLogs.breakStart, breakMinutes: timeLogs.breakMinutes })
    .from(timeLogs)
    .where(and(
      isNull(timeLogs.clockOut),
      isNull(timeLogs.deletedAt),
      sql`${timeLogs.clockIn} < ${eightHoursAgo}`,
    ));

  for (const log of staleLogs) {
    let finalBreakMinutes = log.breakMinutes ?? 0;
    if (log.breakStart) {
      const breakMs = new Date(now).getTime() - new Date(log.breakStart).getTime();
      finalBreakMinutes += Math.max(0, Math.floor(breakMs / 60_000));
    }
    await db.update(timeLogs).set({
      clockOut:      now,
      breakStart:    null,
      breakMinutes:  finalBreakMinutes,
      clockOutNotes: "Auto clock-out: shift exceeded 8 hours",
    }).where(eq(timeLogs.id, log.id));
  }

  return staleLogs.length;
}
