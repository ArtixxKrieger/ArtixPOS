import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db, pool } from "./db";
import { runAsAdmin } from "./tenant-context";
import {
  users, products, productSizes, productModifiers, sales, pendingOrders, userSettings,
  customers, serviceStaff, serviceRooms, appointments,
  membershipPlans, memberships, membershipCheckIns,
  expenses, shifts, discountCodes, refunds, timeLogs,
  tables, suppliers, purchaseOrders, purchaseOrderItems, supplierProducts,
  userBranches, inviteTokens, auditLogs,
  ingredients, productRecipes, wifiVouchers, payrollPeriods, payrollEntries,
  branches, tenants, rolePermissions, tenantSubscriptions, subscriptionPayments, aiMemories,
  revokedTokens,
  notifications, stockLogs, wasteLog, stockTransfers, stockTransferItems,
  loyaltyTiers, loyaltyRewards, loyaltyPointsLog,
} from "@shared/schema";
import { eq, or, inArray, sql } from "drizzle-orm";
import type { Express, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendPasswordResetEmail } from "./email";
import { hashPassword, verifyPassword } from "./crypto";
import { cache, settingsCacheKey } from "./cache";
import { invalidateTenantCache } from "./storage";
import { bruteForceGuard, recordFailedAttempt, recordSuccessfulLogin } from "./brute-force";

function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

export const AUTH_COOKIE = "auth_token";

// ── Token revocation (logout invalidation) ────────────────────────────────────
// In-memory Set for O(1) lookup on every request. DB is the durable source of
// truth; the Set is populated on startup and updated on every logout.
const _revokedJtis = new Set<string>();

async function _loadRevokedTokens(): Promise<void> {
  try {
    const now = new Date().toISOString();
    const rows = await db
      .select({ jti: revokedTokens.jti })
      .from(revokedTokens)
      .where(sql`${revokedTokens.expiresAt} >= ${now}`);
    rows.forEach(r => _revokedJtis.add(r.jti));
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
    await db.delete(revokedTokens).where(sql`${revokedTokens.expiresAt} < ${now}`);
  } catch { /* non-critical */ }
}

async function revokeToken(jti: string, userId: string, expiresAt: string): Promise<void> {
  _revokedJtis.add(jti);
  try {
    await db.insert(revokedTokens).values({ jti, userId, expiresAt }).onConflictDoNothing();
  } catch (err) {
    console.error("[auth] Failed to persist revoked token:", err);
  }
}


// Load revoked tokens on startup and prune stale entries every hour
_loadRevokedTokens();
setInterval(_pruneRevokedTokens, 60 * 60 * 1000);

// ── Auth event audit logger ───────────────────────────────────────────────────
// Logs auth events to the audit_logs table. Uses "system" as tenantId when
// the user has no tenant yet (new accounts, pre-onboarding).
async function logAuthEvent(opts: {
  userId: string;
  tenantId: string | null;
  action: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const tid = opts.tenantId ?? "system";
  try {
    const { createAuditLog } = await import("./admin-storage");
    await createAuditLog({
      tenantId: tid,
      userId: opts.userId,
      action: opts.action,
      entity: "auth",
      metadata: opts.metadata,
    });
  } catch { /* audit failures must never block auth */ }
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
      console.warn("[auth] WARNING: SESSION_SECRET is not set — using an ephemeral random secret. Sessions will be invalidated on restart.");
    }
    return _ephemeralSecret;
  }
  return secret;
}

