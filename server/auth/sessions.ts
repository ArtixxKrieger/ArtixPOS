/**
 * User session tracking — one row per active login.
 * Sessions are keyed by `id` (stable UUID) and track the current `jti`
 * (updated on token rotation) so remote logout is always accurate.
 */

import jwt from "jsonwebtoken";
import { db } from "../db";
import { userSessions } from "@shared/schema";
import { and, eq, lt, ne } from "drizzle-orm";
import { getJwtSecret } from "./core";

// ---------------------------------------------------------------------------
// Device / UA parsing
// ---------------------------------------------------------------------------

export function parseDeviceName(ua: string | undefined): string {
  if (!ua) return "Unknown device";

  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  else if (/MSIE|Trident/.test(ua)) browser = "Internet Explorer";

  let os = "Unknown";
  if (/iPhone/.test(ua)) os = "iPhone";
  else if (/iPad/.test(ua)) os = "iPad";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/.test(ua)) os = "Mac";
  else if (/Linux/.test(ua)) os = "Linux";
  else if (/CrOS/.test(ua)) os = "ChromeOS";

  return `${browser} on ${os}`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Called right after a JWT is issued at login / register / OAuth. */
export async function createSession(
  token: string,
  userId: string,
  ip: string,
  userAgent: string | undefined,
): Promise<void> {
  try {
    const payload = jwt.decode(token) as any;
    if (!payload?.jti || !payload?.exp) return;
    await db
      .insert(userSessions)
      .values({
        jti: payload.jti,
        userId,
        deviceName: parseDeviceName(userAgent),
        ipAddress: ip || null,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
      })
      .onConflictDoNothing();
  } catch {
    // non-critical — never let this break the login flow
  }
}

/**
 * Called during token rotation (sliding-window refresh).
 * Updates the session's jti, lastSeenAt, and expiresAt in-place so the
 * session stays visible in the "active sessions" list across rotations.
 */
export async function updateSessionJti(
  oldJti: string,
  newToken: string,
): Promise<void> {
  try {
    const payload = jwt.decode(newToken) as any;
    if (!payload?.jti || !payload?.exp) return;
    await db
      .update(userSessions)
      .set({
        jti: payload.jti,
        lastSeenAt: new Date().toISOString(),
        expiresAt: new Date(payload.exp * 1000).toISOString(),
      })
      .where(eq(userSessions.jti, oldJti));
  } catch {
    // non-critical
  }
}

/** Remove a session by its current jti (called on logout). */
export async function deleteSession(jti: string): Promise<void> {
  try {
    await db.delete(userSessions).where(eq(userSessions.jti, jti));
  } catch {
    // non-critical
  }
}

/** Remove all sessions for a user except the current one. */
export async function deleteAllOtherSessions(
  userId: string,
  currentJti: string,
): Promise<void> {
  try {
    await db
      .delete(userSessions)
      .where(and(eq(userSessions.userId, userId), ne(userSessions.jti, currentJti)));
  } catch {
    // non-critical
  }
}

/** Return all non-expired sessions for a user, pruning stale rows first. */
export async function listUserSessions(userId: string) {
  const now = new Date().toISOString();
  // Prune expired rows for this user
  await db
    .delete(userSessions)
    .where(and(eq(userSessions.userId, userId), lt(userSessions.expiresAt, now)));
  return db
    .select()
    .from(userSessions)
    .where(eq(userSessions.userId, userId))
    .orderBy(userSessions.lastSeenAt);
}

/** Look up a single session by its stable id (not jti), scoped to a user. */
export async function getSessionById(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(userSessions)
    .where(and(eq(userSessions.id, id), eq(userSessions.userId, userId)));
  return row;
}
