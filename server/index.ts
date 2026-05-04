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

const app = express();
const httpServer = createServer(app);

// Trust reverse proxies (Replit, Vercel, etc.)
app.set("trust proxy", 1);

// Gzip compression — reduces API response and HTML payload size by 60-80%.
// Applied before all routes so every response is compressed.
app.use(compression());

const isDevelopment = process.env.NODE_ENV !== "production";

// 'unsafe-eval' is only required by Vite HMR in development.
// Production builds use pre-compiled assets and must not allow eval.
const scriptSrc: string[] = isDevelopment
  ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
  : ["'self'", "'unsafe-inline'"];

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc,
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
  imgSrc: ["'self'", "data:", "https:", "blob:"],
  connectSrc: isDevelopment
    ? ["'self'", "ws:", "wss:", "https://accounts.google.com", "https://oauth2.googleapis.com"]
    : ["'self'", "https://accounts.google.com", "https://oauth2.googleapis.com"],
  frameSrc: ["'none'"],
  frameAncestors: isDevelopment
    ? ["'self'", "https://replit.com", "https://*.replit.com"]
    : ["'self'"],
  objectSrc: ["'none'"],
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

// ── Health check ──────────────────────────────────────────────────────────────
// Mounted before rate limiters so uptime monitors are never throttled.
app.get("/api/health", async (_req, res) => {
  try {
    await _healthDb.execute(_healthSql`SELECT 1`);
    res.json({ status: "ok", uptime: Math.floor(process.uptime()), ts: new Date().toISOString() });
  } catch (err: any) {
    res.status(503).json({ status: "degraded", error: err?.message ?? "db unreachable" });
  }
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
  max: 300,
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

app.use("/auth",     authLimiter);
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

// ── Body parsing (with size limits to prevent DoS) ────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

// ── X-Request-ID ─────────────────────────────────────────────────────────────
// Assigns a unique correlation ID to every request. Existing IDs from trusted
// upstream proxies (Replit, Vercel, load balancers) are preserved.
app.use((req: Request, res: Response, next: NextFunction) => {
  const existing = req.headers["x-request-id"];
  const id = Array.isArray(existing) ? existing[0] : existing ?? randomUUID();
  (req as any).requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
});

// JWT auth — populates req.user from the auth_token cookie on every request
app.use(jwtAuthMiddleware);

// Passport (strategies only — no session serialisation needed)
app.use(passport.initialize());

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
      const rid = (req as any).requestId?.slice(0, 8);
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
    console.log("Starting server initialization...");

    await ensureIndexes();
    setupAuth(app);
    await registerRoutes(httpServer, app);

    // Start Ollama in background (non-blocking — doesn't delay server start)
    initOllama().catch((err) =>
      console.warn("[ai-router][ollama] init error:", err.message)
    );

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const isProduction = process.env.NODE_ENV === "production";
      const message = isProduction && status >= 500
        ? "Internal Server Error"
        : err.message || "Internal Server Error";
      console.error("Internal Server Error:", err);
      if (res.headersSent) return next(err);
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
    console.log("SIGTERM received, shutting down gracefully");
    stopOllama();
    httpServer.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  });

  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
  });
}

// ── Vercel serverless handler ────────────────────────────────────────────────
export default async function handler(req: Request, res: Response) {
  try {
    const initializedApp = await initializeApp();
    return initializedApp(req, res);
  } catch (error) {
    console.error("Handler error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
}

export { app, httpServer };
