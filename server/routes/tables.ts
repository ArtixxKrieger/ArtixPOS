import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireProOrBusinessFeature } from "../middleware";
import { insertTableSchema } from "@shared/schema";
import { cache, tablesCacheKey } from "../cache";
import { getUserId, handleZodError } from "../lib/route-utils";

export function registerTableRoutes(app: Express): void {

  // ── List tables ────────────────────────────────────────────────────────────
  app.get("/api/tables", requireAuth, requireProOrBusinessFeature("/tables"), async (req, res) => {
    const uid = getUserId(req);
    const ck = tablesCacheKey(uid);
    const cached = cache.get<object[]>(ck);
    if (cached) return res.json(cached);
    const list = await storage.getTables(uid);
    cache.set(ck, list, 120_000); // 2 min — table config rarely changes during service
    res.json(list);
  });

  // ── Create table ───────────────────────────────────────────────────────────
  app.post("/api/tables", requireAuth, requireProOrBusinessFeature("/tables"), async (req, res) => {
    try {
      const input = insertTableSchema.parse(req.body);
      const uid = getUserId(req);
      const table = await storage.createTable(uid, input);
      cache.del(tablesCacheKey(uid));
      res.status(201).json(table);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Update table ───────────────────────────────────────────────────────────
  app.put("/api/tables/:id", requireAuth, requireProOrBusinessFeature("/tables"), async (req, res) => {
    try {
      const input = insertTableSchema.partial().parse(req.body);
      const uid = getUserId(req);
      const table = await storage.updateTable(Number(req.params.id), uid, input);
      if (!table) return res.status(404).json({ message: "Table not found" });
      cache.del(tablesCacheKey(uid));
      res.json(table);
    } catch (err) {
      if (!handleZodError(err, res)) throw err;
    }
  });

  // ── Delete table ───────────────────────────────────────────────────────────
  app.delete("/api/tables/:id", requireAuth, requireProOrBusinessFeature("/tables"), async (req, res, next) => {
    try {
      await storage.deleteTable(Number(req.params.id), getUserId(req));
      res.status(204).end();
    } catch (err) { next(err); }
  });
}
