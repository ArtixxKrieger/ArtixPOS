import type { Express } from "express";
import { createHash } from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { requireAuth, getSubscription, isProSubscription } from "../middleware";
import { cache, TTL, productsCacheKey } from "../cache";
import {
  getUserId,
  getTenantId,
  getActiveBranchId,
  resolveBranchId,
  auditLog,
  handleZodError,
} from "../lib/route-utils";
import { pool } from "../db";
import { runAsAdmin } from "../tenant-context";

export function registerProductRoutes(app: Express): void {
  app.get(api.products.list.path, requireAuth, async (req, res) => {
    const branch = getActiveBranchId(req);
    const uid = getUserId(req);
    const { lowStock, category, sort, order, barcode, format } = req.query as Record<
      string,
      string
    >;

    // B-pattern: ?barcode=... looks up by barcode
    if (barcode) {
      const { cache: c, barcodeCacheKey, TTL: ttl } = await import("../cache");
      const cacheKey = barcodeCacheKey(uid, barcode);
      const cached = c.get<object>(cacheKey);
      if (cached) return res.json(cached);
      const product = await storage.getProductByBarcode(barcode, uid);
      if (!product) return res.status(404).json({ message: "Product not found" });
      c.set(cacheKey, product, ttl.BARCODE);
      return res.json(product);
    }

    // B-pattern: filter by lowStock via ?lowStock=true
    if (lowStock === "true") {
      const products = await storage.getLowStockProducts(uid, branch);
      return res.json(products);
    }

    const cacheKey = productsCacheKey(uid) + (branch != null ? `:b${branch}` : "");
    const data = await cache.getOrFetch(
      cacheKey,
      () => storage.getProducts(uid, branch),
      TTL.PRODUCTS,
    );

    let filtered = data;
    if (category) {
      const cat = category.toLowerCase();
      filtered = data.filter((p: any) => (p.category ?? "").toLowerCase() === cat);
    }
    if (sort) {
      const dir = order === "desc" ? -1 : 1;
      filtered = [...filtered].sort((a: any, b: any) => {
        const va = a[sort] ?? "";
        const vb = b[sort] ?? "";
        return va < vb ? -dir : va > vb ? dir : 0;
      });
    }

    // B-pattern: ?format=csv exports products
    if (format === "csv") {
      const HEADERS = [
        "name",
        "category",
        "price",
        "sku",
        "barcode",
        "taxRate",
        "trackStock",
        "stock",
        "lowStockThreshold",
      ];
      const escape = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      const rows = filtered.map((p: any) =>
        [
          p.name,
          p.category,
          p.price,
          p.sku,
          p.barcode,
          p.taxRate,
          p.trackStock,
          p.stock,
          p.lowStockThreshold,
        ]
          .map(escape)
          .join(","),
      );
      const csv = [HEADERS.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.setHeader("Cache-Control", "no-store");
      return res.send(csv);
    }

    const etag = `"p-${createHash("sha1").update(JSON.stringify(filtered)).digest("hex").slice(0, 16)}"`;
    if (req.headers["if-none-match"] === etag) return res.status(304).end();
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "no-store");
    res.json(filtered);
  });

  app.get(api.products.get.path, requireAuth, async (req, res) => {
    const product = await storage.getProduct(Number(req.params.id), getUserId(req));
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  });

  app.get("/api/products/low-stock", requireAuth, async (req, res, next) => {
    try {
      const products = await storage.getLowStockProducts(getUserId(req), getActiveBranchId(req));
      res.json(products);
    } catch (err) {
      next(err);
    }
  });

  app.post(api.products.create.path, requireAuth, async (req, res) => {
    try {
      const uid = getUserId(req);
      const tid = getTenantId(req);
      if (tid) {
        const sub = await getSubscription(tid);
        if (!isProSubscription(sub)) {
          const cacheKey = productsCacheKey(uid);
          const cached = cache.get<any[]>(cacheKey);
          const productCount =
            cached !== undefined ? cached.length : (await storage.getProducts(uid)).length;
          if (productCount >= 50) {
            return res.status(403).json({
              message:
                "The Free plan includes 50 products. Upgrade to Pro when you need a larger catalog.",
              code: "PRODUCT_LIMIT_REACHED",
            });
          }
        }
      }
      const bodySchema = api.products.create.input.extend({
        price: z.coerce.string().min(1, "Price is required"),
      });
      const input = bodySchema.parse(req.body);

      const branchId = await resolveBranchId(req);
      const product = await storage.createProduct(uid, { ...input, branchId });
      cache.del(productsCacheKey(uid));
      if (branchId != null) cache.del(productsCacheKey(uid) + `:b${branchId}`);
      await auditLog(req, "create", "product", String(product.id), {
        name: product.name,
        price: product.price,
      });
      res.status(201).json(product);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.put(api.products.update.path, requireAuth, async (req, res) => {
    try {
      const bodySchema = api.products.update.input.extend({
        price: z.coerce.string().optional(),
      });
      const input = bodySchema.parse(req.body);
      const uid = getUserId(req);
      const existing = await storage.getProduct(Number(req.params.id), uid);
      const product = await storage.updateProduct(Number(req.params.id), uid, input);
      if (!product) return res.status(404).json({ message: "Product not found" });
      cache.del(productsCacheKey(uid));
      const auditMeta: Record<string, unknown> = { name: product.name };
      if (existing && input.price !== undefined && existing.price !== product.price) {
        auditMeta.oldPrice = existing.price;
        auditMeta.newPrice = product.price;
      }
      await auditLog(req, "update", "product", String(product.id), auditMeta);

      if (
        existing &&
        input.price !== undefined &&
        existing.price !== product.price
      ) {
        const oldPrice = parseFloat(existing.price || "0");
        const newPrice = parseFloat(product.price || "0");
        if (oldPrice > 0) {
          const pctChange = ((newPrice - oldPrice) / oldPrice) * 100;
          const PRICE_ALERT_THRESHOLD_PCT = 30;
          if (Math.abs(pctChange) >= PRICE_ALERT_THRESHOLD_PCT) {
            const tid = (req.user as any)?.tenantId as string | null;
            if (tid) {
              runAsAdmin(pool, async () => {
                try {
                  const { sendPushToTenant } = await import("../push");
                  const direction = pctChange > 0 ? "up" : "down";
                  await sendPushToTenant(tid, {
                    title: `⚠️ Unusual price change: ${product.name}`,
                    body: `Price moved ${direction} ${Math.abs(Math.round(pctChange))}% (${oldPrice.toFixed(2)} → ${newPrice.toFixed(2)}).`,
                    tag: `price-${product.id}`,
                    url: "/products",
                  });
                } catch {}
              }).catch((e) =>
                console.error(`[price-alert] runAsAdmin failed for product ${product.id}:`, e),
              );
            }
          }
        }
      }

      res.json(product);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.delete(api.products.delete.path, requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const uid = getUserId(req);
    const existing = await storage.getProduct(id, uid);
    await storage.deleteProduct(id, uid);
    cache.del(productsCacheKey(uid));
    await auditLog(req, "delete", "product", String(id), { name: existing?.name });
    res.status(204).end();
  });

  app.post("/api/products/:id/stock", requireAuth, async (req, res) => {
    try {
      const { delta } = z.object({ delta: z.number() }).parse(req.body);
      const uid = getUserId(req);
      const before = await storage.getProduct(Number(req.params.id), uid);
      const product = await storage.adjustStock(Number(req.params.id), uid, delta);
      if (!product) return res.status(404).json({ message: "Product not found" });
      cache.del(productsCacheKey(uid));
      await auditLog(req, "stock_adjust", "product", String(product.id), {
        name: product.name,
        delta,
        fromStock: before?.stock ?? null,
        toStock: product.stock,
      });
      res.json(product);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.patch("/api/products/:id/stock", requireAuth, async (req, res) => {
    try {
      const { stock } = z.object({ stock: z.number().int().min(0) }).parse(req.body);
      const uid = getUserId(req);
      const before = await storage.getProduct(Number(req.params.id), uid);
      const product = await storage.setStock(Number(req.params.id), uid, stock);
      if (!product) return res.status(404).json({ message: "Product not found" });
      cache.del(productsCacheKey(uid));
      await auditLog(req, "stock_set", "product", String(product.id), {
        name: product.name,
        fromStock: before?.stock ?? null,
        toStock: product.stock,
      });
      res.json(product);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  app.get("/api/products/:id/stock-logs", requireAuth, async (req, res, next) => {
    try {
      const logs = await storage.getStockLogs(Number(req.params.id), getUserId(req));
      res.json(logs);
    } catch (err) {
      next(err);
    }
  });

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

  app.get("/api/products/export", requireAuth, async (req, res, next) => {
    try {
      const prods = await storage.getProducts(getUserId(req));
      const HEADERS = [
        "name",
        "category",
        "price",
        "sku",
        "barcode",
        "taxRate",
        "trackStock",
        "stock",
        "lowStockThreshold",
      ];
      const escape = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      };
      const rows = prods.map((p) =>
        [
          p.name,
          p.category,
          p.price,
          p.sku,
          p.barcode,
          p.taxRate,
          p.trackStock ? "true" : "false",
          p.stock ?? "",
          p.lowStockThreshold ?? "",
        ]
          .map(escape)
          .join(","),
      );
      const csv = [HEADERS.join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="products.csv"');
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.send(csv);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/products/import", requireAuth, async (req, res, next) => {
    try {
      const { rows } = z
        .object({
          rows: z.array(
            z.object({
              name: z.string().min(1),
              category: z.string().optional(),
              price: z.string().optional(),
              sku: z.string().optional(),
              barcode: z.string().optional(),
              taxRate: z.string().optional(),
              trackStock: z.boolean().optional(),
              stock: z.number().int().optional(),
              lowStockThreshold: z.number().int().optional(),
            }),
          ),
        })
        .parse(req.body);

      const uid = getUserId(req);
      const branchId = await resolveBranchId(req);
      const existing = await storage.getProducts(uid);
      const bySku = new Map(existing.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p]));
      const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]));

      let created = 0,
        updated = 0,
        errors = 0;
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
          const match =
            (row.sku ? bySku.get(row.sku.toLowerCase()) : null) ??
            byName.get(row.name.toLowerCase());
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
