import type { Express } from "express";
import { requireAuth } from "../middleware";
import { storage } from "../storage";
import { getDashboardAggregates } from "../infrastructure/persistence/sales";
import { cache, dashboardCacheKey } from "../cache";
import { getUserId, getActiveBranchId } from "../lib/route-utils";

export function registerDashboardRoutes(app: Express): void {
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    const uid = getUserId(req);
    const bid = getActiveBranchId(req);

    const cacheKey = dashboardCacheKey(uid, bid);
    const cached   = await cache.getAsync<object>(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "no-store");
      return res.json(cached);
    }

    const todayISO = new Date().toISOString().slice(0, 10);
    const rawStartOfDay = typeof req.query.startOfDay === "string" ? req.query.startOfDay : "";
    const todayStart =
      rawStartOfDay && /^\d{4}-\d{2}-\d{2}T[\d:.Z+\-]+$/.test(rawStartOfDay)
        ? rawStartOfDay
        : todayISO;

    const [todaySales, allTime] = await Promise.all([
      storage.getSales(uid, {
        branchId:  bid ?? undefined,
        startDate: todayStart,
        limit:     1000,
      }),
      getDashboardAggregates(uid, bid),
    ]);

    const payload = { todaySales, allTime };
    await cache.setAsync(cacheKey, payload, 30_000);
    res.setHeader("Cache-Control", "no-store");
    res.json(payload);
  });

  app.get("/api/backup/export", requireAuth, async (req, res) => {
    const uid = getUserId(req);
    const bid = getActiveBranchId(req);
    const BATCH = 2000;

    const filename = `artixpos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Transfer-Encoding", "chunked");

    try {
      const settings     = await storage.getSettings(uid);
      const productsList = await storage.getProducts(uid);

      res.write("{\n");
      res.write(`"exportedAt":${JSON.stringify(new Date().toISOString())},\n`);
      res.write(`"version":"1.0",\n`);
      res.write(`"storeName":${JSON.stringify((settings as any)?.storeName ?? "Store")},\n`);
      res.write(`"settings":${JSON.stringify(settings)},\n`);
      res.write(`"products":${JSON.stringify(productsList)},\n`);

      res.write('"sales":[');
      let salesOffset = 0, firstSale = true;
      while (true) {
        const batch = await storage.getSales(uid, { branchId: bid ?? undefined, limit: BATCH, offset: salesOffset });
        if (batch.length === 0) break;
        for (const s of batch) { res.write((firstSale ? "" : ",") + JSON.stringify(s)); firstSale = false; }
        salesOffset += batch.length;
        if (batch.length < BATCH) break;
      }
      res.write("],\n");

      res.write('"customers":[');
      let custOffset = 0, firstCust = true;
      while (true) {
        const batch = await storage.getCustomers(uid, { limit: BATCH, offset: custOffset }).catch(() => [] as any[]);
        if (batch.length === 0) break;
        for (const c of batch) { res.write((firstCust ? "" : ",") + JSON.stringify(c)); firstCust = false; }
        custOffset += batch.length;
        if (batch.length < BATCH) break;
      }
      res.write("],\n");

      res.write('"expenses":[');
      let expOffset = 0, firstExp = true;
      while (true) {
        const batch = await storage.getExpenses(uid, { branchId: bid ?? undefined, limit: BATCH, offset: expOffset }).catch(() => [] as any[]);
        if (batch.length === 0) break;
        for (const e of batch) { res.write((firstExp ? "" : ",") + JSON.stringify(e)); firstExp = false; }
        expOffset += batch.length;
        if (batch.length < BATCH) break;
      }
      res.write("]\n}");
      res.end();
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ message: "Backup export failed" });
      } else {
        res.end();
      }
    }
  });
}
