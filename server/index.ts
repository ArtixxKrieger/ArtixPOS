import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { getAuthRatelimit, getApiRatelimit } from "./redis";
import cookieParser from "cookie-parser";
import passport from "passport";
import { randomUUID } from "crypto";
import { registerRoutes } from "./routes.js";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth, jwtAuthMiddleware } from "./auth";
import { initAuthCache } from "./auth/core";
import { ensureIndexes, ensureTables } from "./indexes";
import { db as _healthDb } from "./db";
import { sql as _healthSql } from "drizzle-orm";
import { logger } from "./logger";
import { recordRequest, getMetricsSnapshot } from "./metrics";
import { getAllBreakerStates } from "./circuit-breaker";
import { validateEnv } from "./env";
import { initSentry, applySentryErrorHandler } from "./sentry";
import { setupSwagger } from "./swagger";
import { csrfCookieMiddleware, csrfProtection } from "./csrf";
import { warmCache } from "./startup-warm";
import { cache } from "./cache";
import { tenantContextMiddleware } from "./tenant-context";
import { setupRLS } from "./rls-setup";
import { logEmailTransportStatus, startEmailDlqPoller } from "./email";
import { pool } from "./db";
import { startCleanupScheduler } from "./cleanup";
import { startNotificationScheduler } from "./notification-scheduler";
import { ensurePartitions } from "./partition-manager";
import { storage } from "./storage";
import { getAdapter, parseRouterConfig } from "./routers/factory";

const isDevelopment = process.env.NODE_ENV !== "production";
const isServerless = !!process.env.VERCEL;

const app = express();
const httpServer = createServer(app);

if (!isServerless) {
  httpServer.keepAliveTimeout = 90_000;
  httpServer.headersTimeout = 95_000;
  httpServer.timeout = parseInt(process.env.SERVER_TIMEOUT_MS ?? "120000", 10);
}

app.set("trust proxy", 1);
if (!isServerless) {
  app.use(compression());
}

const scriptSrc: string[] = isDevelopment
  ? [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      "https://accounts.google.com",
      "https://*.google.com",
    ]
  : ["'self'", "https://accounts.google.com", "https://*.google.com"];

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc,
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
  imgSrc: isDevelopment
    ? ["'self'", "data:", "https:", "blob:"]
    : [
        "'self'",
        "data:",
        "blob:",
        "https://lh3.googleusercontent.com",
        "https://graph.facebook.com",
      ],
  connectSrc: isDevelopment
    ? [
        "'self'",
        "ws:",
        "wss:",
        "https://accounts.google.com",
        "https://oauth2.googleapis.com",
        "https://*.sentry.io",
        "https://*.ingest.sentry.io",
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
      ]
    : [
        "'self'",
        "https://accounts.google.com",
        "https://oauth2.googleapis.com",
        "https://*.sentry.io",
        "https://*.ingest.sentry.io",
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
      ],
  frameSrc: ["https://accounts.google.com"],
  frameAncestors: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  workerSrc: ["'self'", "blob:"],
  manifestSrc: ["'self'"],
  mediaSrc: ["'self'", "blob:", "data:"],
  ...(isDevelopment ? {} : { upgradeInsecureRequests: [] }),

  "report-uri": ["/api/csp-report"],
};

app.use(
  helmet({
    contentSecurityPolicy: { directives: cspDirectives },
    crossOriginEmbedderPolicy: false,
    frameguard: isDevelopment ? false : { action: "sameorigin" },
  }),
);

app.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    [
      "identity-credentials-get=*",
      "camera=()",
      "geolocation=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "accelerometer=()",
      "gyroscope=()",
      "magnetometer=()",
    ].join(", "),
  );
  next();
});

