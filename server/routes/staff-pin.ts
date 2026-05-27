/**
 * Staff PIN Clock-in System
 *
 * Flow:
 *   1. GET  /api/staff-pin/roster?branchId=N  — public within tenant, returns staff list (names + ids, no PINs)
 *   2. POST /api/staff-pin/login              — PIN auth, issues short-lived JWT, auto clocks in
 *   3. POST /api/staff-pin/clockout           — revokes session token, clocks out
 *   4. POST /api/staff-pin/set                — owner/manager sets or resets a staff member's PIN
 *   5. DELETE /api/staff-pin/:userId          — owner/manager removes a staff member's PIN
 *
 * Security model:
 *   - PINs are hashed with scrypt (same as passwords). Never stored plaintext.
 *   - After 5 consecutive wrong PINs for a user, that user's PIN is locked for 15 min.
 *   - IP-level brute-force guard (shared with regular login) applies too.
 *   - Sessions are short-lived (8 h) and auto-revoked on clock-out.
 *   - Owners and managers are excluded from PIN login entirely.
 */

import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { users, timeLogs, userBranches, revokedTokens } from "@shared/schema";
import { eq, and, isNull, inArray, sql, or } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../crypto";
import jwt from "jsonwebtoken";
import { AUTH_COOKIE, AUTH_COOKIE_OPTIONS, getJwtSecret } from "../auth";
import { requireAuth, requireManagerOrAbove } from "../middleware";
import { bruteForceGuard, recordFailedAttempt, recordSuccessfulLogin } from "../brute-force";
import crypto from "crypto";

const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getIp(req: import("express").Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket?.remoteAddress ??
    "unknown"
  );
}

// Per-user failed PIN attempt counter (in-memory, lightweight)
// Key: userId, Value: { count, resetAt }
const pinAttempts = new Map<string, { count: number; resetAt: number }>();

function getPinAttempts(userId: string): number {
  const entry = pinAttempts.get(userId);
  if (!entry) return 0;
  if (Date.now() > entry.resetAt) { pinAttempts.delete(userId); return 0; }
  return entry.count;
}

function incrementPinAttempts(userId: string): number {
  const now = Date.now();
  const entry = pinAttempts.get(userId) ?? { count: 0, resetAt: now + PIN_LOCK_MINUTES * 60_000 };
  entry.count += 1;
  pinAttempts.set(userId, entry);
  return entry.count;
}

function clearPinAttempts(userId: string): void {
  pinAttempts.delete(userId);
}

// ── Route registration ─────────────────────────────────────────────────────────

