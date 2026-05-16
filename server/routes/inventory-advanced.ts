import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAuth, requireManagerOrAbove } from "../middleware";
import { getUserId, getActiveBranchId, resolveBranchId } from "../lib/route-utils";

export function registerInventoryAdvancedRoutes(app: Express): void {

  // ── Waste Log ──────────────────────────────────────────────────────────────

  app.get("/api/waste-log", requireAuth, async (req, res, next) => {
    try {
      const uid = getUserId(req);
      const branch = getActiveBranchId(req);
      const logs = await storage.getWasteLogs(uid, branch);
      res.json(logs);
    } catch (err) { next(err); }
  });

  app.post("/api/waste-log", requireAuth, requireManagerOrAbove, async (req, res, next) => {
    try {
      const schema = z.object({
        productId: z.number().int().positive().optional().nullable(),
        ingredientId: z.number().int().positive().optional().nullable(),
        itemName: z.string().min(1),
        quantity: z.string().min(1),
        unit: z.string().optional(),
        reason: z.enum(["expired", "damaged", "theft", "sample", "cooking_loss", "other"]),
        costImpact: z.string().default("0"),
        note: z.string().optional(),
      });
      const data = schema.parse(req.body);
      const uid = getUserId(req);
      const branchId = await resolveBranchId(req);
      const entry = await storage.createWasteLog(uid, { ...data, branchId });
      res.status(201).json(entry);
    } catch (err) { next(err); }
  });

  // ── Stock Transfers ────────────────────────────────────────────────────────

  app.get("/api/stock-transfers", requireAuth, async (req, res, next) => {
    try {
      const uid = getUserId(req);
      const branch = getActiveBranchId(req);
      const transfers = await storage.getStockTransfers(uid, branch);
      res.json(transfers);
    } catch (err) { next(err); }
  });

  app.post("/api/stock-transfers", requireAuth, requireManagerOrAbove, async (req, res, next) => {
    try {
      const schema = z.object({
        fromBranchId: z.number().int().positive().optional().nullable(),
        toBranchId: z.number().int().positive().optional().nullable(),
        notes: z.string().optional(),
        items: z.array(z.object({
          productId: z.number().int().positive(),
          productName: z.string().min(1),
          quantity: z.number().int().positive(),
          note: z.string().optional(),
        })).min(1),
      });
      const data = schema.parse(req.body);
      const uid = getUserId(req);
      const transfer = await storage.createStockTransfer(uid, data);
      res.status(201).json(transfer);
    } catch (err) { next(err); }
  });

  app.patch("/api/stock-transfers/:id/status", requireAuth, requireManagerOrAbove, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { status } = z.object({
        status: z.enum(["in_transit", "received", "rejected"]),
      }).parse(req.body);
      const uid = getUserId(req);
      await storage.updateStockTransferStatus(id, uid, status);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ── Reorder Suggestions ────────────────────────────────────────────────────

  app.get("/api/inventory/reorder-suggestions", requireAuth, async (req, res, next) => {
    try {
      const uid = getUserId(req);
      const branch = getActiveBranchId(req);
      const suggestions = await storage.getReorderSuggestions(uid, branch);
      res.json(suggestions);
    } catch (err) { next(err); }
  });

  app.post("/api/inventory/generate-reorder-po", requireAuth, requireManagerOrAbove, async (req, res, next) => {
    try {
      const { items, supplierId, notes } = z.object({
        supplierId: z.number().int().positive().optional().nullable(),
        notes: z.string().optional(),
        items: z.array(z.object({
          productId: z.number().int().positive(),
          productName: z.string(),
          quantity: z.number().int().positive(),
          unitCost: z.string().default("0"),
        })).min(1),
      }).parse(req.body);
      const uid = getUserId(req);
      const totalAmount = items.reduce((s, i) => s + Number(i.unitCost) * i.quantity, 0);
      const po = await storage.createPurchaseOrder(uid, {
        supplierId: supplierId ?? null,
        status: "pending",
        paymentStatus: "unpaid",
        totalAmount: String(totalAmount.toFixed(2)),
        notes: notes ?? "Auto-generated from Reorder Suggestions",
        expectedDeliveryAt: null,
        items: items.map(i => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitCost: i.unitCost,
          totalCost: String((Number(i.unitCost) * i.quantity).toFixed(2)),
        })),
      } as Parameters<typeof storage.createPurchaseOrder>[1]);
      res.status(201).json(po);
    } catch (err) { next(err); }
  });
}
