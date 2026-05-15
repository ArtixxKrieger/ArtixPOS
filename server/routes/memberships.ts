import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requirePro, requireProOrBusinessFeature, requireManagerOrAbove } from "../middleware";
import { insertMembershipPlanSchema, insertMembershipSchema, insertMembershipCheckInSchema } from "@shared/schema";
import { getUserId, auditLog, handleZodError } from "../lib/route-utils";

export function registerMembershipRoutes(app: Express): void {

  // ─── Membership Plans ─────────────────────────────────────────────────────

  app.get("/api/membership-plans", requireAuth, requireProOrBusinessFeature("/memberships"), async (req, res) => {
    const plans = await storage.getMembershipPlans(getUserId(req));
    res.json(plans);
  });

  app.post("/api/membership-plans", requireAuth, requireProOrBusinessFeature("/memberships"), requireManagerOrAbove, async (req, res) => {
    try {
      const input = insertMembershipPlanSchema.parse(req.body);
      const plan = await storage.createMembershipPlan(getUserId(req), input);
      await auditLog(req, "create", "membership_plan", String(plan.id), { name: plan.name, price: plan.price });
      res.status(201).json(plan);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.put("/api/membership-plans/:id", requireAuth, requireProOrBusinessFeature("/memberships"), requireManagerOrAbove, async (req, res) => {
    try {
      const input = insertMembershipPlanSchema.partial().parse(req.body);
      const plan = await storage.updateMembershipPlan(Number(req.params.id), getUserId(req), input);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      await auditLog(req, "update", "membership_plan", String(plan.id), { name: plan.name, price: plan.price });
      res.json(plan);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.delete("/api/membership-plans/:id", requireAuth, requireProOrBusinessFeature("/memberships"), requireManagerOrAbove, async (req, res) => {
    const id = Number(req.params.id);
    const uid = getUserId(req);
    const existing = await storage.getMembershipPlans(uid).then(list => list.find(p => p.id === id));
    await storage.deleteMembershipPlan(id, uid);
    await auditLog(req, "delete", "membership_plan", String(id), { name: existing?.name });
    res.status(204).end();
  });

  // ─── Memberships ──────────────────────────────────────────────────────────

  app.get("/api/memberships", requireAuth, requireProOrBusinessFeature("/memberships"), async (req, res) => {
    const list = await storage.getMemberships(getUserId(req));
    res.json(list);
  });

  app.get("/api/memberships/:id", requireAuth, requireProOrBusinessFeature("/memberships"), async (req, res) => {
    const m = await storage.getMembership(Number(req.params.id), getUserId(req));
    if (!m) return res.status(404).json({ message: "Membership not found" });
    res.json(m);
  });

  app.post("/api/memberships", requireAuth, requireProOrBusinessFeature("/memberships"), async (req, res) => {
    try {
      const input = insertMembershipSchema.parse(req.body);
      const m = await storage.createMembership(getUserId(req), input);
      await auditLog(req, "create", "membership", String(m.id), { customerId: m.customerId, planId: m.planId, status: m.status });
      res.status(201).json(m);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.put("/api/memberships/:id", requireAuth, requireProOrBusinessFeature("/memberships"), async (req, res) => {
    try {
      const input = insertMembershipSchema.partial().parse(req.body);
      const m = await storage.updateMembership(Number(req.params.id), getUserId(req), input);
      if (!m) return res.status(404).json({ message: "Membership not found" });
      await auditLog(req, "update", "membership", String(m.id), { status: m.status, planId: m.planId });
      res.json(m);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.delete("/api/memberships/:id", requireAuth, requireProOrBusinessFeature("/memberships"), requireManagerOrAbove, async (req, res) => {
    const id = Number(req.params.id);
    const uid = getUserId(req);
    const existing = await storage.getMembership(id, uid);
    await storage.deleteMembership(id, uid);
    await auditLog(req, "delete", "membership", String(id), { customerId: existing?.customerId, planId: existing?.planId });
    res.status(204).end();
  });

  // ─── Member Check-Ins ─────────────────────────────────────────────────────

  app.post("/api/memberships/:id/check-in", requireAuth, requireProOrBusinessFeature("/memberships"), async (req, res) => {
    try {
      const uid = getUserId(req);
      const m = await storage.getMembership(Number(req.params.id), uid);
      if (!m) return res.status(404).json({ message: "Membership not found" });
      if (m.status !== "active") return res.status(400).json({ message: "Membership is not active" });
      const input = insertMembershipCheckInSchema.parse({ membershipId: m.id, customerId: m.customerId, ...req.body });
      const checkIn = await storage.checkInMember(uid, input);
      res.status(201).json(checkIn);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.get("/api/memberships/:id/check-ins", requireAuth, requirePro, async (req, res) => {
    const checkIns = await storage.getCheckIns(Number(req.params.id), getUserId(req));
    res.json(checkIns);
  });
}
