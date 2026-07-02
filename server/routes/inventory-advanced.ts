import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requirePro, requireManagerOrAbove } from "../middleware";
import { getUserId, getActiveBranchId } from "../lib/route-utils";
import { db } from "../db";
import { sales, ingredients, productRecipes, suppliers, supplierProducts, products, stockTransfers } from "@shared/schema";
import { and, isNull, inArray, sql } from "drizzle-orm";
import { getTenantUserIds } from "../infrastructure/persistence/base";

export function registerInventoryAdvancedRoutes(app: Express): void {

  app.get("/api/inventory", requireAuth, async (req, res) => {
    try {
      const uid = getUserId(req);
      const userIds = await getTenantUserIds(uid);

      const [ingredientRows, productRows, transferRows] = await Promise.all([
        db.select({ id: ingredients.id, stockQty: ingredients.stockQty, lowStockThreshold: ingredients.lowStockThreshold })
          .from(ingredients)
          .where(and(inArray(ingredients.userId, userIds), isNull(ingredients.deletedAt))),
        db.select({ id: products.id, stock: products.stock, lowStockThreshold: products.lowStockThreshold, trackStock: products.trackStock })
          .from(products)
          .where(and(inArray(products.userId, userIds), isNull(products.deletedAt))),
        db.select({ id: stockTransfers.id, status: stockTransfers.status })
          .from(stockTransfers)
          .where(inArray(stockTransfers.userId, userIds)),
      ]);

      const trackedProducts = productRows.filter(p => p.trackStock);
      const lowStockIngredients = ingredientRows.filter(i => {
        const qty = Number(i.stockQty ?? "0");
        const thresh = Number(i.lowStockThreshold ?? "0");
        return thresh > 0 && qty <= thresh;
      });
      const lowStockProducts = trackedProducts.filter(p => (p.stock ?? 0) <= (p.lowStockThreshold ?? 10));
      const outOfStockIngredients = ingredientRows.filter(i => Number(i.stockQty ?? "0") === 0);
      const outOfStockProducts = trackedProducts.filter(p => (p.stock ?? 0) === 0);
      const pendingTransfers = transferRows.filter(t => t.status === "pending" || t.status === "in_transit");

      res.json({
        ingredientCount: ingredientRows.length,
        productCount: trackedProducts.length,
        lowStockIngredients: lowStockIngredients.length,
        lowStockProducts: lowStockProducts.length,
        outOfStockIngredients: outOfStockIngredients.length,
        outOfStockProducts: outOfStockProducts.length,
        pendingTransfers: pendingTransfers.length,
      });
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
      const _branchId = getActiveBranchId(req);

      const userIds = await getTenantUserIds(uid);

const lowStockIngredients = await db.select()
        .from(ingredients)
        .where(and(
          inArray(ingredients.userId, userIds),
          sql`CAST(stock_qty AS NUMERIC) <= CAST(low_stock_threshold AS NUMERIC)`,
          isNull(ingredients.deletedAt)
        ));

      if (lowStockIngredients.length === 0) {
        return res.json([]);
      }

const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const recentSales = await db.select({ id: sales.id, items: sales.items, createdAt: sales.createdAt })
        .from(sales)
        .where(and(
          inArray(sales.userId, userIds),
          sql`${sales.createdAt} >= ${thirtyDaysAgo}`,
          isNull(sales.deletedAt)
        ));

const productSoldMap = new Map<number, number>();
      for (const sale of recentSales) {
        const items = (sale.items ?? []) as { productId?: number; id?: number; quantity?: number }[];
        for (const item of items) {
          const pid = Number(item.productId ?? item.id);
          if (!Number.isFinite(pid)) continue;
          productSoldMap.set(pid, (productSoldMap.get(pid) ?? 0) + Number(item.quantity ?? 1));
        }
      }

const allRecipes = await db.select()
        .from(productRecipes)
        .where(inArray(productRecipes.ingredientId, lowStockIngredients.map(i => i.id)));

const ingredientConsumedMap = new Map<number, number>();
      for (const recipe of allRecipes) {
        const productsSold = productSoldMap.get(recipe.productId) ?? 0;
        const qtyPerUnit = parseFloat(recipe.quantity || "0");
        const consumed = productsSold * qtyPerUnit;
        ingredientConsumedMap.set(
          recipe.ingredientId,
          (ingredientConsumedMap.get(recipe.ingredientId) ?? 0) + consumed
        );
      }

const ingredientIds = lowStockIngredients.map(i => i.id);
      const supplierProds = ingredientIds.length > 0
        ? await db.select({
            ingredientId: sql`${supplierProducts.productId}`.as('ingredientId'),
            supplierId: supplierProducts.supplierId,
            unitCost: supplierProducts.unitCost
          })
          .from(supplierProducts)
          .where(inArray(supplierProducts.productId, ingredientIds))
        : [];

      const supplierMap = new Map<number, { supplierId: number; unitCost: string }>();
      for (const sp of supplierProds) {
        const ingId = Number((sp as any).ingredientId);
        if (!supplierMap.has(ingId)) {
          supplierMap.set(ingId, { supplierId: sp.supplierId, unitCost: sp.unitCost });
        }
      }

      const supplierIdSet = new Set<number>();
      for (const sv of supplierMap.values()) supplierIdSet.add(sv.supplierId);
      const supplierIds = [...supplierIdSet];
      const supplierNames = supplierIds.length > 0
        ? await db.select({ id: suppliers.id, name: suppliers.name })
            .from(suppliers)
            .where(and(inArray(suppliers.id, supplierIds as number[]), inArray(suppliers.userId, userIds)))
        : [];
      const supplierNameMap = new Map(supplierNames.map(s => [s.id, s.name]));

const suggestions = lowStockIngredients.map(ing => {
        const consumed30 = ingredientConsumedMap.get(ing.id) ?? 0;
        const avgDaily = consumed30 / 30;
        const current = parseFloat(ing.stockQty || "0");
        const threshold = parseFloat(ing.lowStockThreshold || "0");
        const daysLeft = avgDaily > 0 ? Math.floor(current / avgDaily) : 999;

const reorderDays = 14;
        const suggested = Math.max(threshold, Math.ceil(avgDaily * reorderDays * 1.2));

        const sp = supplierMap.get(ing.id);

        return {
          ingredientId: ing.id,
          ingredientName: ing.name,
          productId: ing.id,
          productName: ing.name,
          unit: ing.unit,
          currentStock: current,
          lowStockThreshold: threshold,
          consumedLast30Days: Math.round(consumed30 * 100) / 100,
          avgDailyConsumption: Math.round(avgDaily * 100) / 100,
          soldLast30Days: Math.round(consumed30 * 100) / 100,
          avgDailySales: Math.round(avgDaily * 100) / 100,
          daysOfStockLeft: daysLeft,
          suggestedOrderQty: suggested,
          preferredSupplierId: sp?.supplierId ?? null,
          preferredSupplierName: sp ? (supplierNameMap.get(sp.supplierId) ?? null) : null,
          unitCost: sp?.unitCost ?? ing.costPerUnit ?? null,
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