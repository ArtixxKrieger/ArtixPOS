import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireManagerOrAbove } from "../middleware";
import { insertIngredientSchema, insertWifiVoucherSchema } from "@shared/schema";
import { getUserId, auditLog, handleZodError } from "../lib/route-utils";

export function registerIngredientRoutes(app: Express): void {

  // ── List ingredients ───────────────────────────────────────────────────────
  app.get("/api/ingredients", requireAuth, async (req, res) => {
    const list = await storage.getIngredients(getUserId(req));
    res.json(list);
  });

  // ── Create ingredient ──────────────────────────────────────────────────────
  app.post("/api/ingredients", requireAuth, requireManagerOrAbove, async (req, res) => {
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
  app.put("/api/ingredients/:id", requireAuth, requireManagerOrAbove, async (req, res) => {
    try {
      const input = insertIngredientSchema.partial().parse(req.body);
      const updated = await storage.updateIngredient(Number(req.params.id), getUserId(req), input);
      if (!updated) return res.status(404).json({ message: "Ingredient not found" });
      await auditLog(req, "update", "ingredient", String(updated.id), { name: updated.name });
      res.json(updated);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Delete ingredient ──────────────────────────────────────────────────────
  app.delete("/api/ingredients/:id", requireAuth, requireManagerOrAbove, async (req, res) => {
    const id = Number(req.params.id);
    const uid = getUserId(req);
    const existing = await storage.getIngredients(uid).then(list => list.find(i => i.id === id));
    await storage.deleteIngredient(id, uid);
    await auditLog(req, "delete", "ingredient", String(id), { name: existing?.name });
    res.status(204).end();
  });

  // ── Adjust ingredient stock ────────────────────────────────────────────────
  app.post("/api/ingredients/:id/stock", requireAuth, requireManagerOrAbove, async (req, res) => {
    const delta = Number(req.body?.delta);
    if (!Number.isFinite(delta)) return res.status(400).json({ message: "delta must be a number" });
    const updated = await storage.adjustIngredientStock(Number(req.params.id), getUserId(req), delta);
    if (!updated) return res.status(404).json({ message: "Ingredient not found" });
    res.json(updated);
  });
}

export function registerRecipeRoutes(app: Express): void {

  // ── Get product recipe ─────────────────────────────────────────────────────
  app.get("/api/products/:id/recipe", requireAuth, async (req, res) => {
    const items = await storage.getRecipeForProduct(Number(req.params.id), getUserId(req));
    res.json(items);
  });

  // ── Set product recipe (replace all items) ─────────────────────────────────
  app.put("/api/products/:id/recipe", requireAuth, requireManagerOrAbove, async (req, res) => {
    try {
      const schema = z.object({
        items: z.array(z.object({
          ingredientId: z.coerce.number(),
          quantity: z.coerce.string(),
        })),
      });
      const input = schema.parse(req.body);
      const items = input.items.map(i => ({ ingredientId: i.ingredientId, quantity: i.quantity }));
      await storage.setRecipeForProduct(Number(req.params.id), getUserId(req), items);
      const result = await storage.getRecipeForProduct(Number(req.params.id), getUserId(req));
      res.json(result);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });
}

export function registerWifiVoucherRoutes(app: Express): void {

  // ── List WiFi vouchers ─────────────────────────────────────────────────────
  app.get("/api/wifi-vouchers", requireAuth, async (req, res) => {
    const list = await storage.getWifiVouchers(getUserId(req));
    res.json(list);
  });

  // ── Create WiFi voucher ────────────────────────────────────────────────────
  app.post("/api/wifi-vouchers", requireAuth, async (req, res) => {
    try {
      const input = insertWifiVoucherSchema.parse(req.body);
      const created = await storage.createWifiVoucher(getUserId(req), input);
      await auditLog(req, "create", "wifi_voucher", String(created.id), { code: created.code });
      res.status(201).json(created);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Redeem WiFi voucher ────────────────────────────────────────────────────
  app.post("/api/wifi-vouchers/redeem", requireAuth, async (req, res) => {
    const code = String(req.body?.code || "").trim();
    if (!code) return res.status(400).json({ message: "code is required" });
    const v = await storage.redeemWifiVoucher(code, getUserId(req));
    if (!v) return res.status(404).json({ message: "Voucher not found" });
    await auditLog(req, "redeem", "wifi_voucher", String(v.id), { code: v.code });
    res.json(v);
  });
}
