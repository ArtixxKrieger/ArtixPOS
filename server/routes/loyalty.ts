import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requirePro } from "../middleware";
import { getUserId, auditLog, handleZodError } from "../lib/route-utils";

export function registerLoyaltyRoutes(app: Express): void {

  // ─── Loyalty Tiers ────────────────────────────────────────────────────────

  app.get("/api/loyalty/tiers", requireAuth, requirePro, async (req, res, next) => {
    try { res.json(await storage.getLoyaltyTiers(getUserId(req))); } catch (err) { next(err); }
  });

  app.post("/api/loyalty/tiers", requireAuth, requirePro, async (req, res, next) => {
    try {
      const body = z.object({
        name: z.string().min(1),
        minLifetimePoints: z.number().int().min(0),
        multiplier: z.string().default("1"),
        color: z.string().default("#CD7F32"),
        perks: z.string().optional().nullable(),
        sortOrder: z.number().int().default(0),
      }).parse(req.body);
      const tier = await storage.createLoyaltyTier(getUserId(req), body);
      await auditLog(req, "create", "loyalty_tier", String(tier.id), {
        name: tier.name,
        minLifetimePoints: tier.minLifetimePoints,
      });
      res.status(201).json(tier);
    } catch (err) {
      if (!handleZodError(err, res)) next(err);
    }
  });

  app.patch("/api/loyalty/tiers/:id", requireAuth, requirePro, async (req, res, next) => {
    try {
      const updated = await storage.updateLoyaltyTier(Number(req.params.id), getUserId(req), req.body);
      if (!updated) return res.status(404).json({ message: "Tier not found" });
      await auditLog(req, "update", "loyalty_tier", String(updated.id), { name: updated.name });
      res.json(updated);
    } catch (err) { next(err); }
  });

  app.delete("/api/loyalty/tiers/:id", requireAuth, requirePro, async (req, res, next) => {
    try {
      const uid = getUserId(req);
      const existing = await storage.getLoyaltyTiers(uid).then(list => list.find(t => t.id === Number(req.params.id)));
      await storage.deleteLoyaltyTier(Number(req.params.id), uid);
      await auditLog(req, "delete", "loyalty_tier", String(req.params.id), { name: existing?.name });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ─── Loyalty Rewards Catalog ──────────────────────────────────────────────

  app.get("/api/loyalty/rewards", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getLoyaltyRewards(getUserId(req))); } catch (err) { next(err); }
  });

  app.post("/api/loyalty/rewards", requireAuth, requirePro, async (req, res, next) => {
    try {
      const body = z.object({
        name: z.string().min(1),
        description: z.string().optional().nullable(),
        type: z.enum(["discount_fixed", "discount_percent", "free_product", "stamp_card", "custom"]),
        pointsCost: z.number().int().min(1),
        value: z.string().default("0"),
        productId: z.number().int().optional().nullable(),
        isActive: z.boolean().default(true),
        maxRedemptions: z.number().int().optional().nullable(),
        expiresAt: z.string().optional().nullable(),
      }).parse(req.body);
      const reward = await storage.createLoyaltyReward(getUserId(req), body);
      await auditLog(req, "create", "loyalty_reward", String(reward.id), { name: reward.name, type: reward.type });
      res.status(201).json(reward);
    } catch (err) {
      if (!handleZodError(err, res)) next(err);
    }
  });

  app.patch("/api/loyalty/rewards/:id", requireAuth, requirePro, async (req, res, next) => {
    try {
      const updated = await storage.updateLoyaltyReward(Number(req.params.id), getUserId(req), req.body);
      if (!updated) return res.status(404).json({ message: "Reward not found" });
      await auditLog(req, "update", "loyalty_reward", String(updated.id), { name: updated.name, isActive: updated.isActive });
      res.json(updated);
    } catch (err) { next(err); }
  });

  app.delete("/api/loyalty/rewards/:id", requireAuth, requirePro, async (req, res, next) => {
    try {
      const uid = getUserId(req);
      const existing = await storage.getLoyaltyRewards(uid).then(list => list.find(r => r.id === Number(req.params.id)));
      await storage.deleteLoyaltyReward(Number(req.params.id), uid);
      await auditLog(req, "delete", "loyalty_reward", String(req.params.id), { name: existing?.name });
      res.status(204).end();
    } catch (err) { next(err); }
  });
}
