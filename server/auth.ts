import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "./db";
import {
  users, products, productSizes, productModifiers, sales, pendingOrders, userSettings,
  customers, serviceStaff, serviceRooms, appointments,
  membershipPlans, memberships, membershipCheckIns,
  expenses, shifts, discountCodes, refunds, timeLogs,
  tables, suppliers, purchaseOrders, purchaseOrderItems, userBranches, inviteTokens, auditLogs,
} from "@shared/schema";
import { eq, or, inArray } from "drizzle-orm";
import type { Express, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendPasswordResetEmail } from "./email";
import { hashPassword, verifyPassword } from "./crypto";

const AUTH_COOKIE = "auth_token";

let _ephemeralSecret: string | undefined;

function getJwtSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET environment variable is required in production");
    }
    if (!_ephemeralSecret) {
      _ephemeralSecret = crypto.randomBytes(32).toString("hex");
      console.warn("[auth] WARNING: SESSION_SECRET is not set — using an ephemeral random secret. Sessions will be invalidated on restart.");
    }
    return _ephemeralSecret;
  }
  return secret;
}

function getBaseUrl(): string {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (process.env.NODE_ENV === "production" && appUrl) return appUrl;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (domain) return `https://${domain}`;
  if (appUrl) return appUrl;
  return "http://localhost:5000";
}

