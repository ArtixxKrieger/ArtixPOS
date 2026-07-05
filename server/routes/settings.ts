import type { Express } from "express";
import { createHash } from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { requireAuth, getSubscription, isProSubscription } from "../middleware";
import { createTenant, getBranches, createBranch, updateBranch } from "../admin-storage";
import { dbSystem } from "../db";
import { eq } from "drizzle-orm";
import { users, PRO_POS_FEATURE_KEYS } from "@shared/schema";
import { fetchUserById, atomicClaimTenant, deleteOrphanedTenant } from "../infrastructure/persistence/settings";
import { setAuthCookie } from "../auth";
import { cache, TTL, settingsCacheKey } from "../cache";
import { invalidateTenantCache } from "../storage";
import { getUserId, getTenantId, auditLog, handleZodError } from "../lib/route-utils";

export function registerSettingsRoutes(app: Express): void {
  app.get(api.settings.get.path, requireAuth, async (req, res) => {
    const uid = getUserId(req);
    const cacheKey = settingsCacheKey(uid);

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

if (!settings.onboardingComplete && settings.storeName && settings.storeName !== "My Store") {
      storage.updateSettings(uid, { onboardingComplete: 1 }).catch(() => {});
      const healed = { ...settings, onboardingComplete: 1 };
      await cache.setAsync(cacheKey, healed, TTL.SETTINGS);
      res.setHeader("Cache-Control", "no-store");
      return res.json(healed);
    }

const settingsBusinessType = (settings as any).businessType as string | null | undefined;
    const settingsBusinessSubType = (settings as any).businessSubType as string | null | undefined;
    if (settingsBusinessType) {
      const tenantIdForHeal = getTenantId(req);
      if (tenantIdForHeal) {
        getBranches(tenantIdForHeal)
          .then(async (branchList: any[]) => {
            const mainBranch = branchList.find((b: any) => b.isMain) ?? branchList[0];
            if (
              mainBranch &&
              (mainBranch.businessType !== settingsBusinessType ||
                mainBranch.businessSubType !== settingsBusinessSubType)
            ) {
              await updateBranch(mainBranch.id, tenantIdForHeal, {
                businessType: settingsBusinessType,
                businessSubType: settingsBusinessSubType ?? null,
              });
            }
          })
          .catch(() => {});
      }
    }

    await cache.setAsync(cacheKey, settings, TTL.SETTINGS);
    res.setHeader("Cache-Control", "no-store");
    res.json(settings);
  });

  app.put(api.settings.update.path, requireAuth, async (req, res) => {
    try {
      const bodySchema = api.settings.update.input.extend({
        taxRate: z.coerce.string().optional(),
      });
      const input = bodySchema.parse(req.body);
      const uid = getUserId(req);

cache.del(settingsCacheKey(uid));

try {
        const [existingUser] = await dbSystem
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, uid))
          .limit(1);
        if (!existingUser) {
          const u = req.user!;
          const isEmailUser = !u.provider || u.provider === "email";
          if (isEmailUser) {

            return res.status(401).json({ message: "Account not found. Please log in again." });
          }
          console.warn(
            `[settings] User row missing for ${u.id} (${u.provider}) — auto-creating from JWT`,
          );
          await dbSystem
            .insert(users)
            .values({
              id: u.id,
              email: u.email ?? null,
              name: u.name ?? null,
              avatar: u.avatar ?? null,
              provider: u.provider ?? "email",
              providerId: u.email ?? u.id,

            } as any)
            .onConflictDoNothing();
        }
      } catch (userCheckErr: unknown) {
        console.error("[settings] Failed to ensure user row:", userCheckErr);
      }

const tenantIdForProCheck = (req.user as any)?.tenantId ?? null;
      if (tenantIdForProCheck) {
        try {
          const sub = await getSubscription(tenantIdForProCheck);
          if (!isProSubscription(sub)) {
            const proOnlyWifiFields = [
              "wifiEnabled",
              "wifiSsid",
              "wifiPassword",
              "wifiDurationMinutes",
              "wifiSecurityType",
              "wifiVoucherTitle",
              "wifiSpeedLabel",
              "wifiVoucherNote",
              "wifiShowQr",
              "wifiNetworkProfiles",
              "wifiActiveProfileId",
              "mikrotikEnabled",
              "mikrotikHost",
              "mikrotikPort",
              "mikrotikUser",
              "mikrotikPassword",
              "mikrotikHotspotProfile",
              "mikrotikUseSsl",
              "routerConfig",
            ];
            for (const field of proOnlyWifiFields) {
              delete (input as any)[field];
            }

if ((input as any).posFeatures && typeof (input as any).posFeatures === "object") {
              const pf = (input as any).posFeatures as Record<string, unknown>;
              for (const k of PRO_POS_FEATURE_KEYS) pf[k as string] = false;
            }
          }
        } catch (proCheckErr) {
          console.warn(
            "[settings] Pro check failed — allowing save without WiFi fields:",
            proCheckErr,
          );
        }
      }

      let settings: any;
      try {
        settings = await storage.updateSettings(uid, input);
      } catch (settingsErr: any) {
        const pgDetail = {
          code: settingsErr?.code ?? null,
          message: settingsErr?.message ?? String(settingsErr),
          detail: settingsErr?.detail ?? null,
          hint: settingsErr?.hint ?? null,
          table: settingsErr?.table ?? null,
          column: settingsErr?.column ?? null,
          constraint: settingsErr?.constraint ?? null,
          schema: settingsErr?.schema ?? null,
        };
        console.error(
          "[settings] updateSettings failed — userId:",
          uid,
          "pgDetail:",
          pgDetail,
          "full:",
          settingsErr,
        );
        return res.status(500).json({
          message: pgDetail.message,
          error: pgDetail,
        });
      }

      if (input.onboardingComplete === 1) {
        try {
          const user = req.user!;
          const branchName =
            (input.storeName as string | undefined) || settings.storeName || "Main Branch";

          const freshUser = await fetchUserById(uid);
          let currentTenantId = (freshUser?.tenantId as string | null) ?? null;

          if (!currentTenantId) {
            const newTenant = await createTenant(branchName);
            const claimResult = await atomicClaimTenant(uid, newTenant.id);
            if (claimResult.claimed) {
              currentTenantId = newTenant.id;
            } else {
              currentTenantId = claimResult.fallbackTenantId ?? null;
              await deleteOrphanedTenant(newTenant.id);
            }
            invalidateTenantCache(uid);

            if (currentTenantId) {
              const updatedUser = { ...user, tenantId: currentTenantId };
              try {
                setAuthCookie(res, updatedUser);
              } catch (cookieErr) {
                console.error("[onboarding] Failed to re-issue auth cookie:", cookieErr);
              }
            }
          }

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
                businessType:
                  (input.businessType as string | undefined) ||
                  (settings as any).businessType ||
                  null,
                businessSubType:
                  (input.businessSubType as string | undefined) ||
                  (settings as any).businessSubType ||
                  null,
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

      const tenantId = getTenantId(req);
      if (tenantId && input.onboardingComplete !== 1) {
        try {
          const branches = await getBranches(tenantId);
          const mainBranch = branches.find((b: any) => b.isMain) ?? branches[0];
          if (mainBranch) {
            const patch: Record<string, string | null> = {};
            if (input.storeName !== undefined) patch.name = input.storeName as string;
            if (input.businessType !== undefined)
              patch.businessType = (input.businessType as string) ?? null;
            if (input.businessSubType !== undefined)
              patch.businessSubType = (input.businessSubType as string) ?? null;
            if (Object.keys(patch).length > 0) {
              await updateBranch(mainBranch.id, tenantId, patch);
            }
          }
        } catch (branchSyncErr) {
          console.warn(
            "[settings] Failed to sync storeName/businessType to main branch:",
            branchSyncErr,
          );
        }
      }

if (input.onboardingComplete !== 1 && tenantId) {
        const changed: Record<string, unknown> = {};
        if (input.taxRate !== undefined) changed.taxRate = input.taxRate;
        if (input.loyaltyPointsPerUnit !== undefined)
          changed.loyaltyPointsPerUnit = input.loyaltyPointsPerUnit;
        if (input.loyaltyRedemptionRate !== undefined)
          changed.loyaltyRedemptionRate = input.loyaltyRedemptionRate;
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
        code: err?.code ?? null,
        message: err?.message ?? String(err),
        detail: err?.detail ?? null,
        hint: err?.hint ?? null,
        table: err?.table ?? null,
        column: err?.column ?? null,
        constraint: err?.constraint ?? null,
        schema: err?.schema ?? null,
      };
      console.error(
        "[settings] Unhandled error in PUT /api/settings — pgDetail:",
        pgDetail,
        "full:",
        err,
      );
      res.status(500).json({ message: pgDetail.message, error: pgDetail });
    }
  });
}
