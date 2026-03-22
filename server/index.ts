import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seed } from "./db";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Cache-busting headers in development
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    if (req.path.endsWith(".html") || req.path === "/") {
      res.setHeader("Cache-Control", "no-store, no-cache, no-transform, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    } else if (req.path.includes(".js") || req.path.includes(".css")) {
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.setHeader("ETag", `"${Date.now()}"`);
    } else {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    }
  }
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
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
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

// ── Initialization ───────────────────────────────────────────────────────────
// Guard: only run once even if handler() is called multiple times (Vercel warm reuse)
let _initialized = false;

async function initializeApp() {
  if (_initialized) return app;
  _initialized = true;

  try {
    console.log("Starting server initialization...");
    await seed();
    await registerRoutes(httpServer, app);

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
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
    // Reset so the next request can try again
    _initialized = false;
    console.error("Failed to initialize server:", error);
    throw error;
  }
}

// ── Local server startup (not on Vercel) ────────────────────────────────────
if (process.env.VERCEL !== "1") {
  (async () => {
    try {
      await initializeApp();

      const port = process.env.PORT || process.env.REPL_PORT || "5000";
      const parsedPort = parseInt(port, 10);

      httpServer.listen(parsedPort, "0.0.0.0", () => {
        log(`serving on port ${parsedPort} in ${process.env.NODE_ENV || "development"} mode`);
        console.log(`Server is ready and listening on port ${parsedPort}`);
      });

      httpServer.on("error", (error) => {
        console.error("Server failed to start:", error);
        process.exit(1);
      });
    } catch (error) {
      console.error("Failed to initialize server:", error);
      process.exit(1);
    }
  })();

  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down gracefully");
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
    res.status(500).json({ error: "Internal Server Error" });
  }
}

export { app, httpServer };
