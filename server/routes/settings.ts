import type { Express } from "express";
import { createHash } from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { requireAuth } from "../middleware";
import { createTenant, getBranches, createBranch } from "../admin-storage";
import { db } from "../db";
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
    const cached = cache.get<object>(cacheKey);
    if (cached) {
      const etag = `"s-${createHash("sha1").update(JSON.stringify(cached)).digest("hex").slice(0, 16)}"`;
      if (req.headers["if-none-match"] === etag) return res.status(304).end();
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, max-age=120");
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
      cache.set(cacheKey, healed, TTL.SETTINGS);
      res.setHeader("Cache-Control", "private, max-age=120");
      return res.json(healed);
    }

    cache.set(cacheKey, settings, TTL.SETTINGS);
    res.setHeader("Cache-Control", "private, max-age=120");
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

      // Guard: ensure the user row exists before inserting settings (FK constraint)
      // Handles cases where the JWT was issued but the DB row was never persisted.
      try {
        const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, uid)).limit(1);
        if (!existingUser) {
          const u = req.user as any;
          console.warn(`[settings] User row missing for ${u.id} — auto-creating from JWT`);
          await db.insert(users).values({
            id: u.id,
            email: u.email ?? null,
            name: u.name ?? null,
            avatar: u.avatar ?? null,
            provider: u.provider ?? "email",
            providerId: u.email ?? u.id,
          } as any).onConflictDoNothing();
        }
      } catch (userCheckErr: any) {
        console.error("[settings] Failed to ensure user row:", userCheckErr);
      }

      let settings: any;
      try {
        settings = await storage.updateSettings(uid, input);
      } catch (settingsErr: any) {
        console.error("[settings] updateSettings failed:", settingsErr);
        return res.status(500).json({
          message: `Failed to save settings: ${settingsErr?.message || String(settingsErr)}`,
        });
      }

      // Auto-create tenant + main branch when owner completes onboarding
      if (input.onboardingComplete === 1) {
        try {
          const user = req.user as any;
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

      // Log settings changes (skip onboarding-only updates)
      if (input.onboardingComplete !== 1 && getTenantId(req)) {
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
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });
}
