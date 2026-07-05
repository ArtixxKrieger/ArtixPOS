
import type { Express } from "express";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../crypto";
import jwt from "jsonwebtoken";
import { AUTH_COOKIE, AUTH_COOKIE_OPTIONS, getJwtSecret } from "../auth";
import { requireAuth, requireManagerOrAbove } from "../middleware";
import { bruteForceGuard, recordFailedAttempt, recordSuccessfulLogin } from "../brute-force";
import crypto from "crypto";
import {
  getStaffRoster,
  getUserForPin,
  getUserInTenant,
  lockUserPin,
  clearUserPinLock,
  setUserPin,
  checkBranchAssignment,
  getOpenTimeLog,
  createClockIn,
  closeTimeLog,
  revokeJti,
  autoClockoutStaleLogs,
} from "../infrastructure/persistence/staff-pin-queries";

const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;

function getIp(req: import("express").Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket?.remoteAddress ??
    "unknown"
  );
}

const pinAttempts = new Map<string, { count: number; resetAt: number }>();

function _getPinAttempts(userId: string): number {
  const entry = pinAttempts.get(userId);
  if (!entry) return 0;
  if (Date.now() > entry.resetAt) { pinAttempts.delete(userId); return 0; }
  return entry.count;
}

function incrementPinAttempts(userId: string): number {
  const now   = Date.now();
  const entry = pinAttempts.get(userId) ?? { count: 0, resetAt: now + PIN_LOCK_MINUTES * 60_000 };
  entry.count += 1;
  pinAttempts.set(userId, entry);
  return entry.count;
}

function clearPinAttempts(userId: string): void {
  pinAttempts.delete(userId);
}