export function getBaseUrl(): string {
  // Explicit override always wins (recommended for custom domains on Vercel)
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (appUrl) return appUrl;
  // VERCEL_PROJECT_PRODUCTION_URL is the stable production/custom domain URL.
  // VERCEL_URL is deployment-specific (changes each deploy) — only use as fallback.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
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

export interface TokenUser {
  id: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  provider: string;
  tenantId: string | null;
  role: string;
  activeBranchId: number | null;
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
    },
    getJwtSecret(),
    { expiresIn: rememberMe ? "30d" : "7d" }
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

export function setAuthCookie(res: Response, user: TokenUser, rememberMe = false) {
  // Pass rememberMe so the JWT itself also expires in 30d instead of 7d —
  // otherwise the cookie would outlive the token and silently log the user out.
  const token = signToken(user, rememberMe);
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

      // ── Revocation check (O(1) in-memory Set) ──────────────────────────────
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
      // Store jti on request so logout can revoke it
      req.tokenJti = payload.jti ?? null;
      req.tokenExp = payload.exp ?? null;
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
}): Promise<import("@shared/schema").User> {
  // runAsAdmin issues SET LOCAL row_security = off inside its transaction, so
  // RLS on the `users` table (which has USING/WITH CHECK on tenant_id) cannot
  // block user creation or lookup at sign-in time — when there is no tenant
  // context yet and every user's tenant_id is NULL.  Without this guard,
  // Supabase's managed postgres (not a true PostgreSQL superuser) evaluates
  // the policy even for non-forced RLS, causing the INSERT to fail with
  // "new row violates row-level security policy" and subsequent SELECTs to
  // return zero rows.
  return runAsAdmin(pool, async (adminDb) => {
    // Primary lookup: exact provider ID match (deterministic, fastest)
    const [existing] = await adminDb.select().from(users).where(eq(users.id, data.id));
    if (existing) return existing;

    // Fallback: email-based lookup — handles the RLS Catch-22 scenario where a
    // returning user's row was hidden (non-null tenant_id + NULL current_tenant_id()
    // → policy evaluated to NULL → 0 rows), as well as cross-provider account
    // linking (user registered with email+password, now signs in with Google
    // using the same email address).  We only fall back when an email is known.
    if (data.email) {
      const [byEmail] = await adminDb
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);
      if (byEmail) {
        // Link the provider ID: if they previously used a different provider,
        // update the record so future primary-lookup hits are instant.
        if (byEmail.id !== data.id) {
          console.log(`[auth] findOrCreateUser: linked provider "${data.provider}" to existing account via email match (existing id=${byEmail.id})`);
        }
        return byEmail;
      }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await adminDb.insert(users).values(data as any);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.toLowerCase().includes("unique")) throw err;
    }

    const [created] = await adminDb.select().from(users).where(eq(users.id, data.id));
    if (!created) throw new Error(`DB: user not found after insert — id=${data.id}`);
    return created;
  });
}

