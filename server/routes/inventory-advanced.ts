import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requirePro, requireManagerOrAbove } from "../middleware";
import { getUserId, getActiveBranchId } from "../lib/route-utils";
import { getInventorySummary, getIngredientReorderSuggestions } from "../infrastructure/persistence/inventory";

export function registerInventoryAdvancedRoutes(app: Express): void {

  app.get("/api/inventory", requireAuth, async (req, res) => {
    try {
      const uid = getUserId(req);
      const summary = await getInventorySummary(uid);
      res.json(summary);
    } catch (err) {
      console.error("[/api/inventory] error:", err);
      res.status(500).json({ message: "Failed to load inventory summary" });
    }
  });

app.get("/api/inventory/reorder-suggestions", requireAuth, requirePro, async (req, res) => {
    try {
      const uid = getUserId(req);
      const branchId = getActiveBranchId(req);
      const suggestions = await storage.getReorderSuggestions(uid, branchId);
      res.json(suggestions);
    } catch (err) {
      console.error("[/api/inventory/reorder-suggestions] error:", err);
      res.status(500).json({ message: "Failed to load reorder suggestions" });
    }
  });

app.get("/api/inventory/ingredient-reorder-suggestions", requireAuth, requirePro, async (req, res) => {
    try {
      const uid = getUserId(req);

      const rawSuggestions = await getIngredientReorderSuggestions(uid);
      const suggestions = rawSuggestions.map(s => {
        const ing      = s.ingredient;
        const consumed30 = s.avgDailyConsumption * 30;
        return {
          ingredientId:          ing.id,
          ingredientName:        ing.name,
          productId:             ing.id,
          productName:           ing.name,
          unit:                  ing.unit,
          currentStock:          parseFloat(ing.stockQty || "0"),
          lowStockThreshold:     parseFloat(ing.lowStockThreshold || "0"),
          consumedLast30Days:    Math.round(consumed30 * 100) / 100,
          avgDailyConsumption:   Math.round(s.avgDailyConsumption * 100) / 100,
          soldLast30Days:        Math.round(consumed30 * 100) / 100,
          avgDailySales:         Math.round(s.avgDailyConsumption * 100) / 100,
          daysOfStockLeft:       s.daysLeft,
          suggestedOrderQty:     s.suggestedQty,
          preferredSupplierId:   s.supplierId,
          preferredSupplierName: s.supplierName,
          unitCost:              s.unitCost ?? (ing as any).costPerUnit ?? null,
        };
      }).sort((a, b) => a.daysOfStockLeft - b.daysOfStockLeft);

      res.json(suggestions);
    } catch (error) {
      console.error("Error fetching ingredient reorder suggestions:", error);
      res.status(500).json({ message: "Failed to fetch ingredient reorder suggestions" });
    }
  });

app.post("/api/inventory/generate-ingredient-po", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    try {
      const uid = getUserId(req);
      const { supplierId, items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }

      const totalAmount = items.reduce((sum: number, item: any) => {
        return sum + (parseFloat(item.unitCost || "0") * item.quantity);
      }, 0).toFixed(2);

      const po = await storage.createPurchaseOrder(uid, {
        supplierId: supplierId || null,
        status: "pending",
        totalAmount,
        paymentStatus: "unpaid",
        notes: `Auto-generated ingredient reorder for ${items.length} ingredient(s)`,
        items: items.map((item: any) => ({
          productId: null,
          productName: item.ingredientName || item.productName || "Unknown",
          quantity: item.quantity,
          unitCost: item.unitCost || "0",
          totalCost: (parseFloat(item.unitCost || "0") * item.quantity).toFixed(2),
        })),
      });

      res.status(201).json(po);
    } catch (error) {
      console.error("Error generating ingredient PO:", error);
      res.status(500).json({ message: "Failed to generate purchase order" });
    }
  });

app.post("/api/inventory/generate-reorder-po", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    try {
      const uid = getUserId(req);
      const { supplierId, items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }

      const totalAmount = items.reduce((sum: number, item: any) => {
        return sum + (parseFloat(item.unitCost || "0") * item.quantity);
      }, 0).toFixed(2);

      const po = await storage.createPurchaseOrder(uid, {
        supplierId: supplierId || null,
        status: "pending",
        totalAmount,
        paymentStatus: "unpaid",
        notes: `Auto-generated reorder for ${items.length} product(s)`,
        items: items.map((item: any) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitCost: item.unitCost || "0",
          totalCost: (parseFloat(item.unitCost || "0") * item.quantity).toFixed(2),
        })),
      });

      res.status(201).json(po);
    } catch (error) {
      console.error("Error generating PO:", error);
      res.status(500).json({ message: "Failed to generate purchase order" });
    }
  });

app.get("/api/waste-log", requireAuth, requirePro, async (req, res) => {
    try {
      const uid = getUserId(req);
      const branchId = getActiveBranchId(req);
      const logs = await storage.getWasteLogs(uid, branchId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching waste log:", error);
      res.status(500).json({ message: "Failed to load waste log" });
    }
  });

  app.post("/api/waste-log", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    try {
      const uid = getUserId(req);
      const branchId = getActiveBranchId(req);
      const { itemName, quantity, reason } = req.body;
      if (!itemName || typeof itemName !== "string" || !itemName.trim()) {
        return res.status(400).json({ message: "itemName is required" });
      }
      if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
        return res.status(400).json({ message: "quantity must be a positive number" });
      }
      if (!reason || typeof reason !== "string") {
        return res.status(400).json({ message: "reason is required" });
      }
      const entry = await storage.createWasteLog(uid, { ...req.body, branchId });
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating waste log:", error);
      res.status(500).json({ message: "Failed to log waste" });
    }
  });

app.get("/api/stock-transfers", requireAuth, requirePro, async (req, res) => {
    try {
      const uid = getUserId(req);
      const branchId = getActiveBranchId(req);
      const transfers = await storage.getStockTransfers(uid, branchId);
      res.json(transfers);
    } catch (error) {
      console.error("Error fetching stock transfers:", error);
      res.status(500).json({ message: "Failed to load stock transfers" });
    }
  });

  app.post("/api/stock-transfers", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    try {
      const uid = getUserId(req);
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "At least one item is required" });
      }
      const transfer = await storage.createStockTransfer(uid, req.body);
      res.status(201).json(transfer);
    } catch (error) {
      console.error("Error creating stock transfer:", error);
      res.status(500).json({ message: "Failed to create transfer" });
    }
  });

  app.patch("/api/stock-transfers/:id/status", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    try {
      const uid = getUserId(req);
      const { status } = req.body;
      if (!["in_transit", "received", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      await storage.updateStockTransferStatus(Number(req.params.id), uid, status);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error updating transfer status:", error);
      res.status(500).json({ message: "Failed to update transfer" });
    }
  });
}