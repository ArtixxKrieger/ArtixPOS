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
const STATE_COOKIE = "oauth_state";

function getJwtSecret(): string {
  return process.env.SESSION_SECRET || "dev_fallback_secret_change_in_prod";
}

function getBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) return `https://${domain}`;
  return "http://localhost:5000";
}

function signToken(user: any): string {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      provider: user.provider,
    },
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
      req.user = {
        id: payload.id,
        name: payload.name,
        email: payload.email,
        avatar: payload.avatar,
        provider: payload.provider,
      };
    } catch {
      // invalid/expired token — req.user stays undefined
    }
  }
  next();
}

export function setupAuth(app: Express) {
  const baseUrl = getBaseUrl();
  console.log(`[auth] Using base URL: ${baseUrl}`);

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${baseUrl}/auth/google/callback`,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const userId = `google_${profile.id}`;
            const [existing] = await db.select().from(users).where(eq(users.id, userId));
            if (existing) return done(null, existing);
            const [created] = await db
              .insert(users)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .values({
                id: userId,
                email: profile.emails?.[0]?.value ?? null,
                name: profile.displayName ?? null,
                avatar: profile.photos?.[0]?.value ?? null,
                provider: "google",
                providerId: profile.id,
              } as any)
              .returning();
            return done(null, created);
          } catch (err) {
            return done(err as Error);
          }
        }
      )
    );
    console.log("[auth] Google OAuth strategy registered");
  } else {
    console.log("[auth] Google OAuth not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET missing)");
  }

  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: process.env.FACEBOOK_APP_ID,
          clientSecret: process.env.FACEBOOK_APP_SECRET,
          callbackURL: `${baseUrl}/auth/facebook/callback`,
          profileFields: ["id", "displayName", "photos", "email"],
          enableProof: true,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const userId = `facebook_${profile.id}`;
            const [existing] = await db.select().from(users).where(eq(users.id, userId));
            if (existing) return done(null, existing);
            const [created] = await db
              .insert(users)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .values({
                id: userId,
                email: profile.emails?.[0]?.value ?? null,
                name: profile.displayName ?? null,
                avatar: profile.photos?.[0]?.value ?? null,
                provider: "facebook",
                providerId: profile.id,
              } as any)
              .returning();
            return done(null, created);
          } catch (err) {
            return done(err as Error);
          }
        }
      )
    );
    console.log("[auth] Facebook OAuth strategy registered");
  } else {
    console.log("[auth] Facebook OAuth not configured (FACEBOOK_APP_ID/FACEBOOK_APP_SECRET missing)");
  }

  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const facebookEnabled = !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);

  app.get("/auth/google", (req, res, next) => {
    if (!googleEnabled) return res.redirect("/login?error=google_not_configured");
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 5 * 60 * 1000,
      sameSite: "lax",
    });
    passport.authenticate("google", { scope: ["profile", "email"], state, session: false })(req, res, next);
  });

  app.get("/auth/google/callback", (req, res, next) => {
    if (!googleEnabled) return res.redirect("/login?error=google_not_configured");
    const expected = (req as any).cookies?.[STATE_COOKIE];
    const actual = req.query.state as string;
    res.clearCookie(STATE_COOKIE);
    if (!expected || expected !== actual) return res.redirect("/login?error=state_mismatch");

    passport.authenticate("google", { session: false }, (err: any, user: any) => {
      if (err || !user) return res.redirect("/login?error=google");
      setAuthCookie(res, user);
      res.redirect("/");
    })(req, res, next);
  });

  app.get("/auth/facebook", (req, res, next) => {
    if (!facebookEnabled) return res.redirect("/login?error=facebook_not_configured");
    const state = crypto.randomBytes(16).toString("hex");
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 5 * 60 * 1000,
      sameSite: "lax",
    });
    passport.authenticate("facebook", { scope: ["email"], state, session: false })(req, res, next);
  });

  app.get("/auth/facebook/callback", (req, res, next) => {
    if (!facebookEnabled) return res.redirect("/login?error=facebook_not_configured");
    const expected = (req as any).cookies?.[STATE_COOKIE];
    const actual = req.query.state as string;
    res.clearCookie(STATE_COOKIE);
    if (!expected || expected !== actual) return res.redirect("/login?error=state_mismatch");

    passport.authenticate("facebook", { session: false }, (err: any, user: any) => {
      if (err || !user) return res.redirect("/login?error=facebook");
      setAuthCookie(res, user);
      res.redirect("/");
    })(req, res, next);
  });

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
}
