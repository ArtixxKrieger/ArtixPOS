import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db, pool } from "../db";
import { runAsAdmin } from "../tenant-context";
import {
  users,
  products,
  productSizes,
  productModifiers,
  sales,
  pendingOrders,
  userSettings,
  customers,
  serviceStaff,
  serviceRooms,
  appointments,
  membershipPlans,
  memberships,
  membershipCheckIns,
  expenses,
  shifts,
  discountCodes,
  refunds,
  timeLogs,
  tables,
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  userBranches,
  ingredients,
  productRecipes,
  wifiVouchers,
  payrollPeriods,
  payrollEntries,
  branches,
  tenants,
  rolePermissions,
  tenantSubscriptions,
  subscriptionPayments,
  auditLogs,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import type { Express, Request } from "express";
import crypto from "crypto";
import { sendPasswordResetEmail, sendVerificationEmail, sendWelcomeEmail } from "../email";
import { hashPassword, verifyPassword } from "../crypto";
import { cache, settingsCacheKey } from "../cache";
import { invalidateTenantCache } from "../storage";
import {
  bruteForceGuard,
  recordFailedAttempt,
  recordSuccessfulLogin,
  recordEmailFailedAttempt,
  recordEmailSuccessfulLogin,
  checkEmailBlocked,
} from "../brute-force";
import { isDisposableEmail } from "../email-domain-validator";
import {
  AUTH_COOKIE,
  _revokedJtis,
  revokeToken,
  getJwtSecret,
  getBaseUrl,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  registerSseConnection,
  unregisterSseConnection,
} from "./core";
import {
  findOrCreateUser,
  generateState,
  verifyAndParseState,
  popupResultPage,
  NATIVE_APP_SCHEME,
} from "./oauth";
import { deleteUsersData, deleteTenantShell } from "./delete-data";
import jwt from "jsonwebtoken";
import { sanitizeUserError, sanitizeUserErrorForRedirect } from "../lib/route-utils";
import { requireAuth } from "../middleware";
import {
  createSession,
  deleteSession,
  deleteAllOtherSessions,
  updateSessionJti,
  listUserSessions,
  getSessionById,
} from "./sessions";

function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyui",
  "letmein1",
  "welcome1",
  "admin1234",
  "iloveyou1",
  "monkey123",
  "dragon123",
  "master123",
  "sunshine1",
  "princess1",
  "shadow123",
  "baseball",
  "football",
  "superman1",
  "batman123",
  "trustno1",
  "starwars1",
]);

function validatePasswordStrength(password: string, email?: string): string | null {
  if (!password || typeof password !== "string") return "Password is required.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password must be under 128 characters.";

  const lower = /[a-z]/.test(password);
  const upper = /[A-Z]/.test(password);
  const digit = /[0-9]/.test(password);
  const symbol = /[^a-zA-Z0-9]/.test(password);
  const classes = [lower, upper, digit, symbol].filter(Boolean).length;

  if (classes < 2) {
    return "Password must include at least two of: uppercase letters, lowercase letters, numbers, or symbols.";
  }

  const normalized = password.toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) {
    return "This password is too common. Please choose something more unique.";
  }

  if (email) {
    const emailLocal = email.split("@")[0].toLowerCase();
    if (emailLocal.length >= 4 && normalized.includes(emailLocal)) {
      return "Password should not contain your email address.";
    }
  }

  return null;
}

