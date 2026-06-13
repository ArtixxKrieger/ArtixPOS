import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireProOrBusinessFeature } from "../middleware";
import { insertCustomerSchema } from "@shared/schema";
import { cache, customersCacheKey } from "../cache";
import { getUserId, auditLog, handleZodError } from "../lib/route-utils";

export function registerCustomerRoutes(app: Express): void {

app.get("/api/customers", requireAuth, requireProOrBusinessFeature("/customers"), async (req, res) => {
    const uid = getUserId(req);
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const opts: { limit?: number; offset?: number; orderByTopSpenders?: boolean } = {};
    if (!isNaN(limitRaw) && limitRaw > 0) opts.limit = Math.min(limitRaw, 1000);
    if (!isNaN(offsetRaw) && offsetRaw >= 0) opts.offset = offsetRaw;
    if (req.query.orderByTopSpenders === "true") opts.orderByTopSpenders = true;

    const isDefault = !req.query.limit && !req.query.offset && !req.query.orderByTopSpenders;
    if (isDefault) {
      const ck = customersCacheKey(uid);
      const list = await cache.getOrFetch(ck, () => storage.getCustomers(uid, opts), 60_000);
      res.setHeader("Cache-Control", "no-store");
      return res.json(list);
    }
    res.json(await storage.getCustomers(uid, opts));
  });

app.get("/api/customers/:id", requireAuth, requireProOrBusinessFeature("/customers"), async (req, res) => {
    const customer = await storage.getCustomer(Number(req.params.id), getUserId(req));
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

app.post("/api/customers", requireAuth, requireProOrBusinessFeature("/customers"), async (req, res) => {
    try {
      const input = insertCustomerSchema.parse(req.body);
      const uid = getUserId(req);
      const customer = await storage.createCustomer(uid, input);
      cache.del(customersCacheKey(uid));
      await auditLog(req, "create", "customer", String(customer.id), { name: customer.name });
      res.status(201).json(customer);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

app.put("/api/customers/:id", requireAuth, requireProOrBusinessFeature("/customers"), async (req, res) => {
    try {
      const input = insertCustomerSchema.partial().parse(req.body);
      const customer = await storage.updateCustomer(Number(req.params.id), getUserId(req), input);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      await auditLog(req, "update", "customer", String(customer.id), { name: customer.name });
      res.json(customer);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

app.delete("/api/customers/:id", requireAuth, requireProOrBusinessFeature("/customers"), async (req, res) => {
    const id = Number(req.params.id);
    const uid = getUserId(req);
    const existing = await storage.getCustomer(id, uid);
    await storage.deleteCustomer(id, uid);
    await auditLog(req, "delete", "customer", String(id), { name: existing?.name });
    res.status(204).end();
  });

app.get("/api/customers/:id/sales", requireAuth, requireProOrBusinessFeature("/customers"), async (req, res) => {
    const salesList = await storage.getSales(getUserId(req), {
      customerId: Number(req.params.id),
      limit: 500,
    });
    res.json(salesList);
  });

app.post("/api/customers/:id/loyalty", requireAuth, requireProOrBusinessFeature("/customers") as any, async (req, res) => {
    try {
      const { delta, reason, saleId, note } = z.object({
        delta: z.number(),
        reason: z.string().optional(),
        saleId: z.number().optional(),
        note: z.string().optional(),
      }).parse(req.body);
      const customer = await storage.adjustLoyaltyPoints(Number(req.params.id), delta, getUserId(req), { reason, saleId, note });
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      res.json(customer);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

app.get("/api/customers/:id/loyalty-log", requireAuth, async (req, res, next) => {
    try {
      const logs = await storage.getLoyaltyPointsLog(Number(req.params.id), getUserId(req));
      res.json(logs);
    } catch (err) { next(err); }
  });

app.post("/api/customers/:id/redeem-reward", requireAuth, async (req, res, next) => {
    try {
      const { rewardId } = z.object({ rewardId: z.number().int() }).parse(req.body);
      const result = await storage.redeemLoyaltyReward(Number(req.params.id), rewardId, getUserId(req));
      if (!result) return res.status(400).json({ message: "Cannot redeem: insufficient points or invalid reward" });
      await auditLog(req, "create", "customer", String(req.params.id), { rewardId });
      res.json(result);
    } catch (err) {
      if (!handleZodError(err, res)) next(err);
    }
  });
}