app.get("/api/health", async (req, res) => {
  const now = Date.now();
  const t = () => Date.now();

  // ── Database check ────────────────────────────────────────────────────────
  let db: { status: string; latencyMs: number; error?: string };
  const dbStart = t();
  try {
    await _healthDb.execute(_healthSql`SELECT 1`);
    db = { status: "ok", latencyMs: t() - dbStart };
  } catch (err: any) {
    db = { status: "error", latencyMs: t() - dbStart, error: err?.message ?? "unreachable" };
  }

  // ── Redis check ───────────────────────────────────────────────────────────
  let redis: { status: string; latencyMs: number; error?: string };
  const { getRedis } = await import("./redis");
  const redisClient = getRedis();
  if (!redisClient) {
    redis = { status: "not_configured", latencyMs: 0 };
  } else {
    const redisStart = t();
    try {
      await redisClient.ping();
      redis = { status: "ok", latencyMs: t() - redisStart };
    } catch (err: any) {
      redis = {
        status: "error",
        latencyMs: t() - redisStart,
        error: err?.message ?? "unreachable",
      };
    }
  }

  // ── DB connection pool stats ──────────────────────────────────────────────
  const poolStats = {
    total: (pool as any).totalCount ?? null,
    idle: (pool as any).idleCount ?? null,
    waiting: (pool as any).waitingCount ?? null,
  };

  // ── Overall status ────────────────────────────────────────────────────────
  const dbOk = db.status === "ok";
  const redisOk = redis.status === "ok" || redis.status === "not_configured";
  const overall: "ok" | "degraded" | "down" = !dbOk ? "down" : !redisOk ? "degraded" : "ok";

  // ── Auth ──────────────────────────────────────────────────────────────────
  const metricsToken = process.env.METRICS_TOKEN;
  const authHeader = req.headers.authorization ?? "";
  const isAuthed = metricsToken ? authHeader === `Bearer ${metricsToken}` : false;

  res.setHeader("Cache-Control", "no-store");

  if (!isAuthed) {
    // Public: minimal — just enough for an uptime monitor ping
    return res.status(dbOk ? 200 : 503).json({
      status: overall,
      ts: new Date(now).toISOString(),
    });
  }

  // ── Memory ────────────────────────────────────────────────────────────────
  const mem = process.memoryUsage();
  const mb = (n: number) => Math.round(n / 1_048_576);

  // ── CPU / OS ──────────────────────────────────────────────────────────────
  const os = await import("os");
  const loadAvg = os.loadavg(); // 1m, 5m, 15m
  const cpuCount = os.cpus().length;
  const totalMemMb = Math.round(os.totalmem() / 1_048_576);
  const freeMemMb = Math.round(os.freemem() / 1_048_576);

  // ── App metrics ───────────────────────────────────────────────────────────
  const metrics = getMetricsSnapshot();

  // ── Circuit breakers ──────────────────────────────────────────────────────
  const breakers = getAllBreakerStates();

  // ── Cache ─────────────────────────────────────────────────────────────────
  const cacheSize = cache.size();

  res.status(dbOk ? 200 : 503).json({
    status: overall,
    ts: new Date(now).toISOString(),
    env: process.env.NODE_ENV ?? "unknown",

    process: {
      pid: process.pid,
      uptime: Math.floor(process.uptime()),
      node: process.version,
      platform: process.platform,
    },

    memory: {
      heapUsedMb: mb(mem.heapUsed),
      heapTotalMb: mb(mem.heapTotal),
      rssMb: mb(mem.rss),
      externalMb: mb(mem.external),
      heapPct: Math.round((mem.heapUsed / mem.heapTotal) * 100),
    },

    os: {
      cpus: cpuCount,
      loadAvg1m: +loadAvg[0].toFixed(2),
      loadAvg5m: +loadAvg[1].toFixed(2),
      loadAvg15m: +loadAvg[2].toFixed(2),
      totalMemMb,
      freeMemMb,
      freeMemPct: Math.round((freeMemMb / totalMemMb) * 100),
    },

    services: {
      db: { ...db, pool: poolStats },
      redis,
    },

    cache: {
      entries: cacheSize,
      hitRate: metrics.cache.hitRate,
      hits: metrics.cache.hits,
      misses: metrics.cache.misses,
    },

    requests: {
      total: metrics.requests.total,
      session: metrics.requests.session,
      errors5xx: metrics.requests.errors5xx,
      errorRate: metrics.requests.errorRate,
    },

    latency: {
      avgMs: metrics.latency.avgMs,
      p50Ms: metrics.latency.p50Ms,
      p95Ms: metrics.latency.p95Ms,
      p99Ms: metrics.latency.p99Ms,
    },

    circuitBreakers: breakers,
  });
});

