/**
 * Server-Sent Events (SSE) Routes
 *
 * Three SSE channels:
 *   - /api/sse/alerts    — low-stock + new-order polling (per-user)
 *   - /api/sse/kitchen   — kitchen display real-time updates (per-tenant)
 *   - /api/sse/dashboard — dashboard stats-update ping (per-tenant)
 *
 * EventSource cannot set custom headers, so auth falls back to ?token= query
 * param when no session cookie is present (e.g. native / Capacitor apps).
 */
import type { Express, Request, Response } from "express";
import { verifyToken } from "../auth";
import { subscribe as subscribeTenantEvent } from "../events";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ── SSE header helper ──────────────────────────────────────────────────────
function setupSseHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx/Replit proxy buffering
  res.flushHeaders();
}

// ── Auth helper for SSE endpoints ─────────────────────────────────────────
// Returns the user object if authenticated, null otherwise.
function resolveSseUser(req: Request): Express.User | null {
  const user = req.user;
  if (user) return user;
  const qToken = (req.query as any).token as string | undefined;
  if (!qToken) return null;
  try { return verifyToken(qToken) as any; } catch { return null; }
}

function sseWrite(res: Response, event: string, data: Record<string, unknown> = {}): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function registerSseRoutes(app: Express): void {

  // ── /api/sse/alerts — low-stock + new-order (15 s poll loop) ─────────────
  app.get("/api/sse/alerts", async (req: Request, res: Response) => {
    const user = resolveSseUser(req);
    if (!user) { res.status(401).end(); return; }

    const uid: string = user.id;
    setupSseHeaders(res);
    sseWrite(res, "connected", { ts: new Date().toISOString() });

    // State snapshots — push events only when something changes
    let knownLowStockIds = new Set<number>();
    let knownPendingCount = -1;

    async function poll() {
      try {
        // Low-stock products
        const stockRows = await db.execute(sql`
          SELECT id FROM products
          WHERE user_id = ${uid}
            AND track_stock = true
            AND deleted_at IS NULL
            AND stock <= low_stock_threshold
        `);
        const currentIds = new Set<number>((stockRows.rows as any[]).map(r => r.id as number));
        let newLow = false;
        for (const id of currentIds) {
          if (!knownLowStockIds.has(id)) { newLow = true; break; }
        }
        if (newLow) sseWrite(res, "low-stock", { count: currentIds.size });
        knownLowStockIds = currentIds;

        // Pending orders
        const orderRow = await db.execute(sql`
          SELECT COUNT(*)::int AS cnt
          FROM   pending_orders
          WHERE  user_id = ${uid}
            AND  deleted_at IS NULL
            AND  status != 'paid'
        `);
        const count = Number((orderRow.rows[0] as any)?.cnt ?? 0);
        if (knownPendingCount !== -1 && count > knownPendingCount) {
          sseWrite(res, "new-order", { count });
        }
        knownPendingCount = count;
      } catch {
        // DB errors must not crash the SSE stream — silently retry next poll
      }
    }

    await poll();
    const pollInterval = setInterval(poll, 15_000);
    const heartbeat   = setInterval(() => res.write(": heartbeat\n\n"), 30_000);
    req.on("close", () => { clearInterval(pollInterval); clearInterval(heartbeat); });
  });

  // ── /api/sse/kitchen — kitchen display real-time channel ─────────────────
  app.get("/api/sse/kitchen", async (req: Request, res: Response) => {
    const user = resolveSseUser(req);
    if (!user) { res.status(401).end(); return; }

    const tid: string | null = user.tenantId ?? null;
    if (!tid) { res.status(403).json({ message: "No tenant" }); return; }

    setupSseHeaders(res);
    sseWrite(res, "connected", { ts: new Date().toISOString() });

    const unsubscribe = subscribeTenantEvent(tid, (event) => {
      if (event.type === "kitchen-update") {
        sseWrite(res, "order-update", {
          orderId: event.orderId,
          kitchenStatus: event.kitchenStatus,
          orderNumber: event.orderNumber,
        });
      } else if (event.type === "kitchen-new-order") {
        sseWrite(res, "new-order", {
          orderId: event.orderId,
          orderNumber: event.orderNumber,
          itemCount: event.itemCount,
        });
      }
    });

    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 30_000);
    req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
  });

  // ── /api/sse/dashboard — stats-update ping after each sale ───────────────
  app.get("/api/sse/dashboard", async (req: Request, res: Response) => {
    const user = resolveSseUser(req);
    if (!user) { res.status(401).end(); return; }

    const tid: string | null = user.tenantId ?? null;
    if (!tid) { res.status(403).json({ message: "No tenant" }); return; }

    setupSseHeaders(res);
    sseWrite(res, "connected", { ts: new Date().toISOString() });

    const unsubscribe = subscribeTenantEvent(tid, (event) => {
      if (event.type === "stats-update") {
        sseWrite(res, "stats-update", { saleId: event.saleId, total: event.total });
      }
    });

    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 30_000);
    req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
  });
}