const NATIVE_APP_SCHEME = process.env.NATIVE_APP_SCHEME || "com.artixpos.app";

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

  // ── Pre-fetch IDs needed for child-table deletes ─────────────────────────
  // We need parent IDs so we can cascade into child tables that don't carry
  // a userId column directly (purchaseOrderItems, stockTransferItems, etc.)
  const userProductIds = (
    await db.select({ id: products.id }).from(products).where(inArray(products.userId, uids))
  ).map(r => r.id);

  const userIngredientIds = (
    await db.select({ id: ingredients.id }).from(ingredients).where(inArray(ingredients.userId, uids))
  ).map(r => r.id);

  const userSaleIds = (
    await db.select({ id: sales.id }).from(sales).where(inArray(sales.userId, uids))
  ).map(r => r.id);

  const userPoIds = (
    await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(inArray(purchaseOrders.userId, uids))
  ).map(r => r.id);

  const userSupplierIds = (
    await db.select({ id: suppliers.id }).from(suppliers).where(inArray(suppliers.userId, uids))
  ).map(r => r.id);

  const userMembershipIds = (
    await db.select({ id: memberships.id }).from(memberships).where(inArray(memberships.userId, uids))
  ).map(r => r.id);

  const userPayrollPeriodIds = (
    await db.select({ id: payrollPeriods.id }).from(payrollPeriods).where(inArray(payrollPeriods.userId, uids))
  ).map(r => r.id);

  const userStockTransferIds = (
    await db.select({ id: stockTransfers.id }).from(stockTransfers).where(inArray(stockTransfers.userId, uids))
  ).map(r => r.id);

  // ── DELETION ORDER (FK dependency graph, leaves first) ───────────────────
  // Rule: every table with a NOT NULL FK → another table being deleted must
  // be deleted BEFORE its parent. Soft-deletes (UPDATE) are NOT used here —
  // a soft-deleted row still holds its FK pointer and will block the final
  // DELETE FROM users.

  // Step 1 — membership_check_ins
  //   refs: memberships.id NOT NULL, customers.id NOT NULL, users.id NOT NULL
  if (userMembershipIds.length > 0) {
    await db.delete(membershipCheckIns).where(inArray(membershipCheckIns.membershipId, userMembershipIds));
  }
  await db.delete(membershipCheckIns).where(inArray(membershipCheckIns.userId, uids));

  // Step 2 — loyalty_points_log
  //   refs: customers.id NOT NULL, loyalty_rewards.id nullable, users.id NOT NULL
  await db.delete(loyaltyPointsLog).where(inArray(loyaltyPointsLog.userId, uids));

  // Step 3 — refunds  (refs: sales.id NOT NULL, users.id NOT NULL)
  if (userSaleIds.length > 0) {
    await db.delete(refunds).where(inArray(refunds.saleId, userSaleIds));
  }
  await db.delete(refunds).where(inArray(refunds.userId, uids));

  // Step 4 — stock_transfer_items  (refs: stock_transfers.id NOT NULL, products.id NOT NULL)
  if (userStockTransferIds.length > 0) {
    await db.delete(stockTransferItems).where(inArray(stockTransferItems.transferId, userStockTransferIds));
  }

  // Step 5 — product_recipes  (refs: products.id NOT NULL, ingredients.id NOT NULL)
  if (userProductIds.length > 0) {
    await db.delete(productRecipes).where(inArray(productRecipes.productId, userProductIds));
    await db.delete(productSizes).where(inArray(productSizes.productId, userProductIds));
    await db.delete(productModifiers).where(inArray(productModifiers.productId, userProductIds));
  }
  if (userIngredientIds.length > 0) {
    await db.delete(productRecipes).where(inArray(productRecipes.ingredientId, userIngredientIds));
  }

  // Step 6 — purchase_order_items  (refs: purchase_orders.id NOT NULL)
  if (userPoIds.length > 0) {
    await db.delete(purchaseOrderItems).where(inArray(purchaseOrderItems.purchaseOrderId, userPoIds));
  }

  // Step 7 — supplier_products  (refs: suppliers.id NOT NULL, products.id NOT NULL)
  if (userSupplierIds.length > 0) {
    await db.delete(supplierProducts).where(inArray(supplierProducts.supplierId, userSupplierIds));
  }
  if (userProductIds.length > 0) {
    await db.delete(supplierProducts).where(inArray(supplierProducts.productId, userProductIds));
  }

  // Step 8 — stock_logs  (refs: products.id NOT NULL, users.id NOT NULL)
  await db.delete(stockLogs).where(inArray(stockLogs.userId, uids));
  if (userProductIds.length > 0) {
    await db.delete(stockLogs).where(inArray(stockLogs.productId, userProductIds));
  }

  // Step 9 — waste_log  (refs: products.id nullable, ingredients.id nullable, users.id NOT NULL)
  await db.delete(wasteLog).where(inArray(wasteLog.userId, uids));

  // Step 10 — appointments
  //   refs: customers.id nullable, service_staff.id nullable, service_rooms.id nullable, users.id NOT NULL
  await db.delete(appointments).where(inArray(appointments.userId, uids));

  // Step 11 — memberships  (refs: customers.id NOT NULL, membership_plans.id nullable, users.id NOT NULL)
  await db.delete(memberships).where(inArray(memberships.userId, uids));

  // Step 12 — wifi_vouchers  (refs: sales.id nullable, users.id NOT NULL)
  await db.delete(wifiVouchers).where(inArray(wifiVouchers.userId, uids));
  if (userSaleIds.length > 0) {
    await db.delete(wifiVouchers).where(inArray(wifiVouchers.saleId, userSaleIds));
  }

  // Step 13 — notifications  (refs: users.id NOT NULL)
  await db.delete(notifications).where(inArray(notifications.userId, uids));

  // Step 14 — invite_tokens  (refs: tenants.id NOT NULL, users.id NOT NULL x2)
  await db.delete(inviteTokens).where(or(
    inArray(inviteTokens.createdBy, uids),
    inArray(inviteTokens.usedBy, uids),
  ));

  // Step 15 — time_logs  (refs: users.id NOT NULL)
  await db.delete(timeLogs).where(inArray(timeLogs.userId, uids));

  // Step 16 — payroll_entries
  //   refs: payroll_periods.id NOT NULL, users.id NOT NULL (employeeUserId)
  if (userPayrollPeriodIds.length > 0) {
    await db.delete(payrollEntries).where(inArray(payrollEntries.periodId, userPayrollPeriodIds));
  }
  await db.delete(payrollEntries).where(inArray(payrollEntries.employeeUserId, uids));

  // ── Parents that had children deleted above ───────────────────────────────

  // Step 17 — stock_transfers  (refs: users.id NOT NULL — children deleted in step 4)
  await db.delete(stockTransfers).where(inArray(stockTransfers.userId, uids));

  // Step 18 — sales  (refs: customers.id nullable, tables.id nullable, users.id NOT NULL)
  //   Children refunds deleted in step 3, wifi_vouchers in step 12.
  await db.delete(sales).where(inArray(sales.userId, uids));

  // Step 19 — pending_orders  (refs: customers.id nullable, tables.id nullable, users.id NOT NULL)
  await db.delete(pendingOrders).where(inArray(pendingOrders.userId, uids));

  // Step 20 — purchase_orders  (refs: suppliers.id nullable, users.id NOT NULL — children deleted in step 6)
  await db.delete(purchaseOrders).where(inArray(purchaseOrders.userId, uids));

  // Step 21 — payroll_periods  (refs: users.id NOT NULL — entries deleted in step 16)
  await db.delete(payrollPeriods).where(inArray(payrollPeriods.userId, uids));

  // Step 22 — membership_plans  (refs: users.id NOT NULL — memberships deleted in step 11)
  await db.delete(membershipPlans).where(inArray(membershipPlans.userId, uids));

  // Step 23 — loyalty_rewards  (refs: products.id nullable, users.id NOT NULL — log deleted in step 2)
  await db.delete(loyaltyRewards).where(inArray(loyaltyRewards.userId, uids));

  // Step 24 — service_staff  (refs: users.id NOT NULL — appointments deleted in step 10)
  await db.delete(serviceStaff).where(inArray(serviceStaff.userId, uids));

  // Step 25 — service_rooms  (refs: users.id NOT NULL — appointments deleted in step 10)
  await db.delete(serviceRooms).where(inArray(serviceRooms.userId, uids));

  // Step 26 — customers  (refs: users.id NOT NULL)
  //   All child tables (memberships, membershipCheckIns, loyaltyPointsLog,
  //   appointments, sales, pendingOrders) deleted above.
  await db.delete(customers).where(inArray(customers.userId, uids));

  // Step 27 — ingredients  (refs: users.id NOT NULL — productRecipes + wasteLog deleted above)
  await db.delete(ingredients).where(inArray(ingredients.userId, uids));

  // Step 28 — products  (refs: users.id NOT NULL)
  //   All child tables (productRecipes, supplierProducts, stockLogs,
  //   stockTransferItems, wifiVouchers, purchaseOrderItems) deleted above.
  await db.delete(products).where(inArray(products.userId, uids));

  // Step 29 — suppliers  (refs: users.id NOT NULL — supplierProducts + purchaseOrders deleted above)
  await db.delete(suppliers).where(inArray(suppliers.userId, uids));

  // Step 30 — tables  (refs: users.id NOT NULL — sales + pendingOrders deleted above)
  await db.delete(tables).where(inArray(tables.userId, uids));

  // Step 31 — loyalty_tiers  (refs: users.id NOT NULL)
  await db.delete(loyaltyTiers).where(inArray(loyaltyTiers.userId, uids));

  // Step 32 — shifts  (refs: users.id NOT NULL)
  await db.delete(shifts).where(inArray(shifts.userId, uids));

  // Step 33 — discount_codes  (refs: users.id NOT NULL)
  await db.delete(discountCodes).where(inArray(discountCodes.userId, uids));

  // Step 34 — expenses  (refs: users.id NOT NULL)
  await db.delete(expenses).where(inArray(expenses.userId, uids));

  // Step 35 — audit_logs (userId column has no FK constraint — just a text field; GDPR hygiene)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.update(auditLogs).set({ metadata: { deleted: true } } as any).where(inArray(auditLogs.userId, uids));

  // Step 36 — user_settings  (refs: users.id NOT NULL UNIQUE)
  await db.delete(userSettings).where(inArray(userSettings.userId, uids));

  // Step 37 — user_branches  (refs: users.id NOT NULL)
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
  // Step 1 — NULL out users.activeBranchId and users.tenantId for all tenant users
  // so that branches and the tenant row can be hard-deleted without FK violations.
  // (The user *rows* themselves are deleted by the caller right after this function.)
  await db.execute(
    sql`UPDATE users SET active_branch_id = NULL, tenant_id = NULL WHERE tenant_id = ${tenantId}`
  );

  // Step 2 — user_branches (refs: branches.id NOT NULL)
  await db.delete(userBranches).where(
    inArray(
      userBranches.branchId,
      db.select({ id: branches.id }).from(branches).where(eq(branches.tenantId, tenantId))
    )
  );

  // Step 3 — hard-delete branches (tenantId NOT NULL FK → tenants; cleared above)
  await db.delete(branches).where(eq(branches.tenantId, tenantId));

  // Step 4 — remaining tenant-scoped tables
  await db.delete(rolePermissions).where(eq(rolePermissions.tenantId, tenantId));
  await db.delete(subscriptionPayments).where(eq(subscriptionPayments.tenantId, tenantId));
  await db.delete(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tenantId));
  await db.delete(aiMemories).where(eq(aiMemories.tenantId, tenantId));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.update(auditLogs).set({ metadata: { tenantDeleted: true } } as any).where(eq(auditLogs.tenantId, tenantId));
  await db.delete(inviteTokens).where(eq(inviteTokens.tenantId, tenantId));

  // Step 5 — hard-delete the tenant row itself (no FK references remain)
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