async function logAuthEvent(opts: {
  userId: string;
  tenantId: string | null;
  action: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const tid = opts.tenantId ?? "system";
  try {
    const { createAuditLog } = await import("../admin-storage");
    await createAuditLog({
      tenantId: tid,
      userId: opts.userId,
      action: opts.action,
      entity: "auth",
      metadata: opts.metadata,
    });
  } catch {}
}

export function setupAuth(app: Express) {
  const baseUrl = getBaseUrl();
  console.log(`[auth] Using base URL: ${baseUrl}`);

  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  if (googleEnabled) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: `${baseUrl}/auth/google/callback`,
          store: {
            store: (
              _req: unknown,
              _state: unknown,
              _meta: unknown,
              cb: (err: unknown, code: string) => void,
            ) => cb(null, crypto.randomBytes(4).toString("hex")),
            verify: (
              _req: unknown,
              _state: unknown,
              cb: (err: unknown, valid: boolean, meta: unknown) => void,
            ) => cb(null, true, {}),
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
            return done(null, user as any);
          } catch (err: unknown) {
            console.error(
              "[auth] Google strategy error:",
              err instanceof Error ? err.message : String(err),
            );
            return done(err as Error);
          }
        },
      ),
    );
    console.log("[auth] Google OAuth strategy registered");
  } else {
    console.log(
      "[auth] Google OAuth not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET missing)",
    );
  }

  app.get("/api/auth/config", (_req, res) => {
    res.json({
      googleClientId: process.env.GOOGLE_CLIENT_ID || null,
      facebookAppId: process.env.FACEBOOK_APP_ID || null,
    });
  });

  app.get("/auth/google", (req, res, next) => {
    const isNative = req.query.native === "1";
    const isPopup = req.query.popup === "1";
    if (!googleEnabled) {
      if (isPopup) return res.send(popupResultPage({ ok: false, error: "google_not_configured" }));
      return res.redirect("/login?error=google_not_configured");
    }
    try {
      const stateExtra = isNative ? "native" : isPopup ? "popup" : undefined;
      const state = generateState(stateExtra);
      passport.authenticate("google", { scope: ["profile", "email"], state, session: false })(
        req,
        res,
        next,
      );
    } catch (err: unknown) {
      console.error(
        "[auth] Google initiation error:",
        err instanceof Error ? err.message : String(err),
      );
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
    const isPopup = extra === "popup";

    passport.authenticate(
      "google",
      { session: false },
      (err: unknown, user: Express.User | false | null) => {
        if (err) {
          console.error(
            "[auth] Google callback error:",
            err instanceof Error ? err.message : String(err),
          );
          const friendly = sanitizeUserError(err);
          if (isPopup) {
            return res.send(popupResultPage({ ok: false, error: friendly }));
          }
          return res.redirect(
            `/login?error=google_cb&detail=${encodeURIComponent(sanitizeUserErrorForRedirect(err))}`,
          );
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
            const token = signToken(user, true);
            return res.redirect(`${NATIVE_APP_SCHEME}://auth?token=${encodeURIComponent(token)}`);
          }
          if (isPopup) {
            const _popupToken = setAuthCookie(res, user, true);
            createSession(_popupToken, user.id, getClientIp(req), req.headers["user-agent"]).catch(() => {});
            return res.send(popupResultPage({ ok: true }));
          }
          const _oauthToken = setAuthCookie(res, user, true);
          createSession(_oauthToken, user.id, getClientIp(req), req.headers["user-agent"]).catch(() => {});
          return res.redirect("/");
        } catch (cookieErr: any) {
          console.error("[auth] Cookie error:", cookieErr?.message ?? cookieErr);
          return res.redirect("/login?error=cookie");
        }
      },
    )(req, res, next);
  });

  app.post("/api/auth/google/native", async (req, res, next) => {
    const { idToken } = req.body ?? {};
    if (!idToken || typeof idToken !== "string") {
      return res.status(400).json({ message: "idToken is required" });
    }
    try {
      const googleRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      );
      if (!googleRes.ok) {
        return res.status(401).json({ message: "Invalid Google ID token" });
      }
      const payload = (await googleRes.json()) as any;
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

      const token = signToken(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          provider: user.provider,
          tenantId: user.tenantId,
          role: user.role ?? "owner",
          activeBranchId: (user as any).activeBranchId ?? null,
        },
        true,
      );
      createSession(token, user.id, getClientIp(req), req.headers["user-agent"]).catch(() => {});
      res.json({ token });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/register", async (req, res, next) => {
    const { name, email, password } = req.body ?? {};
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ message: "Name must be at least 2 characters." });
    }
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "A valid email address is required." });
    }
    if (isDisposableEmail(email)) {
      return res.status(400).json({
        message:
          "Temporary or disposable email addresses are not allowed. Please use a permanent email address (e.g. Gmail, Yahoo, Outlook).",
      });
    }
    const pwError = validatePasswordStrength(password, email);
    if (pwError) return res.status(400).json({ message: pwError });
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const userId = `email_${crypto.createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 24)}`;

      const created = await runAsAdmin(pool, async (adminDb) => {
        const [existing] = await adminDb.select().from(users).where(eq(users.id, userId));
        if (existing) return null;

        const passwordHash = await hashPassword(password);
        await adminDb.insert(users).values({
          id: userId,
          email: normalizedEmail,
          name: name.trim(),
          avatar: null,
          provider: "email",
          providerId: normalizedEmail,
          passwordHash,
          emailVerified: true,
        } as any);

        const [row] = await adminDb.select().from(users).where(eq(users.id, userId));
        if (!row) throw new Error("User not found after insert");
        return row;
      });

      if (!created) {
        return res.status(409).json({
          message:
            "Unable to create account. Please try signing in, or use a different email address.",
        });
      }

      const verifyBaseUrl = getBaseUrl();
      const dashboardUrl = `${verifyBaseUrl}/`;
      sendWelcomeEmail(normalizedEmail, name.trim(), dashboardUrl).catch((err) => {
        console.error("[auth] Failed to send welcome email:", err);
      });

      const registerUser = {
        id: created.id,
        name: created.name ?? null,
        email: created.email ?? null,
        avatar: created.avatar ?? null,
        provider: created.provider,
        tenantId: (created as any).tenantId ?? null,
        role: created.role ?? "owner",
        activeBranchId: (created as any).activeBranchId ?? null,
        emailVerified: true,
      };
      const registerToken = setAuthCookie(res, registerUser);
      createSession(registerToken, created.id, getClientIp(req), req.headers["user-agent"]).catch(() => {});
      logAuthEvent({
        userId: created.id,
        tenantId: (created as any).tenantId ?? null,
        action: "register",
        metadata: { provider: "email" },
      });
      res.status(201).json({
        ok: true,
        emailVerified: true,
        token: registerToken,
        user: {
          id: created.id,
          name: created.name ?? null,
          email: created.email ?? null,
          avatar: created.avatar ?? null,
          provider: created.provider,
          tenantId: (created as any).tenantId ?? null,
          role: (created as any).role ?? "owner",
          activeBranchId: (created as any).activeBranchId ?? null,
          activeBranch: null,
          emailVerified: true,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  const resendCooldown = new Map<string, number>();
  setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [uid, ts] of resendCooldown) {
      if (ts < cutoff) resendCooldown.delete(uid);
    }
  }, 5 * 60_000).unref();

  app.get("/api/auth/verify-email", async (req, res, next) => {
    const token = req.query.token as string | undefined;
    if (!token) return res.status(400).json({ message: "Token is required.", code: "MISSING" });
    try {
      const [user] = await runAsAdmin(pool, async (adminDb) =>
        adminDb.select().from(users).where(eq(users.emailVerificationToken, token)).limit(1),
      );

      if (!user)
        return res.status(400).json({ message: "Invalid verification link.", code: "INVALID" });
      if ((user as any).emailVerified)
        return res.status(200).json({ ok: true, alreadyVerified: true });

      const expires = (user as any).emailVerificationExpires;
      if (expires && new Date(expires) < new Date()) {
        return res
          .status(400)
          .json({ message: "This link has expired. Please request a new one.", code: "EXPIRED" });
      }

      await runAsAdmin(pool, async (adminDb) =>
        (adminDb.update(users) as any)
          .set({
            emailVerified: true,
            emailVerificationToken: null,
            emailVerificationExpires: null,
          })
          .where(eq(users.id, user.id)),
      );

      const _verifyToken = setAuthCookie(res, {
        id: user.id,
        name: user.name ?? null,
        email: user.email ?? null,
        avatar: user.avatar ?? null,
        provider: user.provider,
        tenantId: (user as any).tenantId ?? null,
        role: user.role ?? "owner",
        activeBranchId: (user as any).activeBranchId ?? null,
        emailVerified: true,
      });
      createSession(_verifyToken, user.id, getClientIp(req), req.headers["user-agent"]).catch(() => {});

      logAuthEvent({
        userId: user.id,
        tenantId: (user as any).tenantId ?? null,
        action: "email_verified",
        metadata: {},
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/resend-verification", async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Login required." });
    const userId = req.user.id;
    try {
      const [user] = await runAsAdmin(pool, async (adminDb) =>
        adminDb.select().from(users).where(eq(users.id, userId)).limit(1),
      );
      if (!user) return res.status(404).json({ message: "User not found." });
      if ((user as any).emailVerified)
        return res.status(400).json({ message: "Email is already verified." });
      if (user.provider !== "email")
        return res.status(400).json({ message: "Not an email account." });
      if (!user.email) return res.status(400).json({ message: "No email on record." });

      const last = resendCooldown.get(userId) ?? 0;
      const waitSecs = Math.ceil((last + 60_000 - Date.now()) / 1000);
      if (waitSecs > 0) {
        return res
          .status(429)
          .set("Retry-After", String(waitSecs))
          .json({
            message: `Please wait ${waitSecs} second(s) before requesting another email.`,
          });
      }

      const newToken = crypto.randomBytes(32).toString("hex");
      const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await runAsAdmin(pool, async (adminDb) =>
        (adminDb.update(users) as any)
          .set({ emailVerificationToken: newToken, emailVerificationExpires: newExpires })
          .where(eq(users.id, userId)),
      );

      resendCooldown.set(userId, Date.now());

      const currentBaseUrl = getBaseUrl();
      const verifyUrl = `${currentBaseUrl}/verify-email?token=${newToken}`;
      sendVerificationEmail(user.email, verifyUrl).catch((err) => {
        console.error("[auth] resend verification email failed:", err);
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/login", bruteForceGuard, async (req, res, next) => {
    const ip = getClientIp(req);
    const { email, password, rememberMe } = req.body ?? {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email is required." });
    }
    if (!password || typeof password !== "string") {
      return res.status(400).json({ message: "Password is required." });
    }
    try {
      const normalizedEmail = email.trim().toLowerCase();

      const emailBlock = await checkEmailBlocked(normalizedEmail);
      if (emailBlock.blocked) {
        return res
          .status(429)
          .set("Retry-After", String(emailBlock.retryAfterSecs))
          .json({
            message: `Too many failed attempts for this account. Try again in ${Math.ceil(emailBlock.retryAfterSecs / 60)} minute(s).`,
            retryAfter: emailBlock.retryAfterSecs,
          });
      }

      // Look up by email, not by the "email_<hash>" id we'd construct for a
      // fresh email/password signup. An account that originally signed up
      // via Google has an id like "google_<id>" — if it later sets a
      // password via "Forgot password", that password lives on the SAME
      // row, keyed by its original google_ id, not an email_ id. Looking up
      // by id here would silently miss that account and always report
      // "Invalid email or password" even with the correct password.
      const user = await runAsAdmin(pool, async (adminDb) => {
        const [row] = await adminDb
          .select()
          .from(users)
          .where(eq(users.email, normalizedEmail))
          .limit(1);
        return row ?? null;
      });

      // Any account with a passwordHash set can log in with a password,
      // regardless of which provider it originally signed up with (e.g. a
      // Google account that later set a password via "Forgot password").
      if (!user || !user.passwordHash) {
        recordFailedAttempt(ip);
        recordEmailFailedAttempt(normalizedEmail);
        return res.status(401).json({ message: "Invalid email or password." });
      }

      if (user.isBanned) {
        return res.status(403).json({
          banned: true,
          message:
            "This account has been suspended for violating our Terms of Service. If you believe this is a mistake, please contact support.",
        });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        recordFailedAttempt(ip);
        recordEmailFailedAttempt(normalizedEmail);
        logAuthEvent({
          userId: user.id,
          tenantId: user.tenantId ?? null,
          action: "login_failed",
          metadata: { ip, reason: "invalid_password" },
        });
        return res.status(401).json({ message: "Invalid email or password." });
      }

      recordSuccessfulLogin(ip);
      recordEmailSuccessfulLogin(normalizedEmail);
      const loginToken = setAuthCookie(res, user as any, rememberMe === true);
      createSession(loginToken, user.id, getClientIp(req), req.headers["user-agent"]).catch(() => {});
      logAuthEvent({
        userId: user.id,
        tenantId: user.tenantId ?? null,
        action: "login",
        metadata: { provider: "email", ip },
      });
      res.json({
        ok: true,
        token: loginToken,
        user: {
          id: user.id,
          name: user.name ?? null,
          email: user.email ?? null,
          avatar: user.avatar ?? null,
          provider: user.provider,
          tenantId: user.tenantId ?? null,
          role: user.role ?? "owner",
          activeBranchId: (user as any).activeBranchId ?? null,
          activeBranch: null,
          emailVerified: user.emailVerified ?? true,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/auth/logout", async (req, res) => {
    const jti = req.tokenJti;
    const exp = req.tokenExp;
    const uid = req.user?.id;
    const tid = req.user?.tenantId ?? null;

    // Revoke the token used to authenticate this request (Bearer or cookie)
    if (jti && uid && exp) {
      const expiresAt = new Date(exp * 1000).toISOString();
      await revokeToken(jti, uid, expiresAt);
      deleteSession(jti).catch(() => {});
      logAuthEvent({ userId: uid, tenantId: tid, action: "logout" });
    }

    // A browser can carry TWO separate sessions at once — a cookie AND a
    // Bearer token in localStorage (e.g. after email verification, invite
    // redemption, or native OAuth) — each with its OWN jti. jwtAuthMiddleware
    // only populates req.tokenJti from ONE of them, so explicitly check both
    // the cookie and the Authorization header here and revoke whichever
    // JTI(s) weren't already covered above.
    const extraTokens: string[] = [];
    const cookieToken = (req as any).cookies?.[AUTH_COOKIE];
    if (cookieToken) extraTokens.push(cookieToken);
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      extraTokens.push(authHeader.slice(7));
    }

    for (const t of extraTokens) {
      try {
        const cp = jwt.verify(t, getJwtSecret()) as any;
        if (cp.jti && cp.jti !== jti) {
          await revokeToken(cp.jti, cp.id, new Date(cp.exp * 1000).toISOString());
          deleteSession(cp.jti).catch(() => {});
        }
      } catch {
        // token already expired or invalid — nothing to revoke
      }
    }

    clearAuthCookie(res);
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Active sessions — list, revoke one, revoke all others
  // -------------------------------------------------------------------------

  app.get("/api/sessions", requireAuth, async (req, res, next) => {
    try {
      const sessions = await listUserSessions(req.user!.id);
      const currentJti = req.tokenJti;
      res.json(sessions.map((s) => ({ ...s, current: s.jti === currentJti })));
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/sessions/:id", requireAuth, async (req, res, next) => {
    try {
      const session = await getSessionById(String(req.params.id), req.user!.id);
      if (!session) return res.status(404).json({ message: "Session not found" });
      if (session.jti === req.tokenJti)
        return res.status(400).json({ message: "Cannot revoke your current session from here. Use Sign Out instead." });
      await revokeToken(session.jti, req.user!.id, session.expiresAt);
      await deleteSession(session.jti);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/sessions", requireAuth, async (req, res, next) => {
    try {
      const currentJti = req.tokenJti;
      if (!currentJti) return res.status(400).json({ message: "Cannot identify current session" });
      const sessions = await listUserSessions(req.user!.id);
      const others = sessions.filter((s) => s.jti !== currentJti);
      await Promise.all(
        others.map((s) => revokeToken(s.jti, req.user!.id, s.expiresAt)),
      );
      await deleteAllOtherSessions(req.user!.id, currentJti);
      res.json({ ok: true, revoked: others.length });
    } catch (err) {
      next(err);
    }
  });

  // SSE endpoint — holds an open connection per authenticated session so the
  // server can push an instant "revoked" event when that session is signed out
  // remotely (instead of waiting for the client's next 45-second poll).
  app.get("/api/auth/sse", requireAuth, (req, res) => {
    const jti = req.tokenJti;
    if (!jti) return res.status(400).end();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx / proxy buffering
    // Remove any request timeout for this long-lived connection
    req.socket?.setTimeout(0);
    res.flushHeaders();

    res.write("event: connected\ndata: {}\n\n");
    registerSseConnection(jti, res);

    // Keepalive comment every 25 s (proxies drop idle SSE streams after ~30 s)
    const ping = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clearInterval(ping);
      }
    }, 25_000);

    req.on("close", () => {
      clearInterval(ping);
      unregisterSseConnection(jti);
    });
  });

  app.post("/api/auth/refresh", async (req, res, _next) => {
    let token = (req as any).cookies?.[AUTH_COOKIE];
    if (
      !token &&
      typeof req.headers.authorization === "string" &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.slice(7);
    }
    if (!token) return res.status(401).json({ message: "No token provided" });

    try {
      const payload = jwt.verify(token, getJwtSecret()) as any;

      if (payload.jti && _revokedJtis.has(payload.jti)) {
        return res.status(401).json({ message: "Token has been revoked" });
      }

      if (payload.jti && payload.exp) {
        await revokeToken(payload.jti, payload.id, new Date(payload.exp * 1000).toISOString());
      }

      const [user] = await db.select().from(users).where(eq(users.id, payload.id));
      if (!user) return res.status(401).json({ message: "User not found" });
      if (user.isBanned) {
        return res.status(403).json({ banned: true, message: "Account suspended" });
      }

      const rememberMe = payload.rem === true;
      const newToken = setAuthCookie(res, user as any, rememberMe);
      // Update the existing session row to track the new JTI.
      // createSession would spawn a duplicate; updateSessionJti is correct here
      // because this endpoint always revokes an old token and issues a replacement.
      updateSessionJti(payload.jti, newToken).catch(() => {});
      res.json({ ok: true, token: newToken });
    } catch {
      res.status(401).json({ message: "Invalid or expired token" });
    }
  });

  app.get("/api/auth/export", async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const uid = req.user.id;

    try {
      const [liveUser] = await db.select().from(users).where(eq(users.id, uid));
      if (!liveUser) return res.status(404).json({ message: "User not found" });

      const tenantId = liveUser.tenantId;
      const isOwnerWithTenant = liveUser.role === "owner" && !!tenantId;

      let userIds: string[] = [uid];
      if (isOwnerWithTenant) {
        const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId!));
        userIds = Array.from(new Set([uid, ...tenantUsers.map((u) => u.id)]));
      }

      const sanitizeUser = (u: any) => {
        const { passwordHash: _ph, resetToken: _rt, resetTokenExpires: _rte, ...safe } = u;
        return safe;
      };

      const teamUsers = (await db.select().from(users).where(inArray(users.id, userIds))).map(
        sanitizeUser,
      );

      const [
        productsRows,
        productSizesRows,
        productModifiersRows,
        ingredientsRows,
        productRecipesRows,
        salesRows,
        refundsRows,
        pendingOrdersRows,
        customersRows,
        expensesRows,
        shiftsRows,
        discountCodesRows,
        suppliersRows,
        purchaseOrdersRows,
        purchaseOrderItemsRows,
        tablesRows,
        serviceStaffRows,
        serviceRoomsRows,
        appointmentsRows,
        membershipPlansRows,
        membershipsRows,
        membershipCheckInsRows,
        timeLogsRows,
        payrollPeriodsRows,
        payrollEntriesRows,
        userSettingsRows,
        wifiVouchersRows,
        userBranchesRows,
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

      const productIdSet = new Set(productsRows.map((p) => p.id));
      const ingredientIdSet = new Set(ingredientsRows.map((i) => i.id));
      const purchaseOrderIdSet = new Set(purchaseOrdersRows.map((po) => po.id));

      const filteredSizes = productSizesRows.filter((r) => productIdSet.has(r.productId));
      const filteredModifiers = productModifiersRows.filter((r) => productIdSet.has(r.productId));
      const filteredRecipes = productRecipesRows.filter(
        (r) => productIdSet.has(r.productId) && ingredientIdSet.has(r.ingredientId),
      );
      const filteredPoItems = purchaseOrderItemsRows.filter((r) =>
        purchaseOrderIdSet.has(r.purchaseOrderId),
      );

      let tenantData: Record<string, any> = {};
      if (isOwnerWithTenant) {
        const [
          tenantRow,
          branchesRows,
          rolePermissionsRows,
          tenantSubscriptionsRows,
          subscriptionPaymentsRows,
          auditLogsRows,
        ] = await Promise.all([
          db.select().from(tenants).where(eq(tenants.id, tenantId!)),
          db.select().from(branches).where(eq(branches.tenantId, tenantId!)),
          db.select().from(rolePermissions).where(eq(rolePermissions.tenantId, tenantId!)),
          db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tenantId!)),
          db
            .select()
            .from(subscriptionPayments)
            .where(eq(subscriptionPayments.tenantId, tenantId!)),
          db.select().from(auditLogs).where(eq(auditLogs.tenantId, tenantId!)),
        ]);
        tenantData = {
          tenant: tenantRow[0] ?? null,
          branches: branchesRows,
          rolePermissions: rolePermissionsRows,
          tenantSubscriptions: tenantSubscriptionsRows,
          subscriptionPayments: subscriptionPaymentsRows,
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

      const safeName =
        (liveUser.email || liveUser.id)
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
    } catch (err: unknown) {
      console.error("[export-account] failed:", err instanceof Error ? err.message : String(err));
      next(err);
    }
  });

  app.delete("/api/auth/account", async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const uid = req.user.id;
    try {
      const [liveUser] = await db.select().from(users).where(eq(users.id, uid));
      if (!liveUser) {
        clearAuthCookie(res);
        return res.json({ ok: true });
      }

      const tenantId = liveUser.tenantId;
      const isOwnerWithTenant = liveUser.role === "owner" && !!tenantId;

      let userIdsToWipe: string[] = [uid];
      if (isOwnerWithTenant) {
        const tenantUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.tenantId, tenantId!));
        if (tenantUsers.length > 0) {
          userIdsToWipe = Array.from(new Set([uid, ...tenantUsers.map((u) => u.id)]));
        }
      }

      await deleteUsersData(userIdsToWipe);

      if (isOwnerWithTenant) {
        await deleteTenantShell(tenantId!);
      }

      if (userIdsToWipe.length > 0) {
        await db.delete(users).where(inArray(users.id, userIdsToWipe));
      }

      for (const wuid of userIdsToWipe) {
        cache.del(settingsCacheKey(wuid));
        invalidateTenantCache(wuid);
      }

      const jti = req.tokenJti;
      const exp = req.tokenExp;
      if (jti && uid && exp) {
        await revokeToken(jti, uid, new Date(exp * 1000).toISOString()).catch(() => {});
      }
      clearAuthCookie(res);
      res.json({ ok: true });
    } catch (err: unknown) {
      console.error("[delete-account] failed:", err instanceof Error ? err.message : String(err));
      next(err);
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (req.isBanned) {
      return res.status(403).json({
        banned: true,
        message: "Your account has been suspended for violating our Terms of Service.",
      });
    }
    if (!req.user) return res.status(401).json({ user: null });
    const u = req.user;

    let liveRole = u.role ?? "owner";
    let liveTenantId: string | null = u.tenantId ?? null;
    let liveActiveBranchId: number | null = u.activeBranchId ?? null;
    let liveEmailVerified: boolean = (u as any).emailVerified ?? true;
    try {
      const [dbUser] = await runAsAdmin(pool, async (adminDb) =>
        adminDb
          .select({
            tenantId: users.tenantId,
            role: users.role,
            isBanned: users.isBanned,
            emailVerified: users.emailVerified,
          })
          .from(users)
          .where(eq(users.id, u.id))
          .limit(1),
      );
      if (dbUser) {
        if (dbUser.isBanned) {
          return res.status(403).json({
            banned: true,
            message: "Your account has been suspended for violating our Terms of Service.",
          });
        }
        liveRole = (dbUser.role as string) ?? liveRole;
        liveTenantId = (dbUser.tenantId as string | null) ?? liveTenantId;
        liveEmailVerified = dbUser.emailVerified ?? true;
      }
    } catch (err) {
      console.warn("[auth/me] live user re-read failed, using JWT values:", (err as Error).message);
    }

    let activeBranch: {
      id: number;
      name: string;
      color: string | null;
      businessType: string | null;
      businessSubType: string | null;
    } | null = null;
    try {
      if (liveActiveBranchId && liveTenantId) {
        const { branches: branchesTable } = await import("@shared/schema");
        const { and, eq: eqLocal } = await import("drizzle-orm");
        const [b] = await db
          .select({
            id: branchesTable.id,
            name: branchesTable.name,
            color: branchesTable.color,
            businessType: branchesTable.businessType,
            businessSubType: branchesTable.businessSubType,
          })
          .from(branchesTable)
          .where(
            and(
              eqLocal(branchesTable.id, liveActiveBranchId),
              eqLocal(branchesTable.tenantId, liveTenantId),
            ),
          )
          .limit(1);
        if (b) activeBranch = b;
      }
    } catch (err) {
      console.warn("[auth/me] active branch lookup failed:", (err as Error).message);
    }

    // Silent token rotation for "remember this device" sessions.
    // If the token was issued with rem=true and expires within 30 days,
    // issue a fresh 90-day token so the user stays logged in indefinitely
    // as long as they open the app at least once every 60 days.
    // We require a JTI so we can atomically revoke the old token — never
    // issue a new token without being able to invalidate the old one.
    let rotatedToken: string | undefined;
    if (req.tokenRem && req.tokenExp && req.tokenJti) {
      const secsUntilExpiry = req.tokenExp - Math.floor(Date.now() / 1000);
      const thirtyDaysInSecs = 30 * 24 * 60 * 60;
      if (secsUntilExpiry < thirtyDaysInSecs) {
        try {
          rotatedToken = setAuthCookie(res, {
            id: u.id,
            name: u.name,
            email: u.email,
            avatar: u.avatar,
            provider: u.provider,
            tenantId: liveTenantId,
            role: liveRole,
            activeBranchId: liveActiveBranchId,
            emailVerified: liveEmailVerified,
          }, true);
          // Update the session row to track the new JTI (keeps it visible in "active sessions")
          updateSessionJti(req.tokenJti, rotatedToken).catch(() => {});
          // Revoke old token immediately in-memory, then persist async.
          // revokeToken adds to _revokedJtis synchronously before awaiting DB,
          // so the old JTI is blocked from reuse even if DB persistence fails.
          revokeToken(
            req.tokenJti,
            u.id,
            new Date(req.tokenExp * 1000).toISOString(),
          ).catch((err) =>
            console.error("[auth/me] token revocation persistence failed:", err),
          );
        } catch (err) {
          console.warn("[auth/me] token rotation failed:", (err as Error).message);
          rotatedToken = undefined; // don't send a partial state
        }
      }
    }

    res.json({
      ...(rotatedToken ? { token: rotatedToken } : {}),
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        provider: u.provider,
        tenantId: liveTenantId,
        role: liveRole,
        activeBranchId: liveActiveBranchId,
        activeBranch,
        emailVerified: liveEmailVerified,
      },
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

  app.post("/api/auth/forgot-password", bruteForceGuard, async (req, res, next) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required." });
      }

      const user = await runAsAdmin(pool, async (adminDb) => {
        const [row] = await adminDb
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase().trim()))
          .limit(1);
        return row ?? null;
      });

      if (!user) {
        return res.status(404).json({ message: "No account found with that email address." });
      } else {
        const maskedEmail = user.email
          ? user.email.replace(/(.{2})[^@]*(@.*)/, "$1***$2")
          : "(no email)";
        console.log(
          `[auth/forgot-password] user found id=${user.id}, sending reset email to ${maskedEmail}`,
        );

        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        await runAsAdmin(pool, async (adminDb) =>
          (adminDb.update(users) as any)
            .set({ resetToken: token, resetTokenExpires: expires })
            .where(eq(users.id, user.id)),
        );

        const currentBaseUrl = getBaseUrl();
        const resetUrl = `${currentBaseUrl}/reset-password?token=${token}`;

        const sent = await sendPasswordResetEmail(user.email!, resetUrl).catch((err) => {
          console.error("[auth] sendPasswordResetEmail threw:", err);
          return false;
        });

        console.log(`[auth/forgot-password] sendPasswordResetEmail result: ${sent}`);

        if (!sent) {
          console.warn(`[auth/forgot-password] email delivery failed for user ${user.id}`);
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

      const [user] = await runAsAdmin(pool, async (adminDb) =>
        adminDb.select().from(users).where(eq(users.resetToken, token)).limit(1),
      );

      if (!user || !user.resetTokenExpires) {
        return res.status(400).json({ message: "Invalid or expired reset link." });
      }

      if (new Date(user.resetTokenExpires) < new Date()) {
        return res
          .status(400)
          .json({ message: "Reset link has expired. Please request a new one." });
      }

      const passwordHash = await hashPassword(password);

      await runAsAdmin(pool, async (adminDb) =>
        (adminDb.update(users) as any)
          .set({ passwordHash, resetToken: null, resetTokenExpires: null })
          .where(eq(users.id, user.id)),
      );

      res.json({ message: "Password updated successfully. You can now sign in." });
    } catch (err) {
      next(err);
    }
  });
}
