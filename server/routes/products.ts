import type { Express } from "express";
import { createHash } from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { requireAuth, getSubscription, isProSubscription } from "../middleware";
import { cache, TTL, productsCacheKey } from "../cache";
import { getUserId, getTenantId, getActiveBranchId, resolveBranchId, auditLog, handleZodError } from "../lib/route-utils";

export function registerProductRoutes(app: Express): void {

  // ── List products ──────────────────────────────────────────────────────────
  app.get(api.products.list.path, requireAuth, async (req, res) => {
    const branch = getActiveBranchId(req);
    const uid = getUserId(req);
    const cacheKey = productsCacheKey(uid) + (branch != null ? `:b${branch}` : "");
    const cached = cache.get<object[]>(cacheKey);
    if (cached) {
      const etag = `"p-${createHash("sha1").update(JSON.stringify(cached)).digest("hex").slice(0, 16)}"`;
      if (req.headers["if-none-match"] === etag) return res.status(304).end();
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, max-age=120");
      return res.json(cached);
    }
    const products = await storage.getProducts(uid, branch);
    cache.set(cacheKey, products, TTL.PRODUCTS);
    const etag = `"p-${createHash("sha1").update(JSON.stringify(products)).digest("hex").slice(0, 16)}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, max-age=120");
    res.json(products);
  });

  // ── Get single product ─────────────────────────────────────────────────────
  app.get(api.products.get.path, requireAuth, async (req, res) => {
    const product = await storage.getProduct(Number(req.params.id), getUserId(req));
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  // ── Low-stock products ─────────────────────────────────────────────────────
  app.get("/api/products/low-stock", requireAuth, async (req, res, next) => {
    try {
      const products = await storage.getLowStockProducts(getUserId(req), getActiveBranchId(req));
      res.json(products);
    } catch (err) { next(err); }
  });

  // ── Create product ─────────────────────────────────────────────────────────
  app.post(api.products.create.path, requireAuth, async (req, res) => {
    try {
      const tid = getTenantId(req);
      if (tid) {
        const sub = await getSubscription(tid);
        if (!isProSubscription(sub)) {
          const existing = await storage.getProducts(getUserId(req));
          if (existing.length >= 50) {
            return res.status(403).json({
              message: "The Free plan includes 50 products. Upgrade to Pro when you need a larger catalog.",
              code: "PRODUCT_LIMIT_REACHED",
            });
          }
        }
      }
      const bodySchema = api.products.create.input.extend({
        price: z.coerce.string().min(1, "Price is required"),
      });
      const input = bodySchema.parse(req.body);
      // SECURITY: Always force the new product into the user's active branch.
      // Ignore any client-supplied branchId to prevent cross-branch leaks.
      const branchId = await resolveBranchId(req);
      const uid = getUserId(req);
      const product = await storage.createProduct(uid, { ...input, branchId });
      cache.del(productsCacheKey(uid));
      if (branchId != null) cache.del(productsCacheKey(uid) + `:b${branchId}`);
      await auditLog(req, "create", "product", String(product.id), { name: product.name, price: product.price });
      res.status(201).json(product);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Update product ─────────────────────────────────────────────────────────
  app.put(api.products.update.path, requireAuth, async (req, res) => {
    try {
      const bodySchema = api.products.update.input.extend({
        price: z.coerce.string().optional(),
      });
      const input = bodySchema.parse(req.body);
      const uid = getUserId(req);
      const product = await storage.updateProduct(Number(req.params.id), uid, input);
      if (!product) return res.status(404).json({ message: "Product not found" });
      cache.del(productsCacheKey(uid));
      await auditLog(req, "update", "product", String(product.id), { name: product.name });
      res.json(product);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Delete product ─────────────────────────────────────────────────────────
  app.delete(api.products.delete.path, requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const uid = getUserId(req);
    const existing = await storage.getProduct(id, uid);
    await storage.deleteProduct(id, uid);
    cache.del(productsCacheKey(uid));
    await auditLog(req, "delete", "product", String(id), { name: existing?.name });
    res.status(204).end();
  });

  // ── Adjust stock (relative delta) ─────────────────────────────────────────
  app.post("/api/products/:id/stock", requireAuth, async (req, res) => {
    try {
      const { delta } = z.object({ delta: z.number() }).parse(req.body);
      const uid = getUserId(req);
      const product = await storage.adjustStock(Number(req.params.id), uid, delta);
      if (!product) return res.status(404).json({ message: "Product not found" });
      cache.del(productsCacheKey(uid));
      res.json(product);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Set stock (absolute value) ─────────────────────────────────────────────
  app.patch("/api/products/:id/stock", requireAuth, async (req, res) => {
    try {
      const { stock } = z.object({ stock: z.number().int().min(0) }).parse(req.body);
      const uid = getUserId(req);
      const product = await storage.setStock(Number(req.params.id), uid, stock);
      if (!product) return res.status(404).json({ message: "Product not found" });
      cache.del(productsCacheKey(uid));
      res.json(product);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Stock adjustment logs ──────────────────────────────────────────────────
  app.get("/api/products/:id/stock-logs", requireAuth, async (req, res, next) => {
    try {
      const logs = await storage.getStockLogs(Number(req.params.id), getUserId(req));
      res.json(logs);
    } catch (err) { next(err); }
  });

  // ── Barcode lookup ─────────────────────────────────────────────────────────
  app.get("/api/products/barcode/:barcode", requireAuth, async (req, res) => {
    const uid = getUserId(req);
    const { cache: c, barcodeCacheKey, TTL: ttl } = await import("../cache");
    const cacheKey = barcodeCacheKey(uid, req.params.barcode as string);
    const cached = c.get<object>(cacheKey);
    if (cached) return res.json(cached);
    const product = await storage.getProductByBarcode(req.params.barcode as string, uid);
    if (!product) return res.status(404).json({ message: "Product not found" });
    c.set(cacheKey, product, ttl.BARCODE);
    res.json(product);
  });

  // ── CSV Export ─────────────────────────────────────────────────────────────
  app.get("/api/products/export", requireAuth, async (req, res, next) => {
    try {
      const prods = await storage.getProducts(getUserId(req));
      const HEADERS = ["name","category","price","sku","barcode","taxRate","trackStock","stock","lowStockThreshold"];
      const escape = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = prods.map(p => [
        p.name, p.category, p.price, p.sku, p.barcode, p.taxRate,
        p.trackStock ? "true" : "false", p.stock ?? "", p.lowStockThreshold ?? "",
      ].map(escape).join(","));
      const csv = [HEADERS.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="products.csv"');
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.send(csv);
    } catch (err) { next(err); }
  });

  // ── CSV Import (upsert by SKU or name) ────────────────────────────────────
  app.post("/api/products/import", requireAuth, async (req, res, next) => {
    try {
      const { rows } = z.object({
        rows: z.array(z.object({
          name: z.string().min(1),
          category: z.string().optional(),
          price: z.string().optional(),
          sku: z.string().optional(),
          barcode: z.string().optional(),
          taxRate: z.string().optional(),
          trackStock: z.boolean().optional(),
          stock: z.number().int().optional(),
          lowStockThreshold: z.number().int().optional(),
        })),
      }).parse(req.body);

      const uid = getUserId(req);
      const branchId = await resolveBranchId(req);
      const existing = await storage.getProducts(uid);
      const bySku  = new Map(existing.filter(p => p.sku).map(p => [p.sku!.toLowerCase(), p]));
      const byName = new Map(existing.map(p => [p.name.toLowerCase(), p]));

      let created = 0, updated = 0, errors = 0;
      const errorList: string[] = [];

      for (const row of rows) {
        try {
          const rawStock = row.stock ?? 0;
          const rawThreshold = row.lowStockThreshold ?? 5;
          const safeStock = rawStock < 0 ? 0 : rawStock;
          const safeThreshold = rawThreshold < 0 ? 5 : rawThreshold;
          const payload: Record<string, unknown> = {
            name: row.name,
            category: row.category || "General",
            price: row.price || "0",
            sku: row.sku || null,
            barcode: row.barcode || null,
            taxRate: row.taxRate || null,
            trackStock: row.trackStock ?? false,
            stock: row.trackStock ? safeStock : null,
            lowStockThreshold: row.trackStock ? safeThreshold : null,
            sizes: [],
            modifiers: [],
            hasSizes: false,
            hasModifiers: false,
            branchId: branchId ?? null,
          };
          const match = (row.sku ? bySku.get(row.sku.toLowerCase()) : null)
            ?? byName.get(row.name.toLowerCase());
          if (match) {
            await storage.updateProduct(match.id, uid, payload as any);
            updated++;
          } else {
            await storage.createProduct(uid, payload as any);
            created++;
          }
        } catch (e: any) {
          errors++;
          errorList.push(`"${row.name}": ${e.message}`);
        }
      }

      cache.del(productsCacheKey(uid));
      res.json({ created, updated, errors, errorList });
    } catch (err) {
      if (!handleZodError(err, res)) next(err);
    }
  });
}
