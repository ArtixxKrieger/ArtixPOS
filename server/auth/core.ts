import { db } from "../db";
import { users, revokedTokens } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { updateLastSeen } from "../admin-storage";

// ── SSE connection registry ───────────────────────────────────────────────────
// Maps JTI → active SSE response so we can push an instant logout event when
// that session is revoked, without waiting for the client's next poll.
const _sseConnections = new Map<string, Response>();

export function registerSseConnection(jti: string, res: Response): void {
  _sseConnections.set(jti, res);
}

export function unregisterSseConnection(jti: string): void {
  _sseConnections.delete(jti);
}

export const AUTH_COOKIE = "auth_token";

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  path: "/",
};

export const _revokedJtis = new Set<string>();

async function _loadRevokedTokens(): Promise<void> {
  try {
    const now = new Date().toISOString();
    const rows = await db
      .select({ jti: revokedTokens.jti })
      .from(revokedTokens)
      .where(sql`${revokedTokens.expiresAt} >= ${now}`);
    rows.forEach((r) => _revokedJtis.add(r.jti));
    if (rows.length > 0) {
      console.log(`[auth] Loaded ${rows.length} revoked token(s) into memory`);
    }
  } catch (err) {
    console.error("[auth] Failed to load revoked tokens:", err);
  }
}

async function _pruneRevokedTokens(): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { rows } = await db.execute(
      sql`DELETE FROM revoked_tokens WHERE expires_at < ${now} RETURNING jti`,
    );
    if (rows.length > 0) {
      for (const r of rows) {
        _revokedJtis.delete((r as { jti: string }).jti);
      }
      console.log(`[auth] Pruned ${rows.length} expired revoked token(s) from memory + DB`);
    }
  } catch {}
}

export async function revokeToken(jti: string, userId: string, expiresAt: string): Promise<void> {
  _revokedJtis.add(jti);
  // Instantly push logout to the device holding this session (if connected via SSE)
  const sseRes = _sseConnections.get(jti);
  if (sseRes) {
    try {
      sseRes.write("event: revoked\ndata: {}\n\n");
    } catch {}
    _sseConnections.delete(jti);
  }
  try {
    await db.insert(revokedTokens).values({ jti, userId, expiresAt }).onConflictDoNothing();
  } catch (err) {
    console.error("[auth] Failed to persist revoked token:", err);
  }
}

// Called once from _doInit() after the DB pool is ready.
// Avoids firing DB queries at module-load time (kills Vercel cold starts).
let _authCacheInitialized = false;
export function initAuthCache(): void {
  if (_authCacheInitialized) return;
  _authCacheInitialized = true;
  _loadRevokedTokens().catch((err) => console.error("[auth] Failed to load revoked tokens:", err));
  _seedBannedUsers();
  setInterval(_pruneRevokedTokens, 60 * 60 * 1000).unref?.();
}

let _ephemeralSecret: string | undefined;

export function getJwtSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET environment variable is required in production");
    }
    if (!_ephemeralSecret) {
      _ephemeralSecret = crypto.randomBytes(32).toString("hex");
      console.warn(
        "[auth] WARNING: SESSION_SECRET is not set — using an ephemeral random secret. Sessions will be invalidated on restart.",
      );
    }
    return _ephemeralSecret;
  }
  return secret;
}

export function getBaseUrl(): string {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (appUrl) return appUrl;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:5000";
}

export interface TokenUser {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  provider: string;
  tenantId: string | null;
  role: string;
  activeBranchId: number | null;
  emailVerified?: boolean;
}

export function verifyToken(token: string): Express.User {
  const payload = jwt.verify(token, getJwtSecret()) as import("jsonwebtoken").JwtPayload;
  return {
    id: payload.id,
    name: payload.name,
    email: payload.email,
    avatar: payload.avatar,
    provider: payload.provider,
    tenantId: payload.tenantId ?? null,
    role: payload.role ?? "owner",
    activeBranchId: payload.activeBranchId ?? null,
    emailVerified: payload.emailVerified ?? true,
  };
}

export function signToken(user: TokenUser, rememberMe = false): string {
  return jwt.sign(
    {
      jti: crypto.randomUUID(),
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      provider: user.provider,
      tenantId: user.tenantId ?? null,
      role: user.role ?? "owner",
      activeBranchId: user.activeBranchId ?? null,
      emailVerified: user.emailVerified ?? true,
      rem: rememberMe,
    },
    getJwtSecret(),
    { expiresIn: rememberMe ? "90d" : "7d" },
  );
}

export function setAuthCookie(res: Response, user: TokenUser, rememberMe = false): string {
  const token = signToken(user, rememberMe);
  const maxAge = rememberMe ? 90 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  res.cookie(AUTH_COOKIE, token, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge,
  });
  return token;
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, AUTH_COOKIE_OPTIONS);
}

export const bannedUserIds = new Set<string>();

// Populated by initAuthCache() — not at module load time.
export function _seedBannedUsers(): void {
  db.select({ id: users.id })
    .from(users)
    .where(eq(users.isBanned, true))
    .then((rows) => {
      rows.forEach((r) => bannedUserIds.add(String(r.id)));
      if (rows.length > 0) console.log(`[auth] Loaded ${rows.length} banned user(s) into memory`);
    })
    .catch((err) => console.error("[auth] Failed to seed banned users from DB:", err));
}

export function jwtAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  // Collect all tokens: cookie + Authorization header
  const tokens: string[] = [];
  const cookieToken = req.cookies?.[AUTH_COOKIE];
  if (cookieToken) tokens.push(cookieToken);
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7);
    if (!tokens.includes(bearerToken)) tokens.push(bearerToken);
  }

  for (const token of tokens) {
    try {
      const payload = jwt.verify(token, getJwtSecret()) as import("jsonwebtoken").JwtPayload;

      if (payload.jti && _revokedJtis.has(payload.jti)) continue;

      if (bannedUserIds.has(payload.id)) {
        req.isBanned = true;
        break;
      }
      req.user = {
        id: payload.id,
        name: payload.name,
        email: payload.email,
        avatar: payload.avatar,
        provider: payload.provider,
        tenantId: payload.tenantId ?? null,
        role: payload.role ?? "owner",
        activeBranchId: payload.activeBranchId ?? null,
        emailVerified: payload.emailVerified ?? true,
      };

      req.tokenJti = payload.jti ?? null;
      req.tokenExp = payload.exp ?? null;
      req.tokenRem = payload.rem === true;
      if (req.path.startsWith("/api/")) {
        updateLastSeen(payload.id).catch(() => {});
      }
      break;
    } catch {
      // Token invalid or expired — try the next one
    }
  }
  next();
}
