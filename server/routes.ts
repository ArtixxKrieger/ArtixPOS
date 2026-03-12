import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { initializeDatabase } from "./db";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Initialize database schema first
  try {
    await initializeDatabase();
  } catch (err) {
    console.error("Database init failed:", err);
  }
  // Products
  app.get(api.products.list.path, async (req, res) => {
    const products = await storage.getProducts();
    res.json(products);
  });

  app.get(api.products.get.path, async (req, res) => {
    const product = await storage.getProduct(Number(req.params.id));
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  app.post(api.products.create.path, async (req, res) => {
    try {
      const bodySchema = api.products.create.input.extend({
        price: z.coerce.string(),
      });
      const input = bodySchema.parse(req.body);
      const product = await storage.createProduct(input);
      res.status(201).json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.put(api.products.update.path, async (req, res) => {
    try {
      const bodySchema = api.products.update.input.extend({
        price: z.coerce.string().optional(),
      });
      const input = bodySchema.parse(req.body);
      const product = await storage.updateProduct(Number(req.params.id), input);
      if (!product) return res.status(404).json({ message: "Product not found" });
      res.json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.delete(api.products.delete.path, async (req, res) => {
    await storage.deleteProduct(Number(req.params.id));
    res.status(204).end();
  });

  // Ingredients
  app.get("/api/ingredients", async (req, res) => {
    const ings = await storage.getIngredients();
    res.json(ings);
  });

  app.post("/api/ingredients", async (req, res) => {
    const ing = await storage.createIngredient(req.body);
    res.status(201).json(ing);
  });

  app.put("/api/ingredients/:id", async (req, res) => {
    const ing = await storage.updateIngredient(parseInt(req.params.id), req.body);
    res.json(ing);
  });

  app.delete("/api/ingredients/:id", async (req, res) => {
    await storage.deleteIngredient(parseInt(req.params.id));
    res.status(204).send();
  });

  // Recipes
  app.get("/api/recipes", async (req, res) => {
    const recs = await storage.getRecipes();
    res.json(recs);
  });

  app.post("/api/recipes", async (req, res) => {
    const rec = await storage.createRecipe(req.body);
    res.status(201).json(rec);
  });

  app.delete("/api/recipes/:id", async (req, res) => {
    await storage.deleteRecipe(parseInt(req.params.id));
    res.status(204).send();
  });

  // Pending Orders
  app.get(api.pendingOrders.list.path, async (req, res) => {
    const orders = await storage.getPendingOrders();
    res.json(orders);
  });

  app.post(api.pendingOrders.create.path, async (req, res) => {
    try {
      const bodySchema = api.pendingOrders.create.input.extend({
        subtotal: z.coerce.string(),
        total: z.coerce.string(),
        tax: z.coerce.string().optional(),
        discount: z.coerce.string().optional(),
        paymentAmount: z.coerce.string().optional(),
        changeAmount: z.coerce.string().optional(),
      });
      const input = bodySchema.parse(req.body);
      const order = await storage.createPendingOrder(input);
      res.status(201).json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.put(api.pendingOrders.update.path, async (req, res) => {
    try {
      const bodySchema = api.pendingOrders.update.input.extend({
        subtotal: z.coerce.string().optional(),
        total: z.coerce.string().optional(),
        tax: z.coerce.string().optional(),
        discount: z.coerce.string().optional(),
        paymentAmount: z.coerce.string().optional(),
        changeAmount: z.coerce.string().optional(),
      });
      const input = bodySchema.parse(req.body);
      const order = await storage.updatePendingOrder(Number(req.params.id), input);
      if (!order) return res.status(404).json({ message: "Order not found" });
      res.json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.delete(api.pendingOrders.delete.path, async (req, res) => {
    await storage.deletePendingOrder(Number(req.params.id));
    res.status(204).end();
  });

  // Sales
  app.get(api.sales.list.path, async (req, res) => {
    const sales = await storage.getSales();
    res.json(sales);
  });

  app.post(api.sales.create.path, async (req, res) => {
    try {
      const bodySchema = api.sales.create.input.extend({
        subtotal: z.coerce.string(),
        total: z.coerce.string(),
        tax: z.coerce.string().optional(),
        discount: z.coerce.string().optional(),
        paymentAmount: z.coerce.string().optional(),
        changeAmount: z.coerce.string().optional(),
      });
      const input = bodySchema.parse(req.body);
      const sale = await storage.createSale(input);
      res.status(201).json(sale);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  // Settings
  app.get(api.settings.get.path, async (req, res) => {
    const settings = await storage.getSettings();
    if (!settings) {
      return res.json({
        id: 0,
        storeName: "My Store",
        currency: "₱",
        taxRate: "0",
        address: null,
        phone: null,
        emailContact: null,
        receiptFooter: "Thank you for your business!",
      });
    }
    res.json(settings);
  });

  app.put(api.settings.update.path, async (req, res) => {
    try {
      const bodySchema = api.settings.update.input.extend({
        taxRate: z.coerce.string().optional(),
      });
      const input = bodySchema.parse(req.body);
      const settings = await storage.updateSettings(input);
      res.json(settings);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  // Seed db initially (non-blocking)
  seedDatabase().catch(err => console.log("Seed warning:", err.message));

  return httpServer;
}

async function seedDatabase() {
  try {
    const settings = await storage.getSettings();
    if (!settings) {
      await storage.updateSettings({
        storeName: "Café Bara",
        currency: "₱",
        taxRate: "0",
      });
    }
  } catch (err) {
    console.log("Database seed skipped (schema migration may be pending)");
  }
}
