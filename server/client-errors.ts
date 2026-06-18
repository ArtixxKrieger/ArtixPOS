import type { Express, Request, Response } from "express";

export interface ClientErrorEntry {
  id: string;
  ts: string;
  type: "uncaught_error" | "unhandled_rejection" | "console_error" | "react_boundary" | "api_error";
  message: string;
  stack?: string;
  url?: string;
  userId?: string;
  sessionId?: string;
  userAgent?: string;
  extra?: Record<string, unknown>;
}

const MAX_ENTRIES = 500;
const ring: ClientErrorEntry[] = [];
let totalReceived = 0;

function push(entry: ClientErrorEntry) {
  if (ring.length >= MAX_ENTRIES) ring.shift();
  ring.push(entry);
  totalReceived++;
}

function sanitize(v: unknown, maxLen = 2000): string {
  if (v == null) return "";
  const s = String(v);
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

const VALID_TYPES = new Set([
  "uncaught_error",
  "unhandled_rejection",
  "console_error",
  "react_boundary",
  "api_error",
]);

export function registerClientErrorRoutes(app: Express) {
  // POST /api/client-errors  — ingest a batch from the browser (no auth required,
  // rate-limited by the global API limiter already applied in index.ts).
  app.post("/api/client-errors", (req: Request, res: Response) => {
    const batch: unknown[] = Array.isArray(req.body) ? req.body : [req.body];
    const ua = req.headers["user-agent"] ?? "";

    let accepted = 0;
    for (const item of batch.slice(0, 20)) {
      if (!item || typeof item !== "object") continue;
      const e = item as Record<string, unknown>;

      const type = VALID_TYPES.has(String(e.type ?? ""))
        ? (e.type as ClientErrorEntry["type"])
        : "uncaught_error";

      const message = sanitize(e.message);
      if (!message) continue;

      push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: new Date().toISOString(),
        type,
        message,
        stack: e.stack ? sanitize(e.stack, 4000) : undefined,
        url: e.url ? sanitize(e.url, 500) : undefined,
        userId: e.userId ? sanitize(e.userId, 200) : undefined,
        sessionId: e.sessionId ? sanitize(e.sessionId, 100) : undefined,
        userAgent: sanitize(ua, 300) || undefined,
        extra: e.extra && typeof e.extra === "object"
          ? (e.extra as Record<string, unknown>)
          : undefined,
      });
      accepted++;
    }

    res.json({ ok: true, accepted });
  });

  // GET /api/client-errors  — retrieve the ring buffer (requires METRICS_TOKEN)
  app.get("/api/client-errors", (req: Request, res: Response) => {
    const metricsToken = process.env.METRICS_TOKEN;
    const authHeader = req.headers.authorization ?? "";
    if (!metricsToken || authHeader !== `Bearer ${metricsToken}`) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const limit = Math.min(Number(req.query.limit ?? 100), MAX_ENTRIES);
    const typeFilter = req.query.type ? String(req.query.type) : null;
    const sinceTs = req.query.since ? String(req.query.since) : null;

    let results = [...ring];
    if (typeFilter) results = results.filter((e) => e.type === typeFilter);
    if (sinceTs)    results = results.filter((e) => e.ts > sinceTs);
    results = results.slice(-limit).reverse();

    res.setHeader("Cache-Control", "no-store");
    res.json({
      total: totalReceived,
      buffered: ring.length,
      returned: results.length,
      errors: results,
    });
  });
}
