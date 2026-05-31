import type { Express } from "express";
import { createHash } from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { requireAuth, getSubscription, isProSubscription } from "../middleware";
import { createTenant, getBranches, createBranch, updateBranch } from "../admin-storage";
import { db, dbSystem } from "../db";
import { eq, sql } from "drizzle-orm";
import { users, tenants } from "@shared/schema";
import { setAuthCookie } from "../auth";
import { cache, TTL, settingsCacheKey } from "../cache";
import { invalidateTenantCache } from "../storage";
import { getUserId, getTenantId, auditLog, handleZodError } from "../lib/route-utils";

export function registerSettingsRoutes(app: Express): void {

  // ── Get settings ───────────────────────────────────────────────────────────
  app.get(api.settings.get.path, requireAuth, async (req, res) => {
    const uid = getUserId(req);
    const cacheKey = settingsCacheKey(uid);
    // getOrFetch deduplicates concurrent cache-miss requests (stampede prevention).
    // Settings can be null pre-onboarding, so we use a sentinel to distinguish
    // "not cached" from "cached but null". A null result is NOT cached so the
    // next request re-checks after the user completes onboarding.
    const cached = await cache.getAsync<object>(cacheKey);
    if (cached) {
      const etag = `"s-${createHash("sha1").update(JSON.stringify(cached)).digest("hex").slice(0, 16)}"`;
      if (req.headers["if-none-match"] === etag) return res.status(304).end();
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "no-store");
      return res.json(cached);
    }

    const settings = await storage.getSettings(uid);
    if (!settings) {
      // No settings yet (pre-onboarding) — don't cache, it will change soon
      return res.json({
        id: 0,
        userId: uid,
        storeName: "My Store",
        currency: "$",
        taxRate: "0",
        address: null,
        phone: null,
        emailContact: null,
        receiptFooter: "Thank you for your business!",
        timezone: null,
        onboardingComplete: 0,
      });
    }

    // Auto-heal: existing users set up before onboarding was introduced have
    // onboardingComplete = 0 in the DB but have already configured their store.
    // If the store name has been customised (≠ default), mark onboarding as done.
    if (!settings.onboardingComplete && settings.storeName && settings.storeName !== "My Store") {
      storage.updateSettings(uid, { onboardingComplete: 1 }).catch(() => {});
      const healed = { ...settings, onboardingComplete: 1 };
      await cache.setAsync(cacheKey, healed, TTL.SETTINGS);
      res.setHeader("Cache-Control", "no-store");
      return res.json(healed);
    }

    // Auto-heal: if the store settings have a businessType but the main branch
    // has a different (or missing) businessType, sync them. This fixes stores
    // where the branch was seeded with a different type than what the owner set.
    const settingsBusinessType = (settings as any).businessType as string | null | undefined;
    const settingsBusinessSubType = (settings as any).businessSubType as string | null | undefined;
    if (settingsBusinessType) {
      const tenantIdForHeal = getTenantId(req);
      if (tenantIdForHeal) {
        getBranches(tenantIdForHeal).then(async (branchList: any[]) => {
          const mainBranch = branchList.find((b: any) => b.isMain) ?? branchList[0];
          if (mainBranch && (
            mainBranch.businessType !== settingsBusinessType ||
            mainBranch.businessSubType !== settingsBusinessSubType
          )) {
            await updateBranch(mainBranch.id, tenantIdForHeal, {
              businessType: settingsBusinessType,
              businessSubType: settingsBusinessSubType ?? null,
            });
          }
        }).catch(() => {});
      }
    }

    await cache.setAsync(cacheKey, settings, TTL.SETTINGS);
    res.setHeader("Cache-Control", "no-store");
    res.json(settings);
  });

  // ── Update settings ────────────────────────────────────────────────────────
  app.put(api.settings.update.path, requireAuth, async (req, res) => {
    try {
      const bodySchema = api.settings.update.input.extend({
        taxRate: z.coerce.string().optional(),
      });
      const input = bodySchema.parse(req.body);
      const uid = getUserId(req);

      // Bust settings cache so the next GET returns fresh data
      cache.del(settingsCacheKey(uid));

      // Guard: ensure the user row exists before inserting settings (FK constraint).
      // Uses dbSystem (postgres / BYPASSRLS) so the check never fails due to RLS
      // and never poisons the tenant-context transaction with an aborted query.
      // IMPORTANT: we only auto-create for OAuth/native providers (Google, Facebook,
      // Capacitor). Email/password users are always created during /api/auth/register
      // so a missing row means the account was deleted — do NOT recreate it or a
      // deleted account can be brought back by replaying a stale JWT.
      try {
        const [existingUser] = await dbSystem.select({ id: users.id }).from(users).where(eq(users.id, uid)).limit(1);
        if (!existingUser) {
          const u = req.user!;
          const isEmailUser = !u.provider || u.provider === "email";
          if (isEmailUser) {
            // Email users are hard-deleted — do not resurrect from a stale JWT.
            return res.status(401).json({ message: "Account not found. Please log in again." });
          }
          console.warn(`[settings] User row missing for ${u.id} (${u.provider}) — auto-creating from JWT`);
          await dbSystem.insert(users).values({
            id: u.id,
            email: u.email ?? null,
            name: u.name ?? null,
            avatar: u.avatar ?? null,
            provider: u.provider ?? "email",
            providerId: u.email ?? u.id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any).onConflictDoNothing();
        }
      } catch (userCheckErr: unknown) {
        console.error("[settings] Failed to ensure user row:", userCheckErr);
      }

      // ── Pro-only field guard ───────────────────────────────────────────────
      // Strip WiFi voucher fields and Pro posFeatures server-side if not on Pro.
      // This prevents free users from bypassing the UI paywall via direct API calls.
      const tenantIdForProCheck = (req.user as any)?.tenantId ?? null;
      if (tenantIdForProCheck) {
        try {
          const sub = await getSubscription(tenantIdForProCheck);
          if (!isProSubscription(sub)) {
            const proOnlyWifiFields = [
              "wifiEnabled", "wifiSsid", "wifiPassword", "wifiDurationMinutes",
              "wifiSecurityType", "wifiVoucherTitle", "wifiSpeedLabel", "wifiVoucherNote",
              "wifiShowQr", "wifiNetworkProfiles", "wifiActiveProfileId",
            ];
            for (const field of proOnlyWifiFields) {
              delete (input as any)[field];
            }
            // Strip Pro POS feature flags — free users cannot enable Pro features
            // by directly calling the API (all Pro flags are forced to false).
            if ((input as any).posFeatures && typeof (input as any).posFeatures === "object") {
              const pf = (input as any).posFeatures as Record<string, unknown>;
              pf.tables = false;
              pf.kitchenDisplay = false;
              pf.splitBill = false;
              pf.loyalty = false;
            }
          }
        } catch (proCheckErr) {
          console.warn("[settings] Pro check failed — allowing save without WiFi fields:", proCheckErr);
        }
      }

      let settings: any;
      try {
        settings = await storage.updateSettings(uid, input);
      } catch (settingsErr: any) {
        const pgDetail = {
          code:       settingsErr?.code       ?? null,
          message:    settingsErr?.message    ?? String(settingsErr),
          detail:     settingsErr?.detail     ?? null,
          hint:       settingsErr?.hint       ?? null,
          table:      settingsErr?.table      ?? null,
          column:     settingsErr?.column     ?? null,
          constraint: settingsErr?.constraint ?? null,
          schema:     settingsErr?.schema     ?? null,
        };
        console.error("[settings] updateSettings failed — userId:", uid, "pgDetail:", pgDetail, "full:", settingsErr);
        return res.status(500).json({
          message: pgDetail.message,
          error: pgDetail,
        });
      }

      // Auto-create tenant + main branch when owner completes onboarding
      if (input.onboardingComplete === 1) {
        try {
          const user = req.user!;
          const branchName = (input.storeName as string | undefined) || settings.storeName || "Main Branch";

          // Always re-read the user row from the DB instead of trusting the JWT's
          // tenantId. The JWT is stale right after registration, and a double-clicked
          // "Complete onboarding" used to race itself into creating two tenants.
          const [freshUser] = await db.select().from(users).where(eq(users.id, uid));
          let currentTenantId = (freshUser?.tenantId as string | null) ?? null;

          // If the user has no tenant yet (email/password owners), create one —
          // guarded by UPDATE … WHERE tenantId IS NULL so concurrent requests can't both win.
          if (!currentTenantId) {
            const newTenant = await createTenant(branchName);
            const claim = await db.execute(
              sql`UPDATE users SET tenant_id = ${newTenant.id} WHERE id = ${uid} AND tenant_id IS NULL`
            );
            const claimed = (claim as any).rowCount === 1 || (claim as any).rowsAffected === 1;
            if (claimed) {
              currentTenantId = newTenant.id;
            } else {
              // Another concurrent request beat us to it — drop the spare tenant we just
              // created and use the one already linked.
              const [refreshed] = await db.select().from(users).where(eq(users.id, uid));
              currentTenantId = refreshed?.tenantId ?? null;
              try { await db.delete(tenants).where(eq(tenants.id, newTenant.id)); } catch {}
            }
            invalidateTenantCache(uid);

            if (currentTenantId) {
              const updatedUser = { ...user, tenantId: currentTenantId };
              try { setAuthCookie(res, updatedUser); } catch (cookieErr) {
                console.error("[onboarding] Failed to re-issue auth cookie:", cookieErr);
              }
            }
          }

          // Create main branch if one doesn't already exist.
          if (currentTenantId) {
            const existingBranches = await getBranches(currentTenantId);
            const hasMain = existingBranches.some((b: any) => b.isMain);
            if (!hasMain) {
              await createBranch(currentTenantId, {
                name: branchName,
                address: (input.address as string | undefined) || settings.address || null,
                phone: (input.phone as string | undefined) || settings.phone || null,
                isMain: true,
                isActive: true,
                businessType: (input.businessType as string | undefined) || (settings as any).businessType || null,
                businessSubType: (input.businessSubType as string | undefined) || (settings as any).businessSubType || null,
              });
            }
          }
        } catch (onboardErr: any) {
          console.error("[onboarding] Failed to create tenant/branch:", onboardErr);
          return res.status(500).json({
            message: `Failed to set up your store: ${onboardErr?.message || String(onboardErr)}`,
          });
        }
      }

      // Sync storeName / businessType / businessSubType to the main branch.
      // The header in the client reads activeBranch.name (from the JWT/auth endpoint),
      // NOT user_settings.store_name directly. So whenever storeName changes we must
      // also update the branch name, otherwise the header keeps showing the stale name.
      const tenantId = getTenantId(req);
      if (tenantId && input.onboardingComplete !== 1) {
        try {
          const branches = await getBranches(tenantId);
          const mainBranch = branches.find((b: any) => b.isMain) ?? branches[0];
          if (mainBranch) {
            const patch: Record<string, string | null> = {};
            if (input.storeName !== undefined) patch.name = input.storeName as string;
            if (input.businessType !== undefined) patch.businessType = (input.businessType as string) ?? null;
            if (input.businessSubType !== undefined) patch.businessSubType = (input.businessSubType as string) ?? null;
            if (Object.keys(patch).length > 0) {
              await updateBranch(mainBranch.id, tenantId, patch);
            }
          }
        } catch (branchSyncErr) {
          console.warn("[settings] Failed to sync storeName/businessType to main branch:", branchSyncErr);
        }
      }

      // Log settings changes (skip onboarding-only updates)
      if (input.onboardingComplete !== 1 && tenantId) {
        const changed: Record<string, unknown> = {};
        if (input.taxRate !== undefined) changed.taxRate = input.taxRate;
        if (input.loyaltyPointsPerUnit !== undefined) changed.loyaltyPointsPerUnit = input.loyaltyPointsPerUnit;
        if (input.loyaltyRedemptionRate !== undefined) changed.loyaltyRedemptionRate = input.loyaltyRedemptionRate;
        if (input.storeName !== undefined) changed.storeName = input.storeName;
        if (input.currency !== undefined) changed.currency = input.currency;
        if (Object.keys(changed).length > 0) {
          await auditLog(req, "update", "settings", undefined, changed);
        }
      }

      res.json(settings);
    } catch (err: any) {
      if (handleZodError(err, res)) return;
      const pgDetail = {
        code:       err?.code       ?? null,
        message:    err?.message    ?? String(err),
        detail:     err?.detail     ?? null,
        hint:       err?.hint       ?? null,
        table:      err?.table      ?? null,
        column:     err?.column     ?? null,
        constraint: err?.constraint ?? null,
        schema:     err?.schema     ?? null,
      };
      console.error("[settings] Unhandled error in PUT /api/settings — pgDetail:", pgDetail, "full:", err);
      res.status(500).json({ message: pgDetail.message, error: pgDetail });
    }
  });

}