function popupResultPage({ ok, error }: { ok: boolean; error?: string }): string {
  const payload = ok
    ? JSON.stringify({ type: "google-auth-ok" })
    : JSON.stringify({ type: "google-auth-error", error: error ?? "unknown" });

  const errorText = error
    ? error.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    : "unknown";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ArtixPOS</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#09090f;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;padding:32px;text-align:center}
.logo{width:60px;height:60px;border-radius:18px;background:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#fff;letter-spacing:-1px;flex-shrink:0}
.app-name{font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.3px}
.dots{display:flex;gap:7px;margin-top:4px}
.dot{width:8px;height:8px;border-radius:50%;background:#7c3aed;animation:bop 1.2s ease-in-out infinite}
.dot:nth-child(2){animation-delay:.2s}
.dot:nth-child(3){animation-delay:.4s}
@keyframes bop{0%,80%,100%{transform:scale(.55);opacity:.35}40%{transform:scale(1);opacity:1}}
.msg{font-size:13px;color:#6b7280;margin-top:4px}
.err-icon{font-size:36px;margin-bottom:4px}
.err-text{color:#f87171;font-size:14px;line-height:1.6;max-width:300px}
.btn{margin-top:12px;display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:11px 28px;border-radius:10px;font-size:14px;font-weight:600}
</style>
</head>
<body>
${ok ? `
<div class="logo">A</div>
<div class="app-name">ArtixPOS</div>
<div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
<p class="msg">Signing you in\u2026</p>
` : `
<div class="err-icon">\u26A0\uFE0F</div>
<p class="err-text">Sign-in failed${error ? `: ${errorText}` : ""}.<br>Close this window and try again.</p>
<a href="/login" class="btn">Back to login</a>
`}
<script>
(function(){
  ${ok ? `
  // Try to send the result to the parent window (desktop popup flow).
  var sent = false;
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(${payload}, "*");
      sent = true;
    }
  } catch(e) {}

  if (sent) {
    // Desktop popup: close after a short delay so the parent can process the message.
    setTimeout(function(){ try { window.close(); } catch(e) {} }, 500);
    // Fallback: if the browser blocks window.close() (Chrome sometimes does),
    // redirect this tab to the app so the user is never left stuck here.
    setTimeout(function(){
      try {
        if (!window.closed) { window.location.replace("/"); }
      } catch(e) { window.location.replace("/"); }
    }, 2000);
  } else {
    // Mobile / opener unavailable: the cookie is already set on our origin.
    // Redirect the current tab (the "popup") straight to the app.
    // React will pick up the auth cookie and land the user on the dashboard.
    window.location.replace("/");
  }
  ` : `
  // Error: try to notify opener, stay on error page if running standalone.
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(${payload}, "*");
      setTimeout(function(){ try { window.close(); } catch(e) {} }, 500);
    }
  } catch(e) {}
  `}
})();
</script>
</body>
</html>`;
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
            store: (_req: unknown, _state: unknown, _meta: unknown, cb: (err: unknown, code: string) => void) => cb(null, crypto.randomBytes(4).toString("hex")),
            verify: (_req: unknown, _state: unknown, cb: (err: unknown, valid: boolean, meta: unknown) => void) => cb(null, true, {}),
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
            console.error("[auth] Google strategy error:", err instanceof Error ? err.message : String(err));
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
    } catch (err: unknown) {
      console.error("[auth] Google initiation error:", err instanceof Error ? err.message : String(err));
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

    passport.authenticate("google", { session: false }, (err: unknown, user: Express.User | false | null) => {
      if (err) {
        const msg = String(err instanceof Error ? err.message : err).slice(0, 120);
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
        // Google sign-in is always an explicit active choice — always persist for 30 days
        // across all platforms: native deep-link, popup, and redirect flows.
        if (isNative) {
          const token = signToken(user, true);
          return res.redirect(`${NATIVE_APP_SCHEME}://auth?token=${encodeURIComponent(token)}`);
        }
        if (isPopup) {
          setAuthCookie(res, user, true);
          return res.send(popupResultPage({ ok: true }));
        }
        setAuthCookie(res, user, true);
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
      // Google sign-in is an explicit active choice — always persist for 30 days on native.
      const token = signToken({ id: user.id, name: user.name, email: user.email, avatar: user.avatar, provider: user.provider, tenantId: user.tenantId, role: user.role ?? "owner", activeBranchId: (user as any).activeBranchId ?? null }, true);
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
        } as any);

        const [row] = await adminDb.select().from(users).where(eq(users.id, userId));
        if (!row) throw new Error("User not found after insert");
        return row;
      });

      if (!created) {
        return res.status(409).json({ message: "An account with this email already exists." });
      }

      setAuthCookie(res, { id: created.id, name: created.name ?? null, email: created.email ?? null, avatar: created.avatar ?? null, provider: created.provider, tenantId: (created as any).tenantId ?? null, role: created.role ?? "owner", activeBranchId: (created as any).activeBranchId ?? null });
      logAuthEvent({ userId: created.id, tenantId: (created as any).tenantId ?? null, action: "register", metadata: { provider: "email" } });
      res.status(201).json({
        ok: true,
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
        },
      });
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
      const userId = `email_${crypto.createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 24)}`;

      // runAsAdmin bypasses RLS — at login time there is no tenant context so the
      // users policy would otherwise filter out any row with a non-null tenant_id.
      const user = await runAsAdmin(pool, async (adminDb) => {
        const [row] = await adminDb.select().from(users).where(eq(users.id, userId));
        return row ?? null;
      });

      if (!user || user.provider !== "email" || !user.passwordHash) {
        recordFailedAttempt(ip);
        return res.status(401).json({ message: "Invalid email or password." });
      }

      if (user.isBanned) {
        return res.status(403).json({ banned: true, message: "This account has been suspended for violating our Terms of Service. If you believe this is a mistake, please contact support." });
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        recordFailedAttempt(ip);
        return res.status(401).json({ message: "Invalid email or password." });
      }

      recordSuccessfulLogin(ip);
      setAuthCookie(res, user as any, rememberMe === true);
      logAuthEvent({ userId: user.id, tenantId: user.tenantId ?? null, action: "login", metadata: { provider: "email", ip } });
      res.json({
        ok: true,
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
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // ── Logout & account management ───────────────────────────────────────────────

  app.post("/auth/logout", async (req, res) => {
    const jti = req.tokenJti;
    const exp = req.tokenExp;
    const uid = req.user?.id;
    const tid = req.user?.tenantId ?? null;

    if (jti && uid && exp) {
      const expiresAt = new Date(exp * 1000).toISOString();
      await revokeToken(jti, uid, expiresAt);
      logAuthEvent({ userId: uid, tenantId: tid, action: "logout" });
    }

    clearAuthCookie(res);
    res.json({ ok: true });
  });

  // ── Token refresh ─────────────────────────────────────────────────────────────
  // Validates the current token and issues a fresh 7-day token, resetting the
  // sliding session window. The old token is revoked so it cannot be reused.
  app.post("/api/auth/refresh", async (req, res, _next) => {
    let token = (req as any).cookies?.[AUTH_COOKIE];
    if (!token && typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.slice(7);
    }
    if (!token) return res.status(401).json({ message: "No token provided" });

    try {
      const payload = jwt.verify(token, getJwtSecret()) as any;

      if (payload.jti && _revokedJtis.has(payload.jti)) {
        return res.status(401).json({ message: "Token has been revoked" });
      }

      // Revoke old token before issuing new one
      if (payload.jti && payload.exp) {
        await revokeToken(payload.jti, payload.id, new Date(payload.exp * 1000).toISOString());
      }

      const [user] = await db.select().from(users).where(eq(users.id, payload.id));
      if (!user) return res.status(401).json({ message: "User not found" });
      if (user.isBanned) {
        return res.status(403).json({ banned: true, message: "Account suspended" });
      }

      const rememberMe = req.cookies?.["remember_me"] === "1";
      setAuthCookie(res, user as any, rememberMe);
      res.json({ ok: true });
    } catch {
      res.status(401).json({ message: "Invalid or expired token" });
    }
  });

  // ── Data export (GDPR/portability) ──────────────────────────────────────────
  // Owners can download a JSON archive of every record tied to their store
  // before they delete the account. Non-owners get just their personal rows.
  app.get("/api/auth/export", async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const uid = req.user.id;

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
        const { passwordHash: _ph, resetToken: _rt, resetTokenExpires: _rte, ...safe } = u;
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
    } catch (err: unknown) {
      console.error("[export-account] failed:", err instanceof Error ? err.message : String(err));
      next(err);
    }
  });

  app.delete("/api/auth/account", async (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const uid = req.user.id;
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

      // ── Bust all server-side caches for every wiped user ─────────────────
      // The settings cache is keyed by userId. Because email-based userIds are
      // deterministic (sha256 of email), a stale cache entry would be served to
      // the same user if they re-register with the same email — making it look
      // like "the business is still there" even though all DB rows were deleted.
      for (const wuid of userIdsToWipe) {
        cache.del(settingsCacheKey(wuid));
        invalidateTenantCache(wuid);
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
      return res.status(403).json({ banned: true, message: "Your account has been suspended for violating our Terms of Service." });
    }
    if (!req.user) return res.status(401).json({ user: null });
    const u = req.user;

    // ── Re-read live user state from DB ──────────────────────────────────────
    // The JWT is signed once at login and cached by the client for up to 7 days.
    // If the JWT was issued BEFORE onboarding completed (tenantId was null then),
    // the token still carries tenantId=null even though the DB now has a real
    // tenantId.  Without this re-read:
    //   1. /api/auth/me returns tenantId=null
    //   2. tenantContextMiddleware skips setting up the tenant context
    //   3. The settings query returns nothing
    //   4. needsOnboarding=true → user is force-redirected to onboarding again
    //
    // We use runAsAdmin so the SELECT bypasses RLS (same guarantee as
    // findOrCreateUser) and always returns the row regardless of tenant context.
    let liveRole = u.role ?? "owner";
    let liveTenantId: string | null = u.tenantId ?? null;
    let liveActiveBranchId: number | null = u.activeBranchId ?? null;
    try {
      const [dbUser] = await runAsAdmin(pool, async (adminDb) =>
        adminDb
          .select({
            tenantId: users.tenantId,
            role: users.role,
            isBanned: users.isBanned,
          })
          .from(users)
          .where(eq(users.id, u.id))
          .limit(1)
      );
      if (dbUser) {
        if (dbUser.isBanned) {
          return res.status(403).json({ banned: true, message: "Your account has been suspended for violating our Terms of Service." });
        }
        liveRole     = (dbUser.role as string) ?? liveRole;
        liveTenantId = (dbUser.tenantId as string | null) ?? liveTenantId;
      }
    } catch (err) {
      // Non-critical — fall back to JWT values if DB read fails
      console.warn("[auth/me] live user re-read failed, using JWT values:", (err as Error).message);
    }

    // Resolve the active branch's businessType / businessSubType so the client
    // can adapt navigation, terminology, and quick actions on a per-branch
    // basis (e.g. show "Tables" only on a cafe branch, "Bookings" only on a
    // salon branch). Falls back silently when the branch is missing.
    let activeBranch: { id: number; name: string; businessType: string | null; businessSubType: string | null } | null = null;
    try {
      if (liveActiveBranchId && liveTenantId) {
        const { branches } = await import("@shared/schema");
        const { and, eq: eqLocal } = await import("drizzle-orm");
        const [b] = await db
          .select({
            id: branches.id,
            name: branches.name,
            businessType: branches.businessType,
            businessSubType: branches.businessSubType,
          })
          .from(branches)
          .where(and(eqLocal(branches.id, liveActiveBranchId), eqLocal(branches.tenantId, liveTenantId)))
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
        tenantId: liveTenantId,
        role: liveRole,
        activeBranchId: liveActiveBranchId,
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
