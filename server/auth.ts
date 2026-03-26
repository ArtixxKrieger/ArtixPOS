import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { db } from "./db";
import { users, products, sales, pendingOrders, userSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Express, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const AUTH_COOKIE = "auth_token";

function getJwtSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET environment variable is required in production");
    }
    console.warn("[auth] WARNING: SESSION_SECRET is not set. Using insecure fallback.");
    return "dev_fallback_secret_change_in_prod_do_not_use";
  }
  return secret;
}

function getBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) return `https://${domain}`;
  return "http://localhost:5000";
}

/**
 * Generate a self-verifying HMAC state token — no cookie or session required.
 */
function generateState(): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const hmac = crypto.createHmac("sha256", getJwtSecret()).update(nonce).digest("hex");
  return Buffer.from(`${nonce}:${hmac}`).toString("base64url");
}

function verifyState(state: string | undefined): boolean {
  if (!state) return false;
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) return false;
    const nonce = decoded.slice(0, colonIdx);
    const receivedHmac = decoded.slice(colonIdx + 1);
    if (!nonce || !receivedHmac) return false;
    const expectedHmac = crypto.createHmac("sha256", getJwtSecret()).update(nonce).digest("hex");
    const a = Buffer.from(receivedHmac.padEnd(64, "0").slice(0, 64), "hex");
    const b = Buffer.from(expectedHmac, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function signToken(user: any): string {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, avatar: user.avatar, provider: user.provider },
    getJwtSecret(),
    { expiresIn: "7d" }
  );
}

function setAuthCookie(res: Response, user: any) {
  const token = signToken(user);
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function jwtAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = (req as any).cookies?.[AUTH_COOKIE];
  if (token) {
    try {
      const payload = jwt.verify(token, getJwtSecret()) as any;
      req.user = { id: payload.id, name: payload.name, email: payload.email, avatar: payload.avatar, provider: payload.provider };
    } catch {
      // invalid/expired token
    }
  }
  next();
}

/**
 * Find or create a user — uses SELECT → INSERT → SELECT so it works
 * even when Turso's RETURNING clause is unreliable.
 */
async function findOrCreateUser(data: {
  id: string; email: string | null; name: string | null;
  avatar: string | null; provider: string; providerId: string;
}) {
  const [existing] = await db.select().from(users).where(eq(users.id, data.id));
  if (existing) return existing;

  try {
    await db.insert(users).values(data as any);
  } catch (err: any) {
    if (!err?.message?.toLowerCase().includes("unique")) throw err;
  }

  const [created] = await db.select().from(users).where(eq(users.id, data.id));
  if (!created) throw new Error(`DB: user not found after insert — id=${data.id}`);
  return created;
}

