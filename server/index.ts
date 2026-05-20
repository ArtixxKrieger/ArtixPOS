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
import { ensureIndexes } from "./indexes";
import { initOllama, stopOllama } from "./ai-router";
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
import { pool } from "./db";

const app = express();
const httpServer = createServer(app);

// ── Server-level timeouts ────────────────────────────────────────────────────
// keepAliveTimeout must be > the upstream load-balancer idle timeout (Replit
// uses 75 s) so the LB never closes a connection that the server still holds.
// headersTimeout > keepAliveTimeout to avoid a race condition in Node ≥ 18
// where the headers parser gives up before keep-alive finishes.
httpServer.keepAliveTimeout = 90_000;   // 90 s
httpServer.headersTimeout    = 95_000;  // must be > keepAliveTimeout
// Hard ceiling on how long any single request can take end-to-end.
// AI streaming routes override this per-response as needed.
httpServer.timeout = parseInt(process.env.SERVER_TIMEOUT_MS ?? "120000", 10);

// Trust reverse proxies (Replit, Vercel, etc.)
app.set("trust proxy", 1);

// Gzip compression — reduces API response and HTML payload size by 60-80%.
// Applied before all routes so every response is compressed.
app.use(compression());

const isDevelopment = process.env.NODE_ENV !== "production";

// CSP script-src:
//   Development — unsafe-eval is needed by Vite HMR; unsafe-inline for hot-module scripts.
//   Production  — compiled bundles use only hashed file URLs; inline scripts and eval are
//                 NOT needed and would be an XSS vector, so both are omitted.
const scriptSrc: string[] = isDevelopment
  ? ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://accounts.google.com", "https://*.google.com"]
  : ["'self'", "https://accounts.google.com", "https://*.google.com"];

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc,
  // Styles: unsafe-inline is a required trade-off for Tailwind v3 + Radix UI
  // which generate runtime inline styles. XSS risk via style injection is
  // substantially lower than via script injection; this is an accepted gap.
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
  // Restrict images: blob/data for local POS images; restrict arbitrary https in production.
  imgSrc: isDevelopment
    ? ["'self'", "data:", "https:", "blob:"]
    : ["'self'", "data:", "blob:", "https://lh3.googleusercontent.com", "https://graph.facebook.com"],
  // Production connect-src explicitly enumerates every allowed external
  // endpoint. Sentry DSN is included so error reports are not blocked.
  connectSrc: isDevelopment
    ? ["'self'", "ws:", "wss:", "https://accounts.google.com", "https://oauth2.googleapis.com", "https://*.sentry.io", "https://*.ingest.sentry.io"]
    : ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com", "https://*.sentry.io", "https://*.ingest.sentry.io"],
  frameSrc: ["https://accounts.google.com"],
  frameAncestors: isDevelopment
    ? ["'self'", "https://replit.com", "https://*.replit.com"]
    : ["'self'"],
  objectSrc: ["'none'"],
  // Prevent <base> tag injection (base-URI hijacking attack)
  baseUri: ["'self'"],
  // Prevent form action hijacking — forms may only submit to same origin
  formAction: ["'self'"],
  // Service Worker + PWA
  workerSrc: ["'self'", "blob:"],
  // PWA manifest
  manifestSrc: ["'self'"],
  // Audio/video (receipt printing sounds, etc.)
  mediaSrc: ["'self'", "blob:", "data:"],
  // Upgrade plain HTTP sub-resources to HTTPS in production
  ...(isDevelopment ? {} : { upgradeInsecureRequests: [] }),
};

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: cspDirectives,
    },
    crossOriginEmbedderPolicy: false,
    frameguard: isDevelopment ? false : { action: "sameorigin" },
  })
);