function generateState(extra?: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = extra ? `${nonce}|${extra}` : nonce;
  const hmac = crypto.createHmac("sha256", getJwtSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${hmac}`).toString("base64url");
}

function verifyAndParseState(state: string | undefined): { valid: boolean; extra?: string } {
  if (!state) return { valid: false };
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon === -1) return { valid: false };
    const payload = decoded.slice(0, lastColon);
    const receivedHmac = decoded.slice(lastColon + 1);
    if (!payload || !receivedHmac) return { valid: false };
    const expectedHmac = crypto.createHmac("sha256", getJwtSecret()).update(payload).digest("hex");
    const a = Buffer.from(receivedHmac.padEnd(64, "0").slice(0, 64), "hex");
    const b = Buffer.from(expectedHmac, "hex");
    if (a.length !== b.length) return { valid: false };
    if (!crypto.timingSafeEqual(a, b)) return { valid: false };
    const pipeIdx = payload.indexOf("|");
    const extra = pipeIdx !== -1 ? payload.slice(pipeIdx + 1) : undefined;
    return { valid: true, extra };
  } catch {
    return { valid: false };
  }
}

export function signToken(user: any): string {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      provider: user.provider,
      tenantId: user.tenantId ?? null,
      role: user.role ?? "owner",
      activeBranchId: user.activeBranchId ?? null,
    },
    getJwtSecret(),
    { expiresIn: "30d" }
  );
}

export function setAuthCookie(res: Response, user: any) {
  const token = signToken(user);
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1 * 24 * 60 * 60 * 1000,
  });
}

// ── Password hashing ──────────────────────────────────────────────────────────
// hashPassword and verifyPassword are imported from ./crypto above

// ── In-memory banned users set ────────────────────────────────────────────────
export const bannedUserIds = new Set<string>();

// Seed banned users from DB so the set survives server restarts
db.select({ id: users.id })
  .from(users)
  .where(eq(users.isBanned, true))
  .then((rows) => {
    rows.forEach((r) => bannedUserIds.add(String(r.id)));
    if (rows.length > 0) console.log(`[auth] Loaded ${rows.length} banned user(s) into memory`);
  })
  .catch((err) => console.error("[auth] Failed to seed banned users from DB:", err));

export function jwtAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  let token = (req as any).cookies?.[AUTH_COOKIE];

  if (!token) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (token) {
    try {
      const payload = jwt.verify(token, getJwtSecret()) as any;
      if (bannedUserIds.has(payload.id)) {
        (req as any).isBanned = true;
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
      if (req.path.startsWith("/api/")) {
        import("./admin-storage").then(m => m.updateLastSeen(payload.id)).catch(() => {});
      }
    } catch {
      // invalid/expired token — ignore
    }
  }
  next();
}

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

const NATIVE_APP_SCHEME = process.env.NATIVE_APP_SCHEME || "com.cafebara.app";

export function setupAuth(app: Express) {
  const baseUrl = getBaseUrl();
  console.log(`[auth] Using base URL: ${baseUrl}`);

  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  // ── Google strategy ───────────────────────────────────────────────────────────

  if (googleEnabled) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: `${baseUrl}/auth/google/callback`,
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

  // ── Google routes ─────────────────────────────────────────────────────────────

  app.get("/auth/google", (req, res, next) => {
    if (!googleEnabled) return res.redirect("/login?error=google_not_configured");
    try {
      const isNative = req.query.native === "1";
      const state = generateState(isNative ? "native" : undefined);
      passport.authenticate("google", { scope: ["profile", "email"], state, session: false })(req, res, next);
    } catch (err: any) {
      console.error("[auth] Google initiation error:", err?.message ?? err);
      res.redirect("/login?error=google_init");
    }
  });

  app.get("/auth/google/callback", (req, res, next) => {
    if (!googleEnabled) return res.redirect("/login?error=google_not_configured");

    const state = req.query.state as string | undefined;
    const { valid, extra } = verifyAndParseState(state);
    if (!valid) {
      console.warn("[auth] Google state verification failed");
      return res.redirect("/login?error=state_mismatch");
    }
    const isNative = extra === "native";

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
        if (isNative) {
          const token = signToken(user);
          return res.redirect(`${NATIVE_APP_SCHEME}://auth?token=${encodeURIComponent(token)}`);
        }
        setAuthCookie(res, user);
        return res.redirect("/");
      } catch (cookieErr: any) {
        console.error("[auth] Cookie error:", cookieErr?.message ?? cookieErr);
        return res.redirect("/login?error=cookie");
      }
    })(req, res, next);
  });

  // ── Native Google token verification ─────────────────────────────────────────

  app.post("/api/auth/google/native", async (req, res, next) => {
    const { idToken } = req.body ?? {};
    if (!idToken || typeof idToken !== "string") {
      return res.status(400).json({ message: "idToken is required" });
    }
    try {
      const googleRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
      );
      if (!googleRes.ok) {
        return res.status(401).json({ message: "Invalid Google ID token" });
      }
      const payload = await googleRes.json() as any;
      if (!payload.sub) {
        return res.status(401).json({ message: "Invalid token payload" });
      }
      if (process.env.GOOGLE_CLIENT_ID && payload.aud !== process.env.GOOGLE_CLIENT_ID) {
        return res.status(401).json({ message: "Token audience mismatch" });
      }
      const user = await findOrCreateUser({
        id: `google_${payload.sub}`,
        email: payload.email ?? null,
        name: payload.name ?? null,
        avatar: payload.picture ?? null,
        provider: "google",
        providerId: payload.sub,
      });
      const token = signToken(user);
      res.json({ token });
    } catch (err) {
      next(err);
    }
  });

  // ── Email / Password register & login ────────────────────────────────────────

  app.post("/api/auth/register", async (req, res, next) => {
    const { name, email, password } = req.body ?? {};
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ message: "Name must be at least 2 characters." });
    }
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "A valid email address is required." });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const userId = `email_${crypto.createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 24)}`;

      const [existing] = await db.select().from(users).where(eq(users.id, userId));
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists." });
      }

      const passwordHash = await hashPassword(password);
      await db.insert(users).values({
        id: userId,
        email: normalizedEmail,
        name: name.trim(),
        avatar: null,
        provider: "email",
        providerId: normalizedEmail,
        passwordHash,
      } as any);

      const [created] = await db.select().from(users).where(eq(users.id, userId));
      if (!created) throw new Error("User not found after insert");

      setAuthCookie(res, created);
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/login", async (req, res, next) => {
    const { email, password } = req.body ?? {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email is required." });
    }
    if (!password || typeof password !== "string") {
      return res.status(400).json({ message: "Password is required." });
    }
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const userId = `email_${crypto.createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 24)}`;

      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || user.provider !== "email" || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      if ((user as any).isBanned) {
        return res.status(403).json({ banned: true, message: "This account has been suspended for violating our Terms of Service. If you believe this is a mistake, please contact support." });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      setAuthCookie(res, user);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
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
      // Pre-fetch IDs needed for cascading child-table deletes
      const userProductIds = (await db.select({ id: products.id }).from(products).where(eq(products.userId, uid))).map(r => r.id);
      const userPoIds = (await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.userId, uid))).map(r => r.id);

      // Delete in strict FK dependency order (children before parents)

      // 1. Deepest leaves
      await db.delete(membershipCheckIns).where(eq(membershipCheckIns.userId, uid));
      await db.delete(timeLogs).where(eq(timeLogs.userId, uid));
      await db.delete(refunds).where(eq(refunds.userId, uid));
      await db.delete(shifts).where(eq(shifts.userId, uid));
      await db.delete(discountCodes).where(eq(discountCodes.userId, uid));
      await db.delete(expenses).where(eq(expenses.userId, uid));

      // 2. purchaseOrderItems MUST go before purchaseOrders (FK: purchase_order_id → purchase_orders.id)
      if (userPoIds.length > 0) {
        await db.delete(purchaseOrderItems).where(inArray(purchaseOrderItems.purchaseOrderId, userPoIds));
      }

      // 3. inviteTokens references users.id via both createdBy and usedBy columns
      await db.delete(inviteTokens).where(or(eq(inviteTokens.createdBy, uid), eq(inviteTokens.usedBy, uid)));

      // 4. productSizes / productModifiers have no FK constraint but would orphan without this
      if (userProductIds.length > 0) {
        await db.delete(productSizes).where(inArray(productSizes.productId, userProductIds));
        await db.delete(productModifiers).where(inArray(productModifiers.productId, userProductIds));
      }

      // 5. Appointments (refs serviceStaff, serviceRooms, customers)
      await db.delete(appointments).where(eq(appointments.userId, uid));

      // 6. Memberships (refs customers, membershipPlans)
      await db.delete(memberships).where(eq(memberships.userId, uid));
      await db.delete(membershipPlans).where(eq(membershipPlans.userId, uid));

      // 7. Staff & rooms
      await db.delete(serviceStaff).where(eq(serviceStaff.userId, uid));
      await db.delete(serviceRooms).where(eq(serviceRooms.userId, uid));

      // 8. Purchase orders & suppliers
      await db.delete(purchaseOrders).where(eq(purchaseOrders.userId, uid));
      await db.delete(suppliers).where(eq(suppliers.userId, uid));

      // 9. Pending orders & tables
      await db.delete(pendingOrders).where(eq(pendingOrders.userId, uid));
      await db.delete(tables).where(eq(tables.userId, uid));

      // 10. Customers (after all refs cleared)
      await db.delete(customers).where(eq(customers.userId, uid));

      // 11. Core transaction data
      await db.delete(sales).where(eq(sales.userId, uid));
      await db.delete(products).where(eq(products.userId, uid));

      // 12. Audit logs (no FK — GDPR hygiene)
      await db.delete(auditLogs).where(eq(auditLogs.userId, uid));

      // 13. Settings & branch links
      await db.delete(userSettings).where(eq(userSettings.userId, uid));
      await db.delete(userBranches).where(eq(userBranches.userId, uid));

      // 14. Finally the user row itself
      await db.delete(users).where(eq(users.id, uid));
      res.clearCookie(AUTH_COOKIE);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/auth/me", (req, res) => {
    if ((req as any).isBanned) {
      return res.status(403).json({ banned: true, message: "Your account has been suspended for violating our Terms of Service." });
    }
    if (!req.user) return res.status(401).json({ user: null });
    const u = req.user as any;
    res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        provider: u.provider,
        tenantId: u.tenantId ?? null,
        role: u.role ?? "owner",
        activeBranchId: u.activeBranchId ?? null,
      }
    });
  });

  app.get("/api/auth/db-check", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      await db.select().from(users).limit(1);
      res.json({ ok: true, db: "connected" });
    } catch {
      res.status(500).json({ ok: false, error: "Database connection check failed" });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res, next) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required." });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase().trim()))
        .limit(1);

      if (user) {
        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

        await db.update(users)
          .set({ resetToken: token, resetTokenExpires: expires } as any)
          .where(eq(users.id, user.id));

        const baseUrl = getBaseUrl();
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;

        const sent = await sendPasswordResetEmail(user.email!, resetUrl);

        if (!sent) {
          console.log(`[auth] Password reset requested for user ${user.id} — SMTP not configured, token not delivered.`);
        }
      }

      res.json({ message: "If an account with that email exists, a reset link has been sent." });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/reset-password", async (req, res, next) => {
    try {
      const { token, password } = req.body;
      if (!token || !password || typeof token !== "string" || typeof password !== "string") {
        return res.status(400).json({ message: "Token and password are required." });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.resetToken, token))
        .limit(1);

      if (!user || !user.resetTokenExpires) {
        return res.status(400).json({ message: "Invalid or expired reset link." });
      }

      if (new Date(user.resetTokenExpires) < new Date()) {
        return res.status(400).json({ message: "Reset link has expired. Please request a new one." });
      }

      const passwordHash = await hashPassword(password);

      await db.update(users)
        .set({ passwordHash, resetToken: null, resetTokenExpires: null } as any)
        .where(eq(users.id, user.id));

      res.json({ message: "Password updated successfully. You can now sign in." });
    } catch (err) {
      next(err);
    }
  });
}