export function setupAuth(app: Express) {
  const baseUrl = getBaseUrl();
  console.log(`[auth] Using base URL: ${baseUrl}`);

  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const facebookEnabled = !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);

  // ── Register Passport strategies ──────────────────────────────────────────────

  if (googleEnabled) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: `${baseUrl}/auth/google/callback`,
          // Disable passport's built-in state management so it doesn't
          // try to verify state against the session (we do it via HMAC ourselves)
          store: {
            store: (_req: any, _state: any, _meta: any, cb: any) => cb(null, crypto.randomBytes(4).toString("hex")),
            verify: (_req: any, _state: any, cb: any) => cb(null, true, {}),
          } as any,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const user = await findOrCreateUser({
              id: `google_${profile.id}`,
              email: profile.emails?.[0]?.value ?? null,
              name: profile.displayName ?? null,
              avatar: profile.photos?.[0]?.value ?? null,
              provider: "google",
              providerId: profile.id,
            });
            return done(null, user);
          } catch (err: any) {
            console.error("[auth] Google strategy error:", err?.message ?? err);
            return done(err as Error);
          }
        }
      )
    );
    console.log("[auth] Google OAuth strategy registered");
  } else {
    console.log("[auth] Google OAuth not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET missing)");
  }

  if (facebookEnabled) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: process.env.FACEBOOK_APP_ID!,
          clientSecret: process.env.FACEBOOK_APP_SECRET!,
          callbackURL: `${baseUrl}/auth/facebook/callback`,
          profileFields: ["id", "displayName", "photos", "email"],
          enableProof: true,
          store: {
            store: (_req: any, _state: any, _meta: any, cb: any) => cb(null, crypto.randomBytes(4).toString("hex")),
            verify: (_req: any, _state: any, cb: any) => cb(null, true, {}),
          } as any,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const user = await findOrCreateUser({
              id: `facebook_${profile.id}`,
              email: profile.emails?.[0]?.value ?? null,
              name: profile.displayName ?? null,
              avatar: profile.photos?.[0]?.value ?? null,
              provider: "facebook",
              providerId: profile.id,
            });
            return done(null, user);
          } catch (err: any) {
            console.error("[auth] Facebook strategy error:", err?.message ?? err);
            return done(err as Error);
          }
        }
      )
    );
    console.log("[auth] Facebook OAuth strategy registered");
  } else {
    console.log("[auth] Facebook OAuth not configured (FACEBOOK_APP_ID/FACEBOOK_APP_SECRET missing)");
  }

  // ── Google routes ─────────────────────────────────────────────────────────────

  app.get("/auth/google", (req, res, next) => {
    if (!googleEnabled) return res.redirect("/login?error=google_not_configured");
    try {
      const state = generateState();
      passport.authenticate("google", { scope: ["profile", "email"], state, session: false })(req, res, next);
    } catch (err: any) {
      console.error("[auth] Google initiation error:", err?.message ?? err);
      res.redirect("/login?error=google_init");
    }
  });

  app.get("/auth/google/callback", (req, res, next) => {
    if (!googleEnabled) return res.redirect("/login?error=google_not_configured");

    const state = req.query.state as string | undefined;
    if (!verifyState(state)) {
      console.warn("[auth] Google state verification failed");
      return res.redirect("/login?error=state_mismatch");
    }

    passport.authenticate("google", { session: false }, (err: any, user: any) => {
      if (err) {
        const msg = String(err?.message ?? err).slice(0, 120);
        console.error("[auth] Google callback error:", msg);
        return res.redirect(`/login?error=google_cb&detail=${encodeURIComponent(msg)}`);
      }
      if (!user) {
        console.warn("[auth] Google callback: no user returned");
        return res.redirect("/login?error=google_no_user");
      }
      try {
        setAuthCookie(res, user);
        return res.redirect("/");
      } catch (cookieErr: any) {
        console.error("[auth] Cookie error:", cookieErr?.message ?? cookieErr);
        return res.redirect("/login?error=cookie");
      }
    })(req, res, next);
  });

  // ── Facebook routes ───────────────────────────────────────────────────────────

  app.get("/auth/facebook", (req, res, next) => {
    if (!facebookEnabled) return res.redirect("/login?error=facebook_not_configured");
    try {
      const state = generateState();
      passport.authenticate("facebook", { scope: ["email"], state, session: false })(req, res, next);
    } catch (err: any) {
      console.error("[auth] Facebook initiation error:", err?.message ?? err);
      res.redirect("/login?error=facebook_init");
    }
  });

  app.get("/auth/facebook/callback", (req, res, next) => {
    if (!facebookEnabled) return res.redirect("/login?error=facebook_not_configured");

    const state = req.query.state as string | undefined;
    if (!verifyState(state)) {
      console.warn("[auth] Facebook state verification failed");
      return res.redirect("/login?error=state_mismatch");
    }

    passport.authenticate("facebook", { session: false }, (err: any, user: any) => {
      if (err) {
        console.error("[auth] Facebook callback error:", err?.message ?? err);
        return res.redirect(`/login?error=facebook_cb`);
      }
      if (!user) {
        console.warn("[auth] Facebook callback: no user returned");
        return res.redirect("/login?error=facebook_no_user");
      }
      try {
        setAuthCookie(res, user);
        return res.redirect("/");
      } catch (cookieErr: any) {
        console.error("[auth] Cookie error:", cookieErr?.message ?? cookieErr);
        return res.redirect("/login?error=cookie");
      }
    })(req, res, next);
  });

  // ── Logout & account management ───────────────────────────────────────────────

  app.post("/auth/logout", (_req, res) => {
    res.clearCookie(AUTH_COOKIE);
    res.json({ ok: true });
  });

  app.delete("/api/auth/account", async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const uid = (req.user as any).id;
    try {
      await db.delete(products).where(eq(products.userId, uid));
      await db.delete(sales).where(eq(sales.userId, uid));
      await db.delete(pendingOrders).where(eq(pendingOrders.userId, uid));
      await db.delete(userSettings).where(eq(userSettings.userId, uid));
      await db.delete(users).where(eq(users.id, uid));
      res.clearCookie(AUTH_COOKIE);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.user) return res.status(401).json({ user: null });
    res.json({ user: req.user });
  });

  // Diagnostic endpoint — check DB connectivity without needing OAuth
  app.get("/api/auth/db-check", async (_req, res) => {
    try {
      await db.select().from(users).limit(1);
      res.json({ ok: true, db: "connected", turso: !!process.env.TURSO_DATABASE_URL });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message ?? String(err), turso: !!process.env.TURSO_DATABASE_URL });
    }
  });
}