// ── Security headers beyond Helmet defaults ───────────────────────────────
// Cross-Origin-Opener-Policy: allows Google OAuth popup flow while still
// isolating the browsing context from unrelated opener windows.
// Cross-Origin-Resource-Policy: restricts cross-origin reads of our
// responses to same-site requests only.
app.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// ── Permissions-Policy ────────────────────────────────────────────────────
// Restrict browser APIs this app does not use. identity-credentials-get
// is explicitly allowed because Google One Tap / FedCM needs it.
// Camera/microphone are kept accessible for potential future barcode
// scanning; geolocation and payment APIs are disabled.
app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    [
      "identity-credentials-get=*",
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

// ── Health check ──────────────────────────────────────────────────────────────
// Mounted before rate limiters so uptime monitors are never throttled.
// Returns per-service status so external panels can monitor each dependency.
app.get("/api/health", async (_req, res) => {
  const t = () => Date.now();

  // ── Supabase (PostgreSQL) ──────────────────────────────────────────────────
  let supabase: { status: string; latencyMs: number; error?: string };
  const dbStart = t();
  try {
    await _healthDb.execute(_healthSql`SELECT 1`);
    supabase = { status: "ok", latencyMs: t() - dbStart };
  } catch (err: any) {
    supabase = { status: "error", latencyMs: t() - dbStart, error: err?.message ?? "unreachable" };
  }

  // ── Upstash Redis ──────────────────────────────────────────────────────────
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
      redis = { status: "error", latencyMs: t() - redisStart, error: err?.message ?? "unreachable" };
    }
  }

  // ── Overall status ─────────────────────────────────────────────────────────
  // "ok"       — all configured services healthy
  // "degraded" — Redis down but DB ok (app still works, cache misses to DB)
  // "down"     — database unreachable (critical, app non-functional)
  const dbOk    = supabase.status === "ok";
  const redisOk = redis.status === "ok" || redis.status === "not_configured";
  const overall = !dbOk ? "down" : !redisOk ? "degraded" : "ok";

  const payload = {
    status: overall,
    uptime: Math.floor(process.uptime()),
    ts: new Date().toISOString(),
    services: { supabase, redis },
  };

  res.status(dbOk ? 200 : 503).json(payload);
});

// ── Geo detection ─────────────────────────────────────────────────────────────
// Reads country headers injected by the reverse proxy — no DB, no external call.
// Mounted before rate limiters so it is never throttled (called on every page load).
app.get("/api/geo", (req, res) => {
  const country =
    (req.headers["x-vercel-ip-country"] as string) ||
    (req.headers["cf-ipcountry"] as string) ||
    (req.headers["x-country-code"] as string) ||
    null;
  const clean = country && /^[A-Z]{2}$/.test(country.toUpperCase())
    ? country.toUpperCase()
    : null;
  res.setHeader("Cache-Control", "no-store");
  res.json({ countryCode: clean });
});

