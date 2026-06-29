import type { Express } from "express";
import { requireAuth } from "../middleware";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import { users, sales as salesTable } from "@shared/schema";
import { cache, dashboardCacheKey } from "../cache";
import { getUserId, getActiveBranchId } from "../lib/route-utils";

export function registerDashboardRoutes(app: Express): void {
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    const uid = getUserId(req);
    const bid = getActiveBranchId(req);

    const cacheKey = dashboardCacheKey(uid, bid);
    const cached = await cache.getAsync<object>(cacheKey);
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

    const [userRow] = await db
      .select({ tenantId: users.tenantId })
      .from(users)
      .where(eq(users.id, uid));
    const tid = userRow?.tenantId ?? null;

    const aggUserWhere = tid ? eq((salesTable as any).tenantId, tid) : eq(salesTable.userId, uid);
    const branchWhere = bid != null ? eq((salesTable as any).branchId, bid) : undefined;
    const aggWhere = branchWhere ? and(aggUserWhere, branchWhere) : aggUserWhere;

    const todayUserWhere = eq(salesTable.userId, uid);
    const _todayWhere = branchWhere ? and(todayUserWhere, branchWhere) : todayUserWhere;
    void _todayWhere;

    const [todaySales, [agg]] = await Promise.all([
      storage.getSales(uid, {
        branchId: bid ?? undefined,
        startDate: todayStart,
        limit: 1000,
      }),
      db
        .select({
          orderCount: sql<number>`COUNT(*)::integer`,
          gross: sql<number>`COALESCE(SUM(CAST(${salesTable.total} AS NUMERIC)), 0)::float8`,
          net: sql<number>`COALESCE(SUM(CASE WHEN ${(salesTable as any).deletedAt} IS NULL THEN CAST(${salesTable.total} AS NUMERIC) ELSE 0 END), 0)::float8`,
          refundTotal: sql<number>`COALESCE(SUM(CASE WHEN ${(salesTable as any).deletedAt} IS NOT NULL THEN CAST(${salesTable.total} AS NUMERIC) ELSE 0 END), 0)::float8`,
        })
        .from(salesTable)
        .where(aggWhere),
    ]);

    const payload = {
      todaySales,
      allTime: {
        orderCount: Number(agg?.orderCount ?? 0),
        gross: Number(agg?.gross ?? 0),
        net: Number(agg?.net ?? 0),
        refundTotal: Number(agg?.refundTotal ?? 0),
      },
    };

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
      const settings = await storage.getSettings(uid);
      const productsList = await storage.getProducts(uid);

      res.write("{\n");
      res.write(`"exportedAt":${JSON.stringify(new Date().toISOString())},\n`);
      res.write(`"version":"1.0",\n`);
      res.write(`"storeName":${JSON.stringify((settings as any)?.storeName ?? "Store")},\n`);
      res.write(`"settings":${JSON.stringify(settings)},\n`);
      res.write(`"products":${JSON.stringify(productsList)},\n`);

      res.write('"sales":[');
      let salesOffset = 0,
        firstSale = true;
      while (true) {
        const batch = await storage.getSales(uid, {
          branchId: bid ?? undefined,
          limit: BATCH,
          offset: salesOffset,
        });
        if (batch.length === 0) break;
        for (const s of batch) {
          res.write((firstSale ? "" : ",") + JSON.stringify(s));
          firstSale = false;
        }
        salesOffset += batch.length;
        if (batch.length < BATCH) break;
      }
      res.write("],\n");

      res.write('"customers":[');
      let custOffset = 0,
        firstCust = true;
      while (true) {
        const batch = await storage
          .getCustomers(uid, { limit: BATCH, offset: custOffset })
          .catch(() => [] as any[]);
        if (batch.length === 0) break;
        for (const c of batch) {
          res.write((firstCust ? "" : ",") + JSON.stringify(c));
          firstCust = false;
        }
        custOffset += batch.length;
        if (batch.length < BATCH) break;
      }
      res.write("],\n");

      res.write('"expenses":[');
      let expOffset = 0,
        firstExp = true;
      while (true) {
        const batch = await storage
          .getExpenses(uid, { branchId: bid ?? undefined, limit: BATCH, offset: expOffset })
          .catch(() => [] as any[]);
        if (batch.length === 0) break;
        for (const e of batch) {
          res.write((firstExp ? "" : ",") + JSON.stringify(e));
          firstExp = false;
        }
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
