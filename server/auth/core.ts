import { db, pool } from "../db";
import { users, revokedTokens } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { updateLastSeen } from "../admin-storage";

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
  } catch {
  }
}

export async function revokeToken(jti: string, userId: string, expiresAt: string): Promise<void> {
  _revokedJtis.add(jti);
  try {
    await db.insert(revokedTokens).values({ jti, userId, expiresAt }).onConflictDoNothing();
  } catch (err) {
    console.error("[auth] Failed to persist revoked token:", err);
  }
}

_loadRevokedTokens();
setInterval(_pruneRevokedTokens, 60 * 60 * 1000);

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
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) return `https://${domain}`;
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
    },
    getJwtSecret(),
    { expiresIn: rememberMe ? "90d" : "7d" },
  );
}

export function setAuthCookie(res: Response, user: TokenUser, rememberMe = false) {
  const token = signToken(user, rememberMe);
  const maxAge = rememberMe ? 90 * 24 * 60 * 60 * 1000 : 1 * 24 * 60 * 60 * 1000;
  res.cookie(AUTH_COOKIE, token, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, AUTH_COOKIE_OPTIONS);
}

export const bannedUserIds = new Set<string>();

db.select({ id: users.id })
  .from(users)
  .where(eq(users.isBanned, true))
  .then((rows) => {
    rows.forEach((r) => bannedUserIds.add(String(r.id)));
    if (rows.length > 0) console.log(`[auth] Loaded ${rows.length} banned user(s) into memory`);
  })
  .catch((err) => console.error("[auth] Failed to seed banned users from DB:", err));

export function jwtAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  let token = req.cookies?.[AUTH_COOKIE];

  if (!token) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (token) {
    try {
      const payload = jwt.verify(token, getJwtSecret()) as import("jsonwebtoken").JwtPayload;

      if (payload.jti && _revokedJtis.has(payload.jti)) {
        next();
        return;
      }

      if (bannedUserIds.has(payload.id)) {
        req.isBanned = true;
        next();
        return;
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
      };

      req.tokenJti = payload.jti ?? null;
      req.tokenExp = payload.exp ?? null;
      if (req.path.startsWith("/api/")) {
        updateLastSeen(payload.id).catch(() => {});
      }
    } catch {
    }
  }
  next();
}
