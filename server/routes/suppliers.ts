import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requirePro } from "../middleware";
import { insertSupplierSchema, insertPurchaseOrderSchema } from "@shared/schema";
import { cache, suppliersCacheKey } from "../cache";
import { getUserId, auditLog, handleZodError } from "../lib/route-utils";

export function registerSupplierRoutes(app: Express): void {

  // ── List suppliers ─────────────────────────────────────────────────────────
  app.get("/api/suppliers", requireAuth, requirePro, async (req, res) => {
    const uid = getUserId(req);
    const ck = suppliersCacheKey(uid);
    const cached = cache.get<object[]>(ck);
    if (cached) return res.json(cached);
    const list = await storage.getSuppliers(uid);
    cache.set(ck, list, 120_000); // 2 min — suppliers change rarely
    res.json(list);
  });

  // ── Create supplier ────────────────────────────────────────────────────────
  app.post("/api/suppliers", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertSupplierSchema.parse(req.body);
      const uid = getUserId(req);
      const supplier = await storage.createSupplier(uid, input);
      cache.del(suppliersCacheKey(uid));
      res.status(201).json(supplier);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Update supplier ────────────────────────────────────────────────────────
  app.put("/api/suppliers/:id", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertSupplierSchema.partial().parse(req.body);
      const uid = getUserId(req);
      const supplier = await storage.updateSupplier(Number(req.params.id), uid, input);
      if (!supplier) return res.status(404).json({ message: "Supplier not found" });
      cache.del(suppliersCacheKey(uid));
      res.json(supplier);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Delete supplier ────────────────────────────────────────────────────────
  app.delete("/api/suppliers/:id", requireAuth, requirePro, async (req, res, next) => {
    try {
      const sid = Number(req.params.id);
      const uid = getUserId(req);
      const existing = await storage.getSuppliers(uid).then(list => list.find(s => s.id === sid));
      await storage.deleteSupplier(sid, uid);
      cache.del(suppliersCacheKey(uid));
      await auditLog(req, "delete", "supplier", String(sid), { name: existing?.name });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  // ── Supplier stats ─────────────────────────────────────────────────────────
  app.get("/api/suppliers/:id/stats", requireAuth, requirePro, async (req, res) => {
    const stats = await storage.getSupplierStats(getUserId(req), Number(req.params.id));
    res.json(stats);
  });

  // ── Products linked to a supplier ─────────────────────────────────────────
  app.get("/api/suppliers/:id/products", requireAuth, requirePro, async (req, res) => {
    const items = await storage.getSupplierProducts(Number(req.params.id), getUserId(req));
    res.json(items);
  });

  // ── Link a product to a supplier ─────────────────────────────────────────
  app.post("/api/suppliers/:id/products", requireAuth, requirePro, async (req, res) => {
    try {
      const { insertSupplierProductSchema } = await import("@shared/schema");
      const input = insertSupplierProductSchema.parse(req.body);
      const item = await storage.upsertSupplierProduct(Number(req.params.id), getUserId(req), input);
      res.status(201).json(item);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Unlink a supplier product ──────────────────────────────────────────────
  app.delete("/api/supplier-products/:id", requireAuth, requirePro, async (req, res) => {
    await storage.deleteSupplierProduct(Number(req.params.id), getUserId(req));
    res.status(204).end();
  });
}

export function registerPurchaseOrderRoutes(app: Express): void {

  // ── List purchase orders ───────────────────────────────────────────────────
  app.get("/api/purchase-orders", requireAuth, requirePro, async (req, res) => {
    const list = await storage.getPurchaseOrders(getUserId(req));
    res.json(list);
  });

  // ── Create purchase order ──────────────────────────────────────────────────
  app.post("/api/purchase-orders", requireAuth, requirePro, async (req, res) => {
    try {
      const input = insertPurchaseOrderSchema.parse(req.body);
      const po = await storage.createPurchaseOrder(getUserId(req), input);
      await auditLog(req, "create", "purchase_order", String(po.id), { totalAmount: po.totalAmount, status: po.status });
      res.status(201).json(po);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Receive a purchase order ───────────────────────────────────────────────
  app.post("/api/purchase-orders/:id/receive", requireAuth, requirePro, async (req, res) => {
    const po = await storage.receivePurchaseOrder(Number(req.params.id), getUserId(req));
    if (!po) return res.status(404).json({ message: "Purchase order not found" });
    await auditLog(req, "receive", "purchase_order", String(po.id), { totalAmount: po.totalAmount });
    res.json(po);
  });

  // ── Cancel a purchase order ────────────────────────────────────────────────
  app.post("/api/purchase-orders/:id/cancel", requireAuth, requirePro, async (req, res) => {
    const po = await storage.cancelPurchaseOrder(Number(req.params.id), getUserId(req));
    if (!po) return res.status(404).json({ message: "Purchase order not found" });
    await auditLog(req, "cancel", "purchase_order", String(po.id), { totalAmount: po.totalAmount });
    res.json(po);
  });

  // ── Update payment status ──────────────────────────────────────────────────
  app.patch("/api/purchase-orders/:id/payment", requireAuth, requirePro, async (req, res) => {
    const { paymentStatus } = req.body;
    if (!["unpaid", "partial", "paid"].includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status" });
    }
    const po = await storage.updatePurchaseOrderPayment(Number(req.params.id), getUserId(req), paymentStatus);
    if (!po) return res.status(404).json({ message: "Purchase order not found" });
    await auditLog(req, "update_payment", "purchase_order", String(po.id), { paymentStatus });
    res.json(po);
  });
}
