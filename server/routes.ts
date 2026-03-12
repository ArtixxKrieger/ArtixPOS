import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { aiService } from "./ai-service";

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

  // AI Chat with context
  app.post(api.ai.chat.path, async (req, res) => {
    try {
      const input = api.ai.chat.input.parse(req.body);
      
      // Fetch sales context for the AI
      const salesList = await storage.getSales();
      const products = await storage.getProducts();
      const settings = await storage.getSettings();
      
      const totalRevenue = salesList.reduce((acc, s) => {
        const total = typeof s.total === 'string' ? parseFloat(s.total) : s.total;
        return acc + (isNaN(total) ? 0 : total);
      }, 0);
      
      const productCounts: Record<string, number> = {};
      salesList.forEach((sale: any) => {
        sale.items?.forEach((item: any) => {
          const name = item.product?.name || "Unknown";
          productCounts[name] = (productCounts[name] || 0) + (item.quantity || 1);
        });
      });
      
      const topProducts = Object.entries(productCounts)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);
      
      const context = {
        totalRevenue,
        totalOrders: salesList.length,
        recentSales: salesList.slice(-10),
        topProducts,
        currency: settings?.currency || "₱",
      };
      
      const response = await aiService.chat(input.message, context);
      res.json({ response });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("AI Service error:", err);
      res.status(500).json({
        message: "AI service error. Please try again.",
      });
    }
  });

  // Generate sales report
  app.get(api.ai.report.path, async (req, res) => {
    try {
      const salesList = await storage.getSales();
      const settings = await storage.getSettings();
      
      const totalRevenue = salesList.reduce((acc, s) => {
        const total = typeof s.total === 'string' ? parseFloat(s.total) : s.total;
        return acc + (isNaN(total) ? 0 : total);
      }, 0);
      
      const totalTax = salesList.reduce((acc, s) => {
        const tax = typeof s.tax === 'string' ? parseFloat(s.tax) : s.tax;
        return acc + (isNaN(tax) ? 0 : tax);
      }, 0);
      
      const csv = `Café Bara - Sales Report\nGenerated: ${new Date().toISOString()}\n\n`;
      const lines = [
        csv,
        "SUMMARY",
        `Total Revenue,${totalRevenue.toFixed(2)}`,
        `Total Orders,${salesList.length}`,
        `Average Order Value,${(totalRevenue / salesList.length).toFixed(2)}`,
        `Total Tax Collected,${totalTax.toFixed(2)}`,
        `Currency,${settings?.currency || "₱"}`,
        "",
        "RECENT SALES",
        "ID,Date,Amount,Payment Method,Items",
      ];
      
      salesList.slice(-20).reverse().forEach(sale => {
        const itemCount = sale.items?.length || 0;
        lines.push(`${sale.id},${new Date(sale.createdAt).toLocaleString()},${sale.total},${sale.paymentMethod},${itemCount} items`);
      });
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="café-bara-sales-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(lines.join("\n"));
    } catch (err) {
      console.error("Report error:", err);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  app.post(api.ai.clearHistory.path, async (req, res) => {
    try {
      aiService.clearHistory();
      res.json({ success: true });
    } catch (err) {
      console.error("Clear history error:", err);
      res.status(500).json({
        message: "Error clearing history",
      });
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

  // Removed pre-made product seeding
  const productsList = await storage.getProducts();
  if (productsList.length === 0) {
    console.log("No pre-made products will be added. Start with empty catalog.");
  }
}