import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Products
  app.get(api.products.list.path, async (req, res) => {
    const products = await storage.getProducts();
    res.json(products);
  });

  app.get(api.products.get.path, async (req, res) => {
    const product = await storage.getProduct(Number(req.params.id));
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
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
          field: err.errors[0].path.join('.'),
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
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.products.delete.path, async (req, res) => {
    await storage.deleteProduct(Number(req.params.id));
    res.status(204).end();
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
          field: err.errors[0].path.join('.'),
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
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(order);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
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
    const salesList = await storage.getSales();
    res.json(salesList);
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
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Settings
  app.get(api.settings.get.path, async (req, res) => {
    const settings = await storage.getSettings();
    if (!settings) {
      // Return default settings
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
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Seed db initially
  seedDatabase().catch(console.error);

  return httpServer;
}

async function seedDatabase() {
  const settings = await storage.getSettings();
  if (!settings) {
    await storage.updateSettings({
      storeName: "Quick POS",
      currency: "$",
      taxRate: "8.5",
    });
  }

  const productsList = await storage.getProducts();
  if (productsList.length === 0) {
    await storage.createProduct({
      name: "Coffee",
      price: "3.50",
      category: "Beverages",
      hasSizes: true,
      hasModifiers: true,
    });
    await storage.createProduct({
      name: "Sandwich",
      price: "6.00",
      category: "Food",
      hasSizes: false,
      hasModifiers: true,
    });
    await storage.createProduct({
      name: "Muffin",
      price: "4.50",
      category: "Food",
      hasSizes: false,
      hasModifiers: false,
    });
  }
}