// ── Metrics ───────────────────────────────────────────────────────────────────
// Exposes request counts, latency percentiles, and cache hit rate.
// Optional token auth: set METRICS_TOKEN env var to require Bearer <token>.
// Mounted before rate limiters so monitoring polls are never throttled.
app.get("/api/metrics", (req, res) => {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${token}`) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  }
  res.json({
    ...getMetricsSnapshot(),
    circuitBreakers: getAllBreakerStates(),
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
// In-memory fallbacks — used when Redis is not configured. These live on each
// replica independently, which is fine for development. In production, Redis
// (via getAuthRatelimit / getApiRatelimit) provides a shared counter across
// all autoscale replicas so limits are enforced globally, not per-instance.

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

// Redis-backed middleware factory.
// Identifies each client by IP (same as express-rate-limit default).
// Falls back to express-rate-limit transparently when Redis is unavailable.
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
        return res
          .status(429)
          .json({ message: "Too many requests, please try again later." });
      }
      next();
    } catch {
      // Redis error — degrade gracefully to in-memory fallback.
      fallback(req, res, next);
    }
  };
}

const authLimiter = makeRedisRateLimiter(getAuthRatelimit, authLimiterFallback);
const apiLimiter  = makeRedisRateLimiter(getApiRatelimit,  apiLimiterFallback);

// OAuth callback routes are exempt — they're already protected by HMAC state
// verification and must not be blocked mid-flow when users retry sign-in.
app.use("/auth", (req, res, next) => {
  if (req.path.startsWith("/google") || req.path.startsWith("/facebook")) {
    return next();
  }
  return authLimiter(req, res, next);
});
app.use("/api/auth", authLimiter);
app.use("/api",      apiLimiter);

// ── CORS for native (Capacitor) clients ──────────────────────────────────────
// Web clients hit the same origin so they never trigger CORS.
// The APK WebView uses https://localhost (Capacitor v4+) or capacitor://localhost,
// which is cross-origin to the deployed server. We must explicitly allow those
// origins so Bearer-token API calls are not blocked by the preflight check.
const NATIVE_ORIGINS = [
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
  "ionic://localhost",
];

app.use((req, res, next) => {
  const origin = req.headers.origin ?? "";
  const isNativeOrigin =
    NATIVE_ORIGINS.includes(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin);

  if (isNativeOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    // Note: credentials (cookies) are intentionally NOT allowed cross-origin.
    // Native clients authenticate via Bearer token, not cookies.
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// ── Webhook raw body (must come BEFORE express.json) ─────────────────────────
// PayMongo (and future payment providers) sign the raw request body with
// HMAC-SHA256. Once express.json() parses the body the raw bytes are gone,
// so we intercept /api/webhooks/* first with express.raw() which sets
// req.body to a Buffer. The signature-verification handler reads that Buffer;
// express.json() sees the body is already consumed and skips re-parsing.
app.use("/api/webhooks", express.raw({ type: "application/json", limit: "1mb" }));

// ── Body parsing (with size limits to prevent DoS) ────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

// ── CSRF cookie ───────────────────────────────────────────────────────────────
// Sets a readable csrf_token cookie used by the double-submit pattern.
// Must come after cookieParser() so req.cookies is already populated.
app.use(csrfCookieMiddleware);

// ── X-Request-ID ─────────────────────────────────────────────────────────────
// Assigns a unique correlation ID to every request. Existing IDs from trusted
// upstream proxies (Replit, Vercel, load balancers) are preserved.
app.use((req: Request, res: Response, next: NextFunction) => {
  const existing = req.headers["x-request-id"];
  const id = Array.isArray(existing) ? existing[0] : existing ?? randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
});

// ── Per-request timeout ───────────────────────────────────────────────────────
// If a handler hasn't called res.end() within REQUEST_TIMEOUT_MS the response
// is closed with 503 so the client fails fast and the pool slot is freed.
// AI streaming endpoints set their own longer timeouts via res.setTimeout().
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS ?? "30000", 10);
app.use((req: Request, res: Response, next: NextFunction) => {
  // Skip for SSE/streaming routes — they manage their own lifecycle
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

// JWT auth — populates req.user from the auth_token cookie on every request
app.use(jwtAuthMiddleware);

// Passport (strategies only — no session serialisation needed)
app.use(passport.initialize());

// ── CSRF protection ───────────────────────────────────────────────────────────
// Validates X-CSRF-Token header == csrf_token cookie on all state-changing
// requests. Must come AFTER jwtAuthMiddleware so Bearer-token clients
// (native Capacitor) are already identified and can be exempted.
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
      logger.info({
        source: "express",
        method: req.method,
        path,
        status: res.statusCode,
        duration,
        requestId: rid,
        ...(capturedJsonResponse && res.statusCode >= 400
          ? { response: JSON.stringify(capturedJsonResponse).slice(0, 300) }
          : {}),
      }, `${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

// ── Initialization ───────────────────────────────────────────────────────────
// Use a promise instead of a boolean flag so concurrent requests (e.g. on
// Vercel warm instances) all await the same initialization and never receive
// an Express app with zero routes registered (which causes HTTP 404).
let _initPromise: Promise<typeof app> | null = null;

async function initializeApp() {
  if (!_initPromise) {
    _initPromise = _doInit();
  }
  return _initPromise;
}

async function _doInit() {
  try {
    console.log("[init] step 1/8 — validateEnv");
    validateEnv();
    console.log("[init] step 2/8 — initSentry");
    await initSentry();

    // Skip on Vercel — running 49 sequential SQL statements on every cold start
    // exceeds the function timeout. Indexes and column migrations must be applied
    // as a one-off step (npm run db:push) before deploying to Vercel.
    if (process.env.VERCEL !== "1") {
      console.log("[init] step 3/8 — ensureIndexes");
      await ensureIndexes();
    } else {
      console.log("[init] step 3/8 — ensureIndexes SKIPPED (Vercel)");
    }

    console.log("[init] step 3b/8 — setupRLS");
    await setupRLS();

    console.log("[init] step 4/8 — setupAuth");
    setupAuth(app);

    // Tenant context middleware — must come after auth so req.user is populated,
    // and before route handlers so every authenticated request runs with an
    // RLS-scoped DB connection (SET LOCAL app.current_tenant).
    app.use(tenantContextMiddleware(pool));

    console.log("[init] step 5/8 — registerRoutes");
    await registerRoutes(httpServer, app);
    // Fire-and-forget: pre-load cache for onboarded users after routes are ready.
    // Never blocks startup — if the DB is slow the server still starts immediately.
    warmCache().catch(() => {});
    console.log("[init] step 6/8 — setupSwagger");
    setupSwagger(app);

    // Start Ollama in background (non-blocking — doesn't delay server start)
    initOllama().catch((err) =>
      console.warn("[ai-router][ollama] init error:", err.message)
    );

    await applySentryErrorHandler(app);

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      if (res.headersSent) return next(err);

      // DB pool exhaustion / connection timeout → retry-able 503 (not a bug 500).
      // pg throws these when all connections are in use or the DB is unreachable.
      const msg: string = err?.message ?? "";
      if (
        err?.code === "ECONNREFUSED" ||
        msg.includes("too many clients") ||
        msg.includes("Connection terminated") ||
        msg.includes("connection timeout") ||
        msg.includes("Client was closed") ||
        msg.includes("pool is draining")
      ) {
        return res.status(503).json({
          message: "Server is temporarily overloaded — please retry in a moment.",
          code: "DB_UNAVAILABLE",
        });
      }

      const status = err.status || err.statusCode || 500;
      const isProduction = process.env.NODE_ENV === "production";
      const message = isProduction && status >= 500
        ? "Internal Server Error"
        : err.message || "Internal Server Error";
      console.error("Internal Server Error:", err);
      return res.status(status).json({ message });
    });

    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      try {
        const { setupVite } = await import("./vite");
        await setupVite(httpServer, app);
      } catch {
        console.log("Vite setup skipped");
      }
    }

    return app;
  } catch (error) {
    // Reset so the next request can retry initialization
    _initPromise = null;
    console.error("Failed to initialize server:", error);
    throw error;
  }
}