app.get("/api/geo", (req, res) => {
  const country =
    (req.headers["x-vercel-ip-country"] as string) ||
    (req.headers["cf-ipcountry"] as string) ||
    (req.headers["x-country-code"] as string) ||
    null;
  const clean = country && /^[A-Z]{2}$/.test(country.toUpperCase()) ? country.toUpperCase() : null;
  res.setHeader("Cache-Control", "no-store");
  res.json({ countryCode: clean });
});

app.get("/api/metrics", (req, res) => {
  const token = process.env.METRICS_TOKEN;
  if (!token) {
    return res
      .status(403)
      .json({ message: "Metrics endpoint is disabled. Set METRICS_TOKEN to enable." });
  }
  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${token}`) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ...getMetricsSnapshot(),
    circuitBreakers: getAllBreakerStates(),
  });
});

const authLimiterFallback = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiterFallback = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

function makeRedisRateLimiter(
  getRatelimit: () => import("@upstash/ratelimit").Ratelimit | null,
  fallback: ReturnType<typeof rateLimit>,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const limiter = getRatelimit();
    if (!limiter) return fallback(req, res, next);

    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";

    try {
      const { success, remaining, reset } = await limiter.limit(ip);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", reset);
      if (!success) {
        return res.status(429).json({ message: "Too many requests, please try again later." });
      }
      next();
    } catch {
      fallback(req, res, next);
    }
  };
}

const authLimiter = makeRedisRateLimiter(getAuthRatelimit, authLimiterFallback);
const apiLimiter = makeRedisRateLimiter(getApiRatelimit, apiLimiterFallback);

app.use("/auth", (req, res, next) => {
  if (req.path.startsWith("/google") || req.path.startsWith("/facebook")) {
    return next();
  }
  return authLimiter(req, res, next);
});
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

const NATIVE_ORIGINS = [
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
  "ionic://localhost",
];

app.use((req, res, next) => {
  const origin = req.headers.origin ?? "";

  const allowedOrigin =
    NATIVE_ORIGINS.find((o) => o === origin) ??
    (/^http:\/\/localhost(:\d+)?$/.test(origin) ? origin : null);

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

app.post(
  "/api/csp-report",
  express.json({ type: ["application/json", "application/csp-report"], limit: "32kb" }),
  (req: Request, res: Response) => {
    const report = (req.body as Record<string, unknown>)?.["csp-report"] ?? req.body;
    const blocked = (report as Record<string, unknown>)?.["blocked-uri"] ?? "unknown";
    const directive = (report as Record<string, unknown>)?.["violated-directive"] ?? "unknown";
    const doc = (report as Record<string, unknown>)?.["document-uri"] ?? "";
    logger.warn({ blocked, directive, doc }, "[csp] violation");
    res.status(204).end();
  },
);

app.use("/api/webhooks", express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());
app.use(csrfCookieMiddleware);

app.use((req: Request, res: Response, next: NextFunction) => {
  const existing = req.headers["x-request-id"];
  const id = Array.isArray(existing) ? existing[0] : (existing ?? randomUUID());
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
});

if (!isServerless) {
  const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS ?? "30000", 10);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/ai/stream") || req.path.startsWith("/api/ai/chat")) {
      return next();
    }
    res.setTimeout(REQUEST_TIMEOUT_MS, () => {
      if (!res.headersSent) {
        res.status(503).json({
          message: "Request timed out. The server is under load — please retry.",
          code: "REQUEST_TIMEOUT",
        });
      }
    });
    next();
  });
}

app.use(jwtAuthMiddleware);
app.use(passport.initialize());
app.use(csrfProtection);

export function log(message: string, source = "express") {
  logger.info({ source }, message);
}

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api") || path.startsWith("/auth")) {
      recordRequest(duration, res.statusCode);
      const rid = req.requestId?.slice(0, 8);
      logger.info(
        {
          source: "express",
          method: req.method,
          path,
          status: res.statusCode,
          duration,
          requestId: rid,
          ...(capturedJsonResponse && res.statusCode >= 400
            ? { response: JSON.stringify(capturedJsonResponse).slice(0, 300) }
            : {}),
        },
        `${req.method} ${path} ${res.statusCode} in ${duration}ms`,
      );
    }
  });

  next();
});

let _initPromise: Promise<typeof app> | null = null;

async function initializeApp() {
  if (!_initPromise) {
    _initPromise = _doInit();
  }
  return _initPromise;
}

let _initDone = false;

async function _doInit() {
  // Each step is individually guarded. The app MUST always return so the
  // login page loads. If a critical step fails we log it prominently and
  // continue — individual routes will return errors instead of crashing
  // the entire app. The _initDone flag prevents duplicate registration
  // when the Vercel handler retries initialization.
  if (_initDone) return app;

  try {
    console.log("[init] step 1/8 — validateEnv");
    validateEnv();
  } catch (e: any) {
    console.error("[init] validateEnv failed:", e.message);
  }

  try {
    console.log("[init] step 2/8 — initSentry");
    await initSentry();
  } catch (e: any) {
    console.error("[init] initSentry failed:", e.message);
  }

  try {
    // ensureTables runs on ALL environments — fast DDL only (no indexes).
    // Creates missing tables and columns so the schema is always in sync.
    await ensureTables();
  } catch (e: any) {
    console.error("[migrations] ensureTables failed:", e.message);
  }

  if (process.env.VERCEL !== "1") {
    try {
      console.log("[init] step 3/8 — ensureIndexes");
      await ensureIndexes();
      await ensurePartitions();
    } catch (e: any) {
      console.error("[indexes] skipped:", e.message);
    }
  } else {
    console.log("[init] step 3/8 — ensureIndexes SKIPPED (Vercel)");
  }

  if (process.env.VERCEL !== "1") {
    try {
      console.log("[init] step 3b/8 — setupRLS");
      await setupRLS();
    } catch (e: any) {
      console.error("[rls] skipped:", e.message);
    }
  } else {
    console.log("[init] step 3b/8 — setupRLS SKIPPED (Vercel)");
  }

  try {
    logEmailTransportStatus();
  } catch {}
  try {
    startEmailDlqPoller();
  } catch {}
  try {
    initAuthCache();
  } catch {}

  try {
    console.log("[init] step 4/8 — setupAuth");
    setupAuth(app);
  } catch (e: any) {
    console.error("[init] setupAuth FAILED:", e.message);
  }

  try {
    app.use(tenantContextMiddleware(pool));
  } catch {}

  try {
    console.log("[init] step 5/8 — registerRoutes");
    await registerRoutes(httpServer, app);
  } catch (e: any) {
    console.error("[init] registerRoutes FAILED:", e.message);
  }

  try {
    if (!isServerless) warmCache().catch(() => {});
  } catch {}
  if (!isServerless) {
    try {
      startCleanupScheduler();
      startNotificationScheduler();
    } catch {}
  }

  if (!isServerless) {
    try {
      console.log("[init] step 6/8 — setupSwagger");
      setupSwagger(app);
    } catch {}
  } else {
    console.log("[init] step 6/8 — setupSwagger SKIPPED (Vercel)");
  }

  try {
    await applySentryErrorHandler(app);
  } catch {}

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    const msg: string = err?.message ?? "";
    if (
      err?.code === "ECONNREFUSED" ||
      err?.code === "EMAXCONN" ||
      msg.includes("too many clients") ||
      msg.includes("Connection terminated") ||
      msg.includes("connection timeout") ||
      msg.includes("pool is draining")
    ) {
      return res.status(503).json({
        message: "Server is temporarily overloaded — please retry.",
        code: "DB_UNAVAILABLE",
      });
    }
    const status = err.status || err.statusCode || 500;
    console.error("[global-error]", err);
    return res.status(status).json({ message: err.message || "Internal Server Error" });
  });

  if (process.env.NODE_ENV === "production") {
    try {
      serveStatic(app);
    } catch {}
  } else {
    try {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    } catch {
      console.log("Vite setup skipped");
    }
  }

  _initDone = true;
  console.log("[init] ✓ App initialized");
  return app;
}

if (process.env.VERCEL !== "1") {
  (async () => {
    try {
      const port = process.env.PORT || "5000";
      const parsedPort = parseInt(port, 10);

      // Listen first so Replit detects the open port immediately.
      // initializeApp (which includes slow Vite dev-server startup) runs
      // after the port is open and continues in the same async chain.
      await new Promise<void>((resolve, reject) => {
        httpServer.once("error", (error: any) => {
          if (error.code === "EADDRINUSE") {
            console.error(`Port ${parsedPort} is already in use.`);
            process.exit(1);
          }
          reject(error);
        });
        httpServer.listen(parsedPort, "0.0.0.0", () => {
          log(`serving on port ${parsedPort} in ${process.env.NODE_ENV || "development"} mode`);
          console.log(`Server is listening on port ${parsedPort} — finishing init…`);
          resolve();
        });
      });

      await initializeApp();
      console.log("Server is ready and listening on port " + parsedPort);
    } catch (error) {
      console.error("Failed to initialize server:", error);
      process.exit(1);
    }
  })();

  process.on("SIGTERM", () => {
    console.log("[shutdown] SIGTERM — draining in-flight requests (15s max)");
    const killTimer = setTimeout(() => {
      console.warn("[shutdown] Force exit — requests still in flight after 15s");
      process.exit(0);
    }, 15_000);
    killTimer.unref();
    httpServer.close(() => {
      clearTimeout(killTimer);
      console.log("[shutdown] Clean exit");
      process.exit(0);
    });
  });

  process.on("uncaughtException", (error) => {
    console.error("[server] Uncaught Exception:", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, _promise) => {
    console.error("[server] Unhandled Rejection:", reason);
    if (process.env.NODE_ENV !== "production") {
      process.exit(1);
    }
  });

  if (!isServerless)
    setInterval(async () => {
      try {
        const expired = await storage.expireOverdueVouchers();
        if (!expired.length) return;
        const byUser: Record<string, typeof expired> = {};
        for (const v of expired) (byUser[v.userId] ??= []).push(v);
        for (const [userId, vouchers] of Object.entries(byUser)) {
          const settings = await storage.getSettings(userId);
          const routerConfig = parseRouterConfig(settings?.routerConfig);
          if (!routerConfig || !routerConfig.enabled || !routerConfig.host) continue;
          try {
            const adapter = await getAdapter(routerConfig.type);
            for (const v of vouchers) {
              if (v.mikrotikUserId) {
                adapter.removeUser(routerConfig, v.mikrotikUserId).catch(() => {});
              }
            }
          } catch {}
        }
        console.log(`[voucher-expiry] expired=${expired.length}`);
      } catch (err: any) {
        console.warn("[voucher-expiry] cron error:", err?.message);
      }
    }, 5 * 60_000).unref();

  if (!isServerless)
    setInterval(() => {
      const h = process.memoryUsage();
      const mb = (n: number) => Math.round(n / 1_048_576);
      console.log(
        `[health] heap ${mb(h.heapUsed)}/${mb(h.heapTotal)}MB  rss=${mb(h.rss)}MB  ` +
          `cache=${cache.size()} entries`,
      );
    }, 60_000).unref();
}

export default async function handler(req: Request, res: Response) {
  let initializedApp: typeof app | null = null;
  let lastErr: unknown;

  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      initializedApp = await initializeApp();
      break;
    } catch (error) {
      lastErr = error;
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[vercel] Init failed (attempt ${attempt + 1}/${MAX_ATTEMPTS}): ${errMsg}`);

      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise<void>((r) => setTimeout(r, Math.min(500 * 2 ** attempt, 4000)));
      }
    }
  }

  if (!initializedApp) {
    const finalMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    console.error("[vercel] Init exhausted:", finalMsg);
    if (!res.headersSent) {
      res.status(503).json({ error: "Server is starting up. Please retry." });
    }
    return;
  }

  return initializedApp(req, res);
}

export { app, httpServer };