export function registerStaffPinRoutes(app: Express): void {

  app.get("/api/staff-pin/roster", async (req, res) => {
    try {
      const branchId = Number(req.query.branchId);
      if (!Number.isInteger(branchId) || branchId <= 0)
        return res.status(400).json({ message: "branchId required" });

      const tenantId: string | null =
        (req.user as any)?.tenantId ?? (req.query.tenantId as string | undefined) ?? null;
      if (!tenantId) return res.status(403).json({ message: "No tenant" });

      const roster = await getStaffRoster(tenantId, branchId);
      res.json(roster);
    } catch { res.status(500).json({ message: "Server error" }); }
  });

  app.post("/api/staff-pin/login", bruteForceGuard, async (req, res) => {
    try {
      const { userId, pin, branchId } = z.object({
        userId:   z.string(),
        pin:      z.string().min(4).max(6),
        branchId: z.number().int().positive(),
      }).parse(req.body);

      const user = await getUserForPin(userId);
      if (!user || user.isBanned)
        return res.status(401).json({ message: "Invalid PIN" });

      if (user.role === "manager" && !user.staffPin)
        return res.status(403).json({ message: "Please use the regular login for your account." });

      const now = new Date().toISOString();
      if (user.pinLockedUntil && user.pinLockedUntil > now) {
        const unlockAt = new Date(user.pinLockedUntil);
        const minsLeft = Math.ceil((unlockAt.getTime() - Date.now()) / 60_000);
        return res.status(429).json({
          message: `PIN locked. Try again in ${minsLeft} minute${minsLeft !== 1 ? "s" : ""}.`,
          lockedUntil: user.pinLockedUntil,
        });
      }

      if (!user.staffPin) {
        return res.status(401).json({ message: "No PIN set. Ask your manager to set one for you." });
      }

      const valid = await verifyPassword(pin, user.staffPin);
      if (!valid) {
        recordFailedAttempt(getIp(req));
        const attempts  = incrementPinAttempts(userId);
        const remaining = MAX_PIN_ATTEMPTS - attempts;

        if (attempts >= MAX_PIN_ATTEMPTS) {
          const lockUntil = new Date(Date.now() + PIN_LOCK_MINUTES * 60_000).toISOString();
          await lockUserPin(userId, lockUntil);
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

      recordSuccessfulLogin(getIp(req));
      clearPinAttempts(userId);
      if (user.pinLockedUntil) {
        await clearUserPinLock(userId);
      }

      if (user.role !== "owner") {
        const assigned = await checkBranchAssignment(userId, branchId);
        if (!assigned)
          return res.status(403).json({ message: "You are not assigned to this branch." });
      }

      const existingLog = await getOpenTimeLog(userId);
      let timeLog = existingLog ?? null;
      if (!existingLog) {
        timeLog = await createClockIn(userId, branchId);
      }

      const jti   = crypto.randomUUID();
      const token = jwt.sign(
        {
          jti,
          id: user.id, name: user.name, email: user.email,
          avatar: user.avatar, provider: user.provider,
          tenantId: user.tenantId, role: user.role,
          activeBranchId: branchId, pinSession: true,
        },
        getJwtSecret(),
        { expiresIn: "8h" },
      );

      res.cookie(AUTH_COOKIE, token, { ...AUTH_COOKIE_OPTIONS, maxAge: 8 * 60 * 60 * 1000 });
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

  app.post("/api/staff-pin/clockout", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.pinSession)
        return res.status(400).json({ message: "Not a PIN session" });

      const log = await getOpenTimeLog(user.id);
      if (log) {
        const { notes } = z.object({ notes: z.string().optional() }).parse(req.body);
        const now = new Date();

        let finalBreakMinutes = log.breakMinutes ?? 0;
        if (log.breakStart) {
          const breakMs = now.getTime() - new Date(log.breakStart).getTime();
          finalBreakMinutes += Math.max(0, Math.floor(breakMs / 60000));
        }
        await closeTimeLog(log.id, {
          clockOut:      now.toISOString(),
          breakMinutes:  finalBreakMinutes,
          clockOutNotes: notes ?? null,
        });
      }

      const authHeader  = req.headers.authorization;
      const cookieToken = req.cookies?.[AUTH_COOKIE];
      const token       = cookieToken ?? (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
      if (token) {
        try {
          const payload = jwt.decode(token) as any;
          if (payload?.jti) {
            const exp = payload.exp
              ? new Date(payload.exp * 1000).toISOString()
              : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
            await revokeJti(payload.jti, user.id, exp);
          }
        } catch { }
      }

      res.clearCookie(AUTH_COOKIE, AUTH_COOKIE_OPTIONS);
      res.json({ message: "Clocked out successfully", clockOut: new Date().toISOString() });
    } catch (err) {
      console.error("[staff-pin] clockout error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/staff-pin/set", requireAuth, requireManagerOrAbove, async (req, res) => {
    try {
      const { userId, pin } = z.object({
        userId: z.string(),
        pin:    z.string().min(4).max(6).regex(/^\d+$/, "PIN must be numeric"),
      }).parse(req.body);

      const requestingUser = req.user as any;
      const target = await getUserInTenant(userId, requestingUser.tenantId);
      if (!target) return res.status(404).json({ message: "Staff member not found" });

      if (target.role === "owner" && requestingUser.role !== "owner" && requestingUser.id !== target.id)
        return res.status(403).json({ message: "Only the owner can set their own PIN." });

      if (requestingUser.role === "manager" && target.role === "manager")
        return res.status(403).json({ message: "Managers cannot set PINs for other managers." });

      const hashed = await hashPassword(pin);
      await setUserPin(userId, hashed);
      clearPinAttempts(userId);
      res.json({ message: "PIN set successfully" });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: err.errors?.[0]?.message ?? "Invalid PIN" });
      console.error("[staff-pin] set error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.delete("/api/staff-pin/:userId", requireAuth, requireManagerOrAbove, async (req, res) => {
    try {
      const userId         = req.params.userId as string;
      const requestingUser = req.user as any;
      const target = await getUserInTenant(userId, requestingUser.tenantId);
      if (!target) return res.status(404).json({ message: "Staff member not found" });

      await setUserPin(userId, null);
      clearPinAttempts(userId);
      res.json({ message: "PIN removed" });
    } catch (err) {
      console.error("[staff-pin] remove error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/staff-pin/lock-screen", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.pinSession)
        return res.status(400).json({ message: "Not a PIN session" });

      const cookieToken = req.cookies?.[AUTH_COOKIE];
      const authHeader  = req.headers.authorization;
      const token       = cookieToken ?? (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
      if (token) {
        try {
          const payload = jwt.decode(token) as any;
          if (payload?.jti) {
            const exp = payload.exp
              ? new Date(payload.exp * 1000).toISOString()
              : new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
            await revokeJti(payload.jti, user.id, exp);
          }
        } catch { }
      }

      res.clearCookie(AUTH_COOKIE, AUTH_COOKIE_OPTIONS);
      res.json({ message: "Screen locked" });
    } catch (err) {
      console.error("[staff-pin] lock-screen error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/staff-pin/unlock/:userId", requireAuth, requireManagerOrAbove, async (req, res) => {
    try {
      const userId         = req.params.userId as string;
      const requestingUser = req.user as any;
      const target = await getUserInTenant(userId, requestingUser.tenantId);
      if (!target) return res.status(404).json({ message: "Staff member not found" });

      await clearUserPinLock(userId);
      clearPinAttempts(userId);
      res.json({ message: "PIN unlocked" });
    } catch (err) {
      console.error("[staff-pin] unlock error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });
}

async function runAutoClockout() {
  try {
    const count = await autoClockoutStaleLogs();
    if (count > 0) console.log(`[staff-pin] Auto-closed ${count} stale time log(s)`);
  } catch (err) {
    console.error("[staff-pin] Auto clock-out job error:", err);
  }
}
setInterval(runAutoClockout, 15 * 60 * 1000);