// ── Local server startup ────────────────────────────────────────────────────
if (process.env.VERCEL !== "1") {
  (async () => {
    try {
      await initializeApp();

      const port = process.env.PORT || process.env.REPL_PORT || "5000";
      const parsedPort = parseInt(port, 10);

      const startListening = () => {
        httpServer.listen(parsedPort, "0.0.0.0", () => {
          log(`serving on port ${parsedPort} in ${process.env.NODE_ENV || "development"} mode`);
          console.log(`Server is ready and listening on port ${parsedPort}`);
        });
      };

      httpServer.on("error", (error: any) => {
        if (error.code === "EADDRINUSE") {
          console.error(`Port ${parsedPort} is already in use.`);
          process.exit(1);
        } else {
          console.error("Server failed to start:", error);
          process.exit(1);
        }
      });

      startListening();
    } catch (error) {
      console.error("Failed to initialize server:", error);
      process.exit(1);
    }
  })();

  process.on("SIGTERM", () => {
    console.log("[shutdown] SIGTERM — draining in-flight requests (15s max)");
    stopOllama();
    // Hard kill after 15s so a stuck request never prevents a clean deploy.
    const killTimer = setTimeout(() => {
      console.warn("[shutdown] Force exit — requests still in flight after 15s");
      process.exit(0);
    }, 15_000);
    killTimer.unref(); // don't prevent the normal close path from exiting sooner
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
    // In production: log but don't crash. The cluster primary restarts workers
    // that are genuinely broken. Crashing here drops all in-flight requests for
    // what is usually a recoverable per-request error.
    // In development: crash immediately so bugs surface during testing.
    if (process.env.NODE_ENV !== "production") {
      process.exit(1);
    }
  });

  // ── Periodic health telemetry ────────────────────────────────────────────────
  // Logs heap + cache stats every 60s. Visible in deployment logs and helps
  // catch memory leaks before they OOM the process.
  setInterval(() => {
    const h = process.memoryUsage();
    const mb = (n: number) => Math.round(n / 1_048_576);
    console.log(
      `[health] heap ${mb(h.heapUsed)}/${mb(h.heapTotal)}MB  rss=${mb(h.rss)}MB  ` +
      `cache=${cache.size()} entries`
    );
  }, 60_000).unref();
}

// ── Vercel serverless handler ────────────────────────────────────────────────
export default async function handler(req: Request, res: Response) {
  try {
    const initializedApp = await initializeApp();
    return initializedApp(req, res);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[vercel] Handler init failed:", errMsg);
    if (!res.headersSent) {
      // For OAuth callbacks, redirect to login with an error instead of
      // showing a raw JSON response — gives the user a recoverable path.
      const path = req.url ?? req.path ?? "";
      const isOAuthCallback =
        path.includes("/auth/google/callback") ||
        path.includes("/auth/facebook/callback") ||
        path.includes("/auth/google") ||
        path.includes("/auth/facebook");
      if (isOAuthCallback) {
        // Include the first 150 chars of the actual error so it surfaces on the
        // login page for easy diagnosis without needing Vercel log access.
        const detail = encodeURIComponent(errMsg.slice(0, 150));
        res.redirect(`/login?error=server_unavailable&detail=${detail}`);
      } else {
        res.status(500).json({ error: "Internal Server Error", detail: errMsg.slice(0, 150) });
      }
    }
  }
}

export { app, httpServer };