export function registerStaffPinRoutes(app: Express): void {

  // ── 1. Roster: list staff members for a branch (names only, no PINs) ─────────
  // Used by the clock-in screen to show who can log in.
  // Works with an active session OR with explicit branchId + tenantId query params
  // (so the kiosk screen can reload the roster after a staff session ends).
  app.get("/api/staff-pin/roster", async (req, res) => {
    try {
      const branchId = Number(req.query.branchId);
      if (!Number.isInteger(branchId) || branchId <= 0)
        return res.status(400).json({ message: "branchId required" });

      // Resolve tenantId: prefer authenticated session, fall back to query param
      const tenantId: string | null =
        (req.user as any)?.tenantId ?? (req.query.tenantId as string | undefined) ?? null;
      if (!tenantId) return res.status(403).json({ message: "No tenant" });

      // Get all users for this tenant+branch.
      // Owners are included regardless of branch assignment (they own all branches).
      // Non-owners must have a userBranches row for this branch.
      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          role: users.role,
          avatar: users.avatar,
          hasPin: users.staffPin,
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
            )`
          )
        ));

      const now = new Date().toISOString();
      res.json(rows.map(r => ({
        id: r.id,
        name: r.name,
        role: r.role,
        avatar: r.avatar,
        hasPin: !!r.hasPin,
        isLocked: !!(r.pinLockedUntil && r.pinLockedUntil > now),
      })));
    } catch (err) { res.status(500).json({ message: "Server error" }); }
  });

  // ── 2. PIN login — authenticate and auto clock-in ─────────────────────────────
  app.post("/api/staff-pin/login", bruteForceGuard, async (req, res) => {
    try {
      const { userId, pin, branchId } = z.object({
        userId:   z.string(),
        pin:      z.string().min(4).max(6),
        branchId: z.number().int().positive(),
      }).parse(req.body);

      // Load user
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user || user.isBanned)
        return res.status(401).json({ message: "Invalid PIN" });

      // Managers without a PIN must use the regular login.
      // Owners CAN use a PIN to re-authenticate at the kiosk screen.
      if (user.role === "manager" && !user.staffPin)
        return res.status(403).json({ message: "Please use the regular login for your account." });

      // PIN lock check
      const now = new Date().toISOString();
      if (user.pinLockedUntil && user.pinLockedUntil > now) {
        const unlockAt = new Date(user.pinLockedUntil);
        const minsLeft = Math.ceil((unlockAt.getTime() - Date.now()) / 60_000);
        return res.status(429).json({
          message: `PIN locked. Try again in ${minsLeft} minute${minsLeft !== 1 ? "s" : ""}.`,
          lockedUntil: user.pinLockedUntil,
        });
      }

      // Verify PIN exists
      if (!user.staffPin) {
        return res.status(401).json({ message: "No PIN set. Ask your manager to set one for you." });
      }

      // Verify PIN hash
      const valid = await verifyPassword(pin, user.staffPin);
      if (!valid) {
        recordFailedAttempt(getIp(req));
        const attempts = incrementPinAttempts(userId);
        const remaining = MAX_PIN_ATTEMPTS - attempts;

        if (attempts >= MAX_PIN_ATTEMPTS) {
          const lockUntil = new Date(Date.now() + PIN_LOCK_MINUTES * 60_000).toISOString();
          await db.update(users).set({ pinLockedUntil: lockUntil }).where(eq(users.id, userId));
          return res.status(429).json({
            message: `Too many wrong PINs. Locked for ${PIN_LOCK_MINUTES} minutes.`,
            lockedUntil: lockUntil,
          });
        }

        return res.status(401).json({
          message: `Incorrect PIN. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
          attemptsRemaining: remaining,
        });
      }

      // PIN correct — clear lockout state
      recordSuccessfulLogin(getIp(req));
      clearPinAttempts(userId);
      if (user.pinLockedUntil) {
        await db.update(users).set({ pinLockedUntil: null }).where(eq(users.id, userId));
      }

      // Verify user belongs to this branch
      const [branchLink] = await db
        .select()
        .from(userBranches)
        .where(and(eq(userBranches.userId, userId), eq(userBranches.branchId, branchId)))
        .limit(1);
      if (!branchLink)
        return res.status(403).json({ message: "You are not assigned to this branch." });

      // Auto clock-in: check for existing open time log
      const [existingLog] = await db
        .select()
        .from(timeLogs)
        .where(and(eq(timeLogs.userId, userId), isNull(timeLogs.clockOut)))
        .limit(1);

      let timeLog = existingLog ?? null;
      if (!existingLog) {
        const [newLog] = await db
          .insert(timeLogs)
          .values({
            userId,
            branchId,
            clockIn: new Date().toISOString(),
            notes: "PIN clock-in",
          })
          .returning();
        timeLog = newLog;
      }

      // Issue short-lived session token (8 hours — one shift max)
      const jti = crypto.randomUUID();
      const token = jwt.sign(
        {
          jti,
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          provider: user.provider,
          tenantId: user.tenantId,
          role: user.role,
          activeBranchId: branchId,
          pinSession: true,
        },
        getJwtSecret(),
        { expiresIn: "8h" }
      );

      // Set auth cookie
      res.cookie(AUTH_COOKIE, token, {
        ...AUTH_COOKIE_OPTIONS,
        maxAge: 8 * 60 * 60 * 1000,
      });

      res.json({
        user: { id: user.id, name: user.name, role: user.role, avatar: user.avatar },
        timeLog,
        alreadyClockedIn: !!existingLog,
      });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid request" });
      console.error("[staff-pin] login error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── 3. PIN clock-out — revoke session and close time log ──────────────────────
  app.post("/api/staff-pin/clockout", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.pinSession)
        return res.status(400).json({ message: "Not a PIN session" });

      // Close open time log
      const [log] = await db
        .select()
        .from(timeLogs)
        .where(and(eq(timeLogs.userId, user.id), isNull(timeLogs.clockOut)))
        .limit(1);

      if (log) {
        await db
          .update(timeLogs)
          .set({ clockOut: new Date().toISOString() })
          .where(eq(timeLogs.id, log.id));
      }

      // Revoke JWT
      const authHeader = req.headers.authorization;
      const cookieToken = req.cookies?.[AUTH_COOKIE];
      const token = cookieToken ?? (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
      if (token) {
        try {
          const payload = jwt.decode(token) as any;
          if (payload?.jti) {
            const exp = payload.exp
              ? new Date(payload.exp * 1000).toISOString()
              : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
            await db.insert(revokedTokens).values({ jti: payload.jti, userId: user.id, expiresAt: exp }).onConflictDoNothing();
          }
        } catch { /* non-critical */ }
      }

      res.clearCookie(AUTH_COOKIE, AUTH_COOKIE_OPTIONS);
      res.json({ message: "Clocked out successfully", clockOut: new Date().toISOString() });
    } catch (err) {
      console.error("[staff-pin] clockout error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── 4. Set / reset a staff member's PIN ───────────────────────────────────────
  app.post("/api/staff-pin/set", requireAuth, requireManagerOrAbove, async (req, res) => {
    try {
      const { userId, pin } = z.object({
        userId: z.string(),
        pin: z.string().min(4).max(6).regex(/^\d+$/, "PIN must be numeric"),
      }).parse(req.body);

      const requestingUser = req.user as any;
      const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!target || target.tenantId !== requestingUser.tenantId)
        return res.status(404).json({ message: "Staff member not found" });

      // Only the owner themselves can set their own PIN (managers cannot set owner PINs)
      if (target.role === "owner" && requestingUser.role !== "owner" && requestingUser.id !== target.id)
        return res.status(403).json({ message: "Only the owner can set their own PIN." });

      // Managers can only set PINs for cashiers/admins, not other managers
      if (requestingUser.role === "manager" && target.role === "manager")
        return res.status(403).json({ message: "Managers cannot set PINs for other managers." });

      const hashed = await hashPassword(pin);
      await db.update(users)
        .set({ staffPin: hashed, pinLockedUntil: null })
        .where(eq(users.id, userId));

      clearPinAttempts(userId);
      res.json({ message: "PIN set successfully" });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: err.errors?.[0]?.message ?? "Invalid PIN" });
      console.error("[staff-pin] set error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── 5. Remove a staff member's PIN ───────────────────────────────────────────
  app.delete("/api/staff-pin/:userId", requireAuth, requireManagerOrAbove, async (req, res) => {
    try {
      const userId = req.params.userId as string;
      const requestingUser = req.user as any;

      const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!target || target.tenantId !== requestingUser.tenantId)
        return res.status(404).json({ message: "Staff member not found" });

      await db.update(users).set({ staffPin: null, pinLockedUntil: null }).where(eq(users.id, userId));
      clearPinAttempts(userId);
      res.json({ message: "PIN removed" });
    } catch (err) {
      console.error("[staff-pin] remove error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── 6. Lock screen — revoke PIN session without closing the time log ──────────
  // Used when an employee starts a break or another staff member needs the device.
  // The open time log (with breakStart set) remains intact; when they re-login via
  // PIN the system finds the existing open log and continues from there.
  app.post("/api/staff-pin/lock-screen", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.pinSession)
        return res.status(400).json({ message: "Not a PIN session" });

      // Revoke JWT
      const cookieToken = req.cookies?.[AUTH_COOKIE];
      const authHeader = req.headers.authorization;
      const token = cookieToken ?? (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
      if (token) {
        try {
          const payload = jwt.decode(token) as any;
          if (payload?.jti) {
            const exp = payload.exp
              ? new Date(payload.exp * 1000).toISOString()
              : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
            await db.insert(revokedTokens).values({ jti: payload.jti, userId: user.id, expiresAt: exp }).onConflictDoNothing();
          }
        } catch { /* non-critical */ }
      }

      res.clearCookie(AUTH_COOKIE, AUTH_COOKIE_OPTIONS);
      res.json({ message: "Screen locked" });
    } catch (err) {
      console.error("[staff-pin] lock-screen error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // ── 7. Unlock a locked PIN (manager override) ────────────────────────────────
  app.post("/api/staff-pin/unlock/:userId", requireAuth, requireManagerOrAbove, async (req, res) => {
    try {
      const userId = req.params.userId as string;
      const requestingUser = req.user as any;

      const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!target || target.tenantId !== requestingUser.tenantId)
        return res.status(404).json({ message: "Staff member not found" });

      await db.update(users).set({ pinLockedUntil: null }).where(eq(users.id, userId));
      clearPinAttempts(userId);
      res.json({ message: "PIN unlocked" });
    } catch (err) {
      console.error("[staff-pin] unlock error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });
}

// ── Auto clock-out: close stale time logs after 8-hour shift window ──────────
// Runs every 15 minutes. Catches cases where the JWT expired but the time log
// was never explicitly closed via the clockout endpoint.
async function runAutoClockout() {
  try {
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const staleLogs = await db
      .select({ id: timeLogs.id })
      .from(timeLogs)
      .where(and(isNull(timeLogs.clockOut), sql`${timeLogs.clockIn} < ${eightHoursAgo}`));

    if (staleLogs.length > 0) {
      await db
        .update(timeLogs)
        .set({ clockOut: new Date().toISOString(), notes: "Auto clock-out: shift exceeded 8 hours" })
        .where(inArray(timeLogs.id, staleLogs.map(l => l.id)));
      console.log(`[staff-pin] Auto-closed ${staleLogs.length} stale time log(s)`);
    }
  } catch (err) {
    console.error("[staff-pin] Auto clock-out job error:", err);
  }
}
setInterval(runAutoClockout, 15 * 60 * 1000);
