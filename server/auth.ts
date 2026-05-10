import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "./db";
import {
  users, products, productSizes, productModifiers, sales, pendingOrders, userSettings,
  customers, serviceStaff, serviceRooms, appointments,
  membershipPlans, memberships, membershipCheckIns,
  expenses, shifts, discountCodes, refunds, timeLogs,
  tables, suppliers, purchaseOrders, purchaseOrderItems, userBranches, inviteTokens, auditLogs,
  ingredients, productRecipes, wifiVouchers, payrollPeriods, payrollEntries,
  branches, tenants, rolePermissions, tenantSubscriptions, subscriptionPayments, aiMemories,
} from "@shared/schema";
import { eq, or, inArray, sql } from "drizzle-orm";
import type { Express, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendPasswordResetEmail } from "./email";
import { hashPassword, verifyPassword } from "./crypto";

export const AUTH_COOKIE = "auth_token";

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

export function getBaseUrl(): string {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (appUrl) return appUrl;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) return `https://${domain}`;
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

export function verifyToken(token: string): any {
  const payload = jwt.verify(token, getJwtSecret()) as any;
  return {
    id: payload.id,
    name: payload.name,
    email: payload.email,
    avatar: payload.avatar,
    provider: payload.provider,
    tenantId: payload.tenantId ?? null,
    role: payload.role ?? "owner",
    activeBranchId: payload.activeBranchId ?? null,
  };
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

// Shared cookie options — MUST be identical between setAuthCookie / clearAuthCookie
// or browsers (especially Chrome on HTTPS) silently refuse to delete the cookie,
// which is what made "logout" appear to do nothing on the first click.
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function setAuthCookie(res: Response, user: any, rememberMe = false) {
  const token = signToken(user);
  // rememberMe = false → session ends when browser closes (1 day max)
  // rememberMe = true  → cookie persists for 30 days
  const maxAge = rememberMe
    ? 30 * 24 * 60 * 60 * 1000
    :  1 * 24 * 60 * 60 * 1000;
  res.cookie(AUTH_COOKIE, token, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, AUTH_COOKIE_OPTIONS);
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

/**
 * Wipe every row scoped to the given user IDs, in strict FK order
 * (children → parents). Safe to call with one or many users at once.
 *
 * NOTE: This intentionally does NOT delete the `users` rows themselves —
 * the caller decides when to do that, since "delete tenant" needs to clean
 * tenant-scoped tables in between.
 */
async function deleteUsersData(uids: string[]): Promise<void> {
  if (uids.length === 0) return;

  const userProductIds = (
    await db.select({ id: products.id }).from(products).where(inArray(products.userId, uids))
  ).map(r => r.id);
  const userIngredientIds = (
    await db.select({ id: ingredients.id }).from(ingredients).where(inArray(ingredients.userId, uids))
  ).map(r => r.id);
  const userPoIds = (
    await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(inArray(purchaseOrders.userId, uids))
  ).map(r => r.id);
  const userPayrollPeriodIds = (
    await db.select({ id: payrollPeriods.id }).from(payrollPeriods).where(inArray(payrollPeriods.userId, uids))
  ).map(r => r.id);

  // 1. Deepest leaves
  await db.update(membershipCheckIns).set({ notes: sql`COALESCE(notes, '')` } as any).where(inArray(membershipCheckIns.userId, uids));
  await db.update(timeLogs).set({ deletedAt: new Date().toISOString() } as any).where(inArray(timeLogs.userId, uids));
  await db.update(refunds).set({ status: "refunded" } as any).where(inArray(refunds.userId, uids));
  await db.update(shifts).set({ status: "closed" } as any).where(inArray(shifts.userId, uids));
  await db.update(discountCodes).set({ deletedAt: new Date().toISOString(), isActive: false } as any).where(inArray(discountCodes.userId, uids));
  await db.update(expenses).set({ deletedAt: new Date().toISOString() } as any).where(inArray(expenses.userId, uids));
  await db.update(wifiVouchers).set({ status: "expired" } as any).where(inArray(wifiVouchers.userId, uids));

  // 2. Payroll entries (FK → payrollPeriods.id AND users.id)
  if (userPayrollPeriodIds.length > 0) {
    await db.update(payrollEntries).set({ notes: sql`COALESCE(notes, '')` } as any).where(inArray(payrollEntries.periodId, userPayrollPeriodIds));
  }
  await db.update(payrollEntries).set({ notes: sql`COALESCE(notes, '')` } as any).where(inArray(payrollEntries.employeeUserId, uids));
  await db.update(payrollPeriods).set({ deletedAt: new Date().toISOString(), notes: sql`COALESCE(notes, '')` } as any).where(inArray(payrollPeriods.userId, uids));

  // 3. purchaseOrderItems MUST go before purchaseOrders
  if (userPoIds.length > 0) {
    await db.update(purchaseOrderItems).set({ notes: sql`COALESCE(notes, '')` } as any).where(inArray(purchaseOrderItems.purchaseOrderId, userPoIds));
  }

  // 4. Invite tokens — referenced by both createdBy AND usedBy
  await db.update(inviteTokens).set({ expiresAt: new Date().toISOString() } as any).where(or(
    inArray(inviteTokens.createdBy, uids),
    inArray(inviteTokens.usedBy, uids),
  ));

  // 5. Product children: recipes (FK → products.id, ingredients.id), sizes, modifiers
  if (userProductIds.length > 0) {
    await db.update(productRecipes).set({ deletedAt: new Date().toISOString() } as any).where(inArray(productRecipes.productId, userProductIds));
    await db.update(productSizes).set({ deletedAt: new Date().toISOString() } as any).where(inArray(productSizes.productId, userProductIds));
    await db.update(productModifiers).set({ deletedAt: new Date().toISOString() } as any).where(inArray(productModifiers.productId, userProductIds));
  }
  if (userIngredientIds.length > 0) {
    await db.update(productRecipes).set({ deletedAt: new Date().toISOString() } as any).where(inArray(productRecipes.ingredientId, userIngredientIds));
  }

  // 6. Appointments (refs serviceStaff/Rooms/customers)
  await db.update(appointments).set({ deletedAt: new Date().toISOString() } as any).where(inArray(appointments.userId, uids));

  // 7. Memberships
  await db.update(memberships).set({ deletedAt: new Date().toISOString() } as any).where(inArray(memberships.userId, uids));
  await db.update(membershipPlans).set({ deletedAt: new Date().toISOString(), isActive: false } as any).where(inArray(membershipPlans.userId, uids));

  // 8. Staff & rooms
  await db.update(serviceStaff).set({ deletedAt: new Date().toISOString(), isActive: false } as any).where(inArray(serviceStaff.userId, uids));
  await db.update(serviceRooms).set({ deletedAt: new Date().toISOString() } as any).where(inArray(serviceRooms.userId, uids));

  // 9. Purchase orders & suppliers
  await db.update(purchaseOrders).set({ notes: sql`COALESCE(notes, '')` } as any).where(inArray(purchaseOrders.userId, uids));
  await db.update(suppliers).set({ deletedAt: new Date().toISOString() } as any).where(inArray(suppliers.userId, uids));

  // 10. Pending orders & tables
  await db.update(pendingOrders).set({ deletedAt: new Date().toISOString() } as any).where(inArray(pendingOrders.userId, uids));
  await db.update(tables).set({ deletedAt: new Date().toISOString() } as any).where(inArray(tables.userId, uids));

  // 11. Customers
  await db.update(customers).set({ deletedAt: new Date().toISOString() } as any).where(inArray(customers.userId, uids));

  // 12. Sales, ingredients, products
  await db.update(sales).set({ deletedAt: new Date().toISOString() } as any).where(inArray(sales.userId, uids));
  await db.update(ingredients).set({ deletedAt: new Date().toISOString() } as any).where(inArray(ingredients.userId, uids));
  await db.update(products).set({ deletedAt: new Date().toISOString() } as any).where(inArray(products.userId, uids));

  // 13. Audit logs (no FK — GDPR hygiene)
  await db.update(auditLogs).set({ metadata: { deleted: true } } as any).where(inArray(auditLogs.userId, uids));

  // 14. Settings & branch links
  await db.update(userSettings).set({ onboardingComplete: 0 } as any).where(inArray(userSettings.userId, uids));
  await db.delete(userBranches).where(inArray(userBranches.userId, uids));

  // (caller deletes the user rows themselves)
}

/**
 * Tear down a tenant once all its users' data has already been wiped:
 * branches, role permissions, subscriptions, AI memories, audit logs scoped
 * to the tenant, and finally the tenant row itself.
 *
 * Without this, an owner could "delete their account" but their old store
 * + branches stay in the database forever, and re-registering with the same
 * email re-creates a user with the same deterministic ID who would still
 * see remnants of the orphaned tenant.
 */
async function deleteTenantShell(tenantId: string): Promise<void> {
  await db.delete(userBranches).where(
    inArray(
      userBranches.branchId,
      db.select({ id: branches.id }).from(branches).where(eq(branches.tenantId, tenantId))
    )
  );
  await db.update(branches).set({ deletedAt: new Date().toISOString(), isActive: false } as any).where(eq(branches.tenantId, tenantId));
  await db.delete(rolePermissions).where(eq(rolePermissions.tenantId, tenantId));
  await db.delete(subscriptionPayments).where(eq(subscriptionPayments.tenantId, tenantId));
  await db.delete(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tenantId));
  await db.delete(aiMemories).where(eq(aiMemories.tenantId, tenantId));
  await db.update(auditLogs).set({ metadata: { tenantDeleted: true } } as any).where(eq(auditLogs.tenantId, tenantId));
  await db.update(inviteTokens).set({ expiresAt: new Date().toISOString() } as any).where(eq(inviteTokens.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

function popupResultPage({ ok, error }: { ok: boolean; error?: string }): string {
  const payload = ok
    ? JSON.stringify({ type: "google-auth-ok" })
    : JSON.stringify({ type: "google-auth-error", error: error ?? "unknown" });
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;background:#0f0a1e;color:#fff;font-size:14px}</style>
</head><body><p>${ok ? "Signing you in…" : "Sign-in failed. You can close this window."}</p>
<script>
try{window.opener&&window.opener.postMessage(${payload},"*")}catch(e){}
${ok ? "setTimeout(function(){try{window.close()}catch(e){}},300);" : ""}
</script></body></html>`;
}

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

  // ── Public auth config (client ID safe to expose) ────────────────────────────

  app.get("/api/auth/config", (_req, res) => {
    res.json({
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
      facebookAppId: process.env.FACEBOOK_APP_ID || null,
    });
  });

  // ── Google routes ─────────────────────────────────────────────────────────────

  app.get("/auth/google", (req, res, next) => {
    const isNative = req.query.native === "1";
    const isPopup  = req.query.popup  === "1";
    if (!googleEnabled) {
      if (isPopup) return res.send(popupResultPage({ ok: false, error: "google_not_configured" }));
      return res.redirect("/login?error=google_not_configured");
    }
    try {
      const stateExtra = isNative ? "native" : isPopup ? "popup" : undefined;
      const state = generateState(stateExtra);
      passport.authenticate("google", { scope: ["profile", "email"], state, session: false })(req, res, next);
    } catch (err: any) {
      console.error("[auth] Google initiation error:", err?.message ?? err);
      if (isPopup) return res.send(popupResultPage({ ok: false, error: "google_init" }));
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
    const isPopup  = extra === "popup";

    passport.authenticate("google", { session: false }, (err: any, user: any) => {
      if (err) {
        const msg = String(err?.message ?? err).slice(0, 120);
        console.error("[auth] Google callback error:", msg);
        if (isPopup) {
          return res.send(popupResultPage({ ok: false, error: msg }));
        }
        return res.redirect(`/login?error=google_cb&detail=${encodeURIComponent(msg)}`);
      }
      if (!user) {
        console.warn("[auth] Google callback: no user returned");
        if (isPopup) {
          return res.send(popupResultPage({ ok: false, error: "google_no_user" }));
        }
        return res.redirect("/login?error=google_no_user");
      }
      try {
        if (isNative) {
          const token = signToken(user);
          return res.redirect(`${NATIVE_APP_SCHEME}://auth?token=${encodeURIComponent(token)}`);
        }
        // Popup flow: set cookie (same origin, so cookie carries over to parent)
        // then serve a tiny page that postMessages success to the opener and closes.
        if (isPopup) {
          setAuthCookie(res, user);
          return res.send(popupResultPage({ ok: true }));
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
    const { email, password, rememberMe } = req.body ?? {};
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

      setAuthCookie(res, user, rememberMe === true);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ── Logout & account management ───────────────────────────────────────────────

  app.post("/auth/logout", (_req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  // ── Data export (GDPR/portability) ──────────────────────────────────────────
  // Owners can download a JSON archive of every record tied to their store
  // before they delete the account. Non-owners get just their personal rows.
  app.get("/api/auth/export", async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const uid = (req.user as any).id;

    try {
      const [liveUser] = await db.select().from(users).where(eq(users.id, uid));
      if (!liveUser) return res.status(404).json({ message: "User not found" });

      const tenantId = liveUser.tenantId;
      const isOwnerWithTenant = liveUser.role === "owner" && !!tenantId;

      // Build the list of users whose data to include.
      // Owners get the whole team; everyone else gets just themselves.
      let userIds: string[] = [uid];
      if (isOwnerWithTenant) {
        const tenantUsers = await db
          .select()
          .from(users)
          .where(eq(users.tenantId, tenantId!));
        userIds = Array.from(new Set([uid, ...tenantUsers.map(u => u.id)]));
      }

      // Strip secrets out of user rows before exporting.
      const sanitizeUser = (u: any) => {
        const { passwordHash, resetToken, resetTokenExpires, ...safe } = u;
        return safe;
      };

      const teamUsers = (
        await db.select().from(users).where(inArray(users.id, userIds))
      ).map(sanitizeUser);

      // Fan out queries in parallel — large stores have a lot of rows.
      const [
        productsRows, productSizesRows, productModifiersRows,
        ingredientsRows, productRecipesRows,
        salesRows, refundsRows, pendingOrdersRows,
        customersRows, expensesRows, shiftsRows, discountCodesRows,
        suppliersRows, purchaseOrdersRows, purchaseOrderItemsRows,
        tablesRows, serviceStaffRows, serviceRoomsRows, appointmentsRows,
        membershipPlansRows, membershipsRows, membershipCheckInsRows,
        timeLogsRows, payrollPeriodsRows, payrollEntriesRows,
        userSettingsRows, wifiVouchersRows, userBranchesRows,
      ] = await Promise.all([
        db.select().from(products).where(inArray(products.userId, userIds)),
        db.select().from(productSizes),
        db.select().from(productModifiers),
        db.select().from(ingredients).where(inArray(ingredients.userId, userIds)),
        db.select().from(productRecipes),
        db.select().from(sales).where(inArray(sales.userId, userIds)),
        db.select().from(refunds).where(inArray(refunds.userId, userIds)),
        db.select().from(pendingOrders).where(inArray(pendingOrders.userId, userIds)),
        db.select().from(customers).where(inArray(customers.userId, userIds)),
        db.select().from(expenses).where(inArray(expenses.userId, userIds)),
        db.select().from(shifts).where(inArray(shifts.userId, userIds)),
        db.select().from(discountCodes).where(inArray(discountCodes.userId, userIds)),
        db.select().from(suppliers).where(inArray(suppliers.userId, userIds)),
        db.select().from(purchaseOrders).where(inArray(purchaseOrders.userId, userIds)),
        db.select().from(purchaseOrderItems),
        db.select().from(tables).where(inArray(tables.userId, userIds)),
        db.select().from(serviceStaff).where(inArray(serviceStaff.userId, userIds)),
        db.select().from(serviceRooms).where(inArray(serviceRooms.userId, userIds)),
        db.select().from(appointments).where(inArray(appointments.userId, userIds)),
        db.select().from(membershipPlans).where(inArray(membershipPlans.userId, userIds)),
        db.select().from(memberships).where(inArray(memberships.userId, userIds)),
        db.select().from(membershipCheckIns).where(inArray(membershipCheckIns.userId, userIds)),
        db.select().from(timeLogs).where(inArray(timeLogs.userId, userIds)),
        db.select().from(payrollPeriods).where(inArray(payrollPeriods.userId, userIds)),
        db.select().from(payrollEntries).where(inArray(payrollEntries.employeeUserId, userIds)),
        db.select().from(userSettings).where(inArray(userSettings.userId, userIds)),
        db.select().from(wifiVouchers).where(inArray(wifiVouchers.userId, userIds)),
        db.select().from(userBranches).where(inArray(userBranches.userId, userIds)),
      ]);

      // Filter the "global" child tables down to just the rows that reference
      // entities we own — this avoids leaking other tenants' data.
      const productIdSet = new Set(productsRows.map(p => p.id));
      const ingredientIdSet = new Set(ingredientsRows.map(i => i.id));
      const purchaseOrderIdSet = new Set(purchaseOrdersRows.map(po => po.id));

      const filteredSizes = productSizesRows.filter(r => productIdSet.has(r.productId));
      const filteredModifiers = productModifiersRows.filter(r => productIdSet.has(r.productId));
      const filteredRecipes = productRecipesRows.filter(
        r => productIdSet.has(r.productId) && ingredientIdSet.has(r.ingredientId)
      );
      const filteredPoItems = purchaseOrderItemsRows.filter(r =>
        purchaseOrderIdSet.has(r.purchaseOrderId)
      );

      // Tenant-scoped tables (only for owners with a tenant).
      let tenantData: Record<string, any> = {};
      if (isOwnerWithTenant) {
        const [
          tenantRow, branchesRows, rolePermissionsRows,
          tenantSubscriptionsRows, subscriptionPaymentsRows,
          aiMemoriesRows, auditLogsRows,
        ] = await Promise.all([
          db.select().from(tenants).where(eq(tenants.id, tenantId!)),
          db.select().from(branches).where(eq(branches.tenantId, tenantId!)),
          db.select().from(rolePermissions).where(eq(rolePermissions.tenantId, tenantId!)),
          db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tenantId!)),
          db.select().from(subscriptionPayments).where(eq(subscriptionPayments.tenantId, tenantId!)),
          db.select().from(aiMemories).where(eq(aiMemories.tenantId, tenantId!)),
          db.select().from(auditLogs).where(eq(auditLogs.tenantId, tenantId!)),
        ]);
        tenantData = {
          tenant: tenantRow[0] ?? null,
          branches: branchesRows,
          rolePermissions: rolePermissionsRows,
          tenantSubscriptions: tenantSubscriptionsRows,
          subscriptionPayments: subscriptionPaymentsRows,
          aiMemories: aiMemoriesRows,
          auditLogs: auditLogsRows,
        };
      }

      const archive = {
        meta: {
          exportedAt: new Date().toISOString(),
          schemaVersion: 1,
          accountId: liveUser.id,
          accountEmail: liveUser.email,
          accountRole: liveUser.role,
          tenantId: tenantId ?? null,
          notes: isOwnerWithTenant
            ? "Owner export — includes the entire store, branches, team, and tenant data."
            : "Personal export — limited to records owned by your account.",
        },
        account: sanitizeUser(liveUser),
        users: teamUsers,
        userBranches: userBranchesRows,
        userSettings: userSettingsRows,
        ...tenantData,
        products: productsRows,
        productSizes: filteredSizes,
        productModifiers: filteredModifiers,
        ingredients: ingredientsRows,
        productRecipes: filteredRecipes,
        sales: salesRows,
        refunds: refundsRows,
        pendingOrders: pendingOrdersRows,
        customers: customersRows,
        expenses: expensesRows,
        shifts: shiftsRows,
        discountCodes: discountCodesRows,
        suppliers: suppliersRows,
        purchaseOrders: purchaseOrdersRows,
        purchaseOrderItems: filteredPoItems,
        tables: tablesRows,
        serviceStaff: serviceStaffRows,
        serviceRooms: serviceRoomsRows,
        appointments: appointmentsRows,
        membershipPlans: membershipPlansRows,
        memberships: membershipsRows,
        membershipCheckIns: membershipCheckInsRows,
        timeLogs: timeLogsRows,
        payrollPeriods: payrollPeriodsRows,
        payrollEntries: payrollEntriesRows,
        wifiVouchers: wifiVouchersRows,
      };

      const safeName = (liveUser.email || liveUser.id)
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "account";
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `artixpos-export-${safeName}-${stamp}.json`;

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.send(JSON.stringify(archive, null, 2));
    } catch (err: any) {
      console.error("[export-account] failed:", err?.message ?? err);
      next(err);
    }
  });

  app.delete("/api/auth/account", async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const uid = (req.user as any).id;
    try {
      // Look up the live user row — JWT can be stale (e.g. role changed since
      // login). We need the up-to-date tenantId + role to decide whether to
      // also tear down the whole tenant.
      const [liveUser] = await db.select().from(users).where(eq(users.id, uid));
      if (!liveUser) {
        // Already gone — just make sure the cookie is cleared and reply OK.
        clearAuthCookie(res);
        return res.json({ ok: true });
      }

      const tenantId = liveUser.tenantId;
      const isOwnerWithTenant = liveUser.role === "owner" && !!tenantId;

      // Build the list of users whose data we need to delete.
      //   • owners: every user attached to the tenant (the team comes down too)
      //   • everyone else: just themselves
      let userIdsToWipe: string[] = [uid];
      if (isOwnerWithTenant) {
        const tenantUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.tenantId, tenantId!));
        if (tenantUsers.length > 0) {
          userIdsToWipe = Array.from(new Set([uid, ...tenantUsers.map(u => u.id)]));
        }
      }

      await deleteUsersData(userIdsToWipe);

      // Owner accounts also delete the tenant + branches + tenant-scoped tables,
      // otherwise the next time the same email re-registers and goes through
      // onboarding they'd see the orphaned old store.
      if (isOwnerWithTenant) {
        await deleteTenantShell(tenantId!);
      }

      // Finally remove the user rows themselves
      if (userIdsToWipe.length > 0) {
        await db.delete(users).where(inArray(users.id, userIdsToWipe));
      }

      clearAuthCookie(res);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[delete-account] failed:", err?.message ?? err);
      next(err);
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if ((req as any).isBanned) {
      return res.status(403).json({ banned: true, message: "Your account has been suspended for violating our Terms of Service." });
    }
    if (!req.user) return res.status(401).json({ user: null });
    const u = req.user as any;

    // Resolve the active branch's businessType / businessSubType so the client
    // can adapt navigation, terminology, and quick actions on a per-branch
    // basis (e.g. show "Tables" only on a cafe branch, "Bookings" only on a
    // salon branch). Falls back silently when the branch is missing.
    let activeBranch: { id: number; name: string; businessType: string | null; businessSubType: string | null } | null = null;
    try {
      if (u.activeBranchId && u.tenantId) {
        const { branches } = await import("@shared/schema");
        const { and, eq } = await import("drizzle-orm");
        const [b] = await db
          .select({
            id: branches.id,
            name: branches.name,
            businessType: branches.businessType,
            businessSubType: branches.businessSubType,
          })
          .from(branches)
          .where(and(eq(branches.id, u.activeBranchId), eq(branches.tenantId, u.tenantId)))
          .limit(1);
        if (b) activeBranch = b;
      }
    } catch (err) {
      // Don't fail the auth request if the branch lookup errors out.
      console.warn("[auth/me] active branch lookup failed:", (err as Error).message);
    }

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
        activeBranch,
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
