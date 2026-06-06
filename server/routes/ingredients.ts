import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireManagerOrAbove, requirePro } from "../middleware";
import { insertIngredientSchema, insertWifiVoucherSchema } from "@shared/schema";
import { getUserId, auditLog, handleZodError } from "../lib/route-utils";
import { getAdapter, parseRouterConfig } from "../routers/factory";
import type { RouterConfig } from "../routers/types";

/** Read routerConfig from user settings and return typed + parsed */
function getRouterConfigFromSettings(s: any): RouterConfig | null {
  const parsed = parseRouterConfig(s?.routerConfig);
  if (!parsed || !parsed.enabled || !parsed.host) return null;
  return parsed;
}

export function registerIngredientRoutes(app: Express): void {
  // ── List ingredients ───────────────────────────────────────────────────────
  app.get("/api/ingredients", requireAuth, requirePro, async (req, res) => {
    const list = await storage.getIngredients(getUserId(req));
    res.json(list);
  });

  // ── Create ingredient ──────────────────────────────────────────────────────
  app.post("/api/ingredients", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    try {
      const input = insertIngredientSchema.parse(req.body);
      const created = await storage.createIngredient(getUserId(req), input);
      await auditLog(req, "create", "ingredient", String(created.id), { name: created.name });
      res.status(201).json(created);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Update ingredient ──────────────────────────────────────────────────────
  app.put(
    "/api/ingredients/:id",
    requireAuth,
    requirePro,
    requireManagerOrAbove,
    async (req, res) => {
      try {
        const input = insertIngredientSchema.partial().parse(req.body);
        const updated = await storage.updateIngredient(
          Number(req.params.id),
          getUserId(req),
          input,
        );
        if (!updated) return res.status(404).json({ message: "Ingredient not found" });
        await auditLog(req, "update", "ingredient", String(updated.id), { name: updated.name });
        res.json(updated);
      } catch (err) {
        if (!handleZodError(err, res)) throw err;
      }
    },
  );

  // ── Delete ingredient ──────────────────────────────────────────────────────
  app.delete(
    "/api/ingredients/:id",
    requireAuth,
    requirePro,
    requireManagerOrAbove,
    async (req, res) => {
      const id = Number(req.params.id);
      const uid = getUserId(req);
      const existing = await storage
        .getIngredients(uid)
        .then((list) => list.find((i) => i.id === id));
      await storage.deleteIngredient(id, uid);
      await auditLog(req, "delete", "ingredient", String(id), { name: existing?.name });
      res.status(204).end();
    },
  );

  // ── Adjust ingredient stock ────────────────────────────────────────────────
  app.post(
    "/api/ingredients/:id/stock",
    requireAuth,
    requirePro,
    requireManagerOrAbove,
    async (req, res) => {
      const delta = Number(req.body?.delta);
      if (!Number.isFinite(delta))
        return res.status(400).json({ message: "delta must be a number" });
      const updated = await storage.adjustIngredientStock(
        Number(req.params.id),
        getUserId(req),
        delta,
      );
      if (!updated) return res.status(404).json({ message: "Ingredient not found" });
      res.json(updated);
    },
  );
}

export function registerRecipeRoutes(app: Express): void {
  // ── Get product recipe ─────────────────────────────────────────────────────
  app.get("/api/products/:id/recipe", requireAuth, requirePro, async (req, res) => {
    const items = await storage.getRecipeForProduct(Number(req.params.id), getUserId(req));
    res.json(items);
  });

  // ── Set product recipe (replace all items) ─────────────────────────────────
  app.put(
    "/api/products/:id/recipe",
    requireAuth,
    requirePro,
    requireManagerOrAbove,
    async (req, res) => {
      try {
        const schema = z.object({
          items: z.array(
            z.object({
              ingredientId: z.coerce.number(),
              quantity: z.coerce.string(),
            }),
          ),
        });
        const input = schema.parse(req.body);
        const items = input.items.map((i) => ({
          ingredientId: i.ingredientId,
          quantity: i.quantity,
        }));
        await storage.setRecipeForProduct(Number(req.params.id), getUserId(req), items);
        const result = await storage.getRecipeForProduct(Number(req.params.id), getUserId(req));
        res.json(result);
      } catch (err) {
        if (!handleZodError(err, res)) throw err;
      }
    },
  );
}

export function registerWifiVoucherRoutes(app: Express): void {
  // ── List WiFi vouchers ─────────────────────────────────────────────────────
  app.get("/api/wifi-vouchers", requireAuth, requirePro, async (req, res) => {
    const list = await storage.getWifiVouchers(getUserId(req));
    res.json(list);
  });

  // ── Create WiFi voucher ────────────────────────────────────────────────────
  app.post("/api/wifi-vouchers", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertWifiVoucherSchema.parse(req.body);
      const created = await storage.createWifiVoucher(getUserId(req), input);
      await auditLog(req, "create", "wifi_voucher", String(created.id), { code: created.code });

      // Push to router if enabled — fire-and-forget so the response is instant
      const settings = await storage.getSettings(getUserId(req));
      const routerConfig = getRouterConfigFromSettings(settings);
      if (routerConfig) {
        const adapter = await getAdapter(routerConfig.type);
        adapter
          .createUser(routerConfig, created.code, created.durationMinutes)
          .then((routerId) => {
            if (routerId) storage.updateWifiVoucherMikrotikId(created.id, routerId).catch(() => {});
          })
          .catch(() => {});
      }

      res.status(201).json(created);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Redeem WiFi voucher ────────────────────────────────────────────────────
  app.post("/api/wifi-vouchers/redeem", requireAuth, requirePro, async (req, res) => {
    const code = String(req.body?.code || "").trim();
    if (!code) return res.status(400).json({ message: "code is required" });
    const v = await storage.redeemWifiVoucher(code, getUserId(req));
    if (!v) return res.status(404).json({ message: "Voucher not found" });
    await auditLog(req, "redeem", "wifi_voucher", String(v.id), { code: v.code });
    res.json(v);
  });

  // ── Test router connection (multi-vendor) ──────────────────────────────────
  app.post("/api/router/test", requireAuth, requirePro, async (req, res) => {
    const { type, host, port, username, password, useSsl, ...vendorExtras } = req.body;
    if (!type || !host) {
      return res
        .status(400)
        .json({ ok: false, message: "Router type and IP address are required" });
    }
    try {
      const adapter = await getAdapter(type);
      const config: RouterConfig = {
        type,
        enabled: false,
        host: String(host).trim(),
        port: port || "80",
        username: username || "admin",
        password: password || "",
        useSsl: !!useSsl,
        ...vendorExtras,
      };
      const result = await adapter.testConnection(config);
      res.json(result);
    } catch (err: any) {
      res.json({ ok: false, message: err?.message || "Unknown router type" });
    }
  });

  // ── Expire overdue vouchers + remove from router ───────────────────────────
  app.post("/api/router/sync", requireAuth, requirePro, async (req, res) => {
    const expired = await storage.expireOverdueVouchers();
    const byUser: Record<string, typeof expired> = {};
    for (const v of expired) (byUser[v.userId] ??= []).push(v);
    let removed = 0;
    for (const [userId, vouchers] of Object.entries(byUser)) {
      const settings = await storage.getSettings(userId);
      const routerConfig = getRouterConfigFromSettings(settings);
      if (!routerConfig) continue;
      const adapter = await getAdapter(routerConfig.type);
      for (const v of vouchers) {
        if (v.mikrotikUserId) {
          await adapter.removeUser(routerConfig, v.mikrotikUserId);
          removed++;
        }
      }
    }
    res.json({ expired: expired.length, removed });
  });
}
