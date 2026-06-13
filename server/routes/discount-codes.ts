import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requirePro } from "../middleware";
import { insertDiscountCodeSchema } from "@shared/schema";
import { getUserId, auditLog, handleZodError } from "../lib/route-utils";

export function registerDiscountCodeRoutes(app: Express): void {

app.get("/api/discount-codes", requireAuth, requirePro, async (req, res) => {
    const list = await storage.getDiscountCodes(getUserId(req));
    res.json(list);
  });

app.post("/api/discount-codes/validate", requireAuth, requirePro, async (req, res) => {
    try {
      const { code, orderTotal } = z.object({ code: z.string(), orderTotal: z.number() }).parse(req.body);
      const dc = await storage.getDiscountCodeByCode(code, getUserId(req));
      if (!dc) return res.status(404).json({ message: "Invalid discount code" });
      if (!dc.isActive) return res.status(400).json({ message: "Discount code is inactive" });
      if (dc.expiresAt && new Date(dc.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Discount code has expired" });
      }
      if (dc.maxUses && (dc.usedCount ?? 0) >= dc.maxUses) {
        return res.status(400).json({ message: "Discount code has reached its usage limit" });
      }
      const minOrder = parseFloat(dc.minOrder ?? "0");
      if (orderTotal < minOrder) {
        return res.status(400).json({ message: `Minimum order amount is ${minOrder}` });
      }
      const value = parseFloat(dc.value);
      const discountAmount = dc.type === "percentage"
        ? (orderTotal * value) / 100
        : Math.min(value, orderTotal);
      res.json({ ...dc, discountAmount: discountAmount.toFixed(2) });
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

app.post("/api/discount-codes", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertDiscountCodeSchema.parse(req.body);
      const dc = await storage.createDiscountCode(getUserId(req), input);
      await auditLog(req, "create", "discount_code", String(dc.id), { code: dc.code, type: dc.type, value: dc.value });
      res.status(201).json(dc);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

app.put("/api/discount-codes/:id", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertDiscountCodeSchema.partial().parse(req.body);
      const dc = await storage.updateDiscountCode(Number(req.params.id), getUserId(req), input);
      if (!dc) return res.status(404).json({ message: "Discount code not found" });
      await auditLog(req, "update", "discount_code", String(dc.id), { code: dc.code });
      res.json(dc);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

app.delete("/api/discount-codes/:id", requireAuth, requirePro, async (req, res) => {
    const id = Number(req.params.id);
    const uid = getUserId(req);
    const list = await storage.getDiscountCodes(uid);
    const existing = list.find(d => d.id === id);
    await storage.deleteDiscountCode(id, uid);
    await auditLog(req, "delete", "discount_code", String(id), { code: existing?.code });
    res.status(204).end();
  });
}
