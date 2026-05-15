import type { Express } from "express";
import { requireAuth } from "../middleware";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { users, sales as salesTable } from "@shared/schema";
import { cache, dashboardCacheKey } from "../cache";
import { getUserId, getActiveBranchId } from "../lib/route-utils";

export function registerDashboardRoutes(app: Express): void {

  // ── Dashboard stats ────────────────────────────────────────────────────────
  // Returns today's full sale objects + server-computed all-time aggregates.
  // Using SQL SUM/COUNT means no row-count cap regardless of sales volume.
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    const uid = getUserId(req);
    const bid = getActiveBranchId(req);

    // Cache for 30 s — stats are approximate by nature; a short TTL is fine.
    const cacheKey = dashboardCacheKey(uid, bid);
    const cached = cache.get<object>(cacheKey);
    if (cached) {
      res.setHeader("Cache-Control", "private, max-age=30");
      return res.json(cached);
    }

    const todayISO = new Date().toISOString().slice(0, 10);

    // Run today's sales fetch + tenant resolution + aggregate in parallel.
    const [todaySales, userRow] = await Promise.all([
      storage.getSales(uid, {
        branchId: bid ?? undefined,
        startDate: todayISO,
        limit: 1000,
      }),
      db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, uid)),
    ]);

    // Resolve tenant user IDs so branch owners see combined data
    const tid = userRow[0]?.tenantId;
    let tenantUserIds: string[] = [uid];
    if (tid) {
      const rows = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, tid));
      if (rows.length > 0) tenantUserIds = rows.map(r => r.id);
    }

    const userWhere = tenantUserIds.length === 1
      ? eq(salesTable.userId, tenantUserIds[0])
      : inArray(salesTable.userId, tenantUserIds);
    const branchWhere = bid != null ? eq((salesTable as any).branchId, bid) : undefined;
    const where = branchWhere ? and(userWhere, branchWhere) : userWhere;

    const [agg] = await db
      .select({
        orderCount: sql<number>`COUNT(*)::integer`,
        gross:       sql<number>`COALESCE(SUM(CAST(${salesTable.total} AS NUMERIC)), 0)::float8`,
        net:         sql<number>`COALESCE(SUM(CASE WHEN ${(salesTable as any).deletedAt} IS NULL THEN CAST(${salesTable.total} AS NUMERIC) ELSE 0 END), 0)::float8`,
        refundTotal: sql<number>`COALESCE(SUM(CASE WHEN ${(salesTable as any).deletedAt} IS NOT NULL THEN CAST(${salesTable.total} AS NUMERIC) ELSE 0 END), 0)::float8`,
      })
      .from(salesTable)
      .where(where);

    const payload = {
      todaySales,
      allTime: {
        orderCount: Number(agg?.orderCount ?? 0),
        gross:       Number(agg?.gross ?? 0),
        net:         Number(agg?.net ?? 0),
        refundTotal: Number(agg?.refundTotal ?? 0),
      },
    };

    cache.set(cacheKey, payload, 30_000);
    res.setHeader("Cache-Control", "private, max-age=30");
    res.json(payload);
  });

  // ── Data backup export ─────────────────────────────────────────────────────
  app.get("/api/backup/export", requireAuth, async (req, res) => {
    const uid = getUserId(req);
    const bid = getActiveBranchId(req);
    const opts = { branchId: bid ?? undefined, limit: 10000 };

    const [settings, productsList, salesList, customersList, expensesList] = await Promise.all([
      storage.getSettings(uid),
      storage.getProducts(uid),
      storage.getSales(uid, opts),
      storage.getCustomers(uid, { limit: 10000 }).catch(() => [] as any[]),
      storage.getExpenses(uid, { branchId: bid ?? undefined, limit: 10000 }).catch(() => [] as any[]),
    ]);

    const backup = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      storeName: (settings as any)?.storeName ?? "Store",
      settings,
      products: productsList,
      sales: salesList,
      customers: customersList,
      expenses: expensesList,
    };

    const filename = `artixpos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.json(backup);
  });
}
