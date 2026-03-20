import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import { registerRoutes } from "../server/routes";
import { serveStatic } from "../server/static";
import { createServer } from "http";
import { seed } from "../server/db";

// Cache the initialized app to avoid re-initialization on every request
let cachedApp: express.Express | null = null;
let initPromise: Promise<express.Express> | null = null;

async function initializeApp(): Promise<express.Express> {
  if (cachedApp) {
    return cachedApp;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      console.log("[Vercel] Initializing Express app...");
      
      const app = express();
      const httpServer = createServer(app);

      // Middleware
      app.use(
        express.json({
          verify: (req: any, _res, buf) => {
            req.rawBody = buf;
          },
        })
      );
      app.use(express.urlencoded({ extended: false }));

      // Logging middleware
      app.use((req, res, next) => {
        const start = Date.now();
        const path = req.path;
        let capturedJsonResponse: Record<string, any> | undefined = undefined;

        const originalResJson = res.json;
        res.json = function (bodyJson: any, ...args) {
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
            console.log(`[express] ${logLine}`);
          }
        });

        next();
      });

      // Add a test API route
      app.get("/api", (req, res) => {
        res.json({ message: "API running on Vercel" });
      });

      // Initialize database
      await seed();

      // Register all routes
      await registerRoutes(httpServer, app);

      // Error handling
      app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";

        console.error("[vercel] Internal Server Error:", err);

        if (res.headersSent) {
          return next(err);
        }

        return res.status(status).json({ message });
      });

      // Serve static files in production
      try {
        serveStatic(app);
      } catch (error) {
        console.warn("[vercel] Could not serve static files:", error);
      }

      cachedApp = app;
      console.log("[Vercel] Express app initialized successfully");
      return app;
    } catch (error) {
      console.error("[vercel] Failed to initialize app:", error);
      throw error;
    }
  })();

  return initPromise;
}

// Export handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const app = await initializeApp();
    return app(req as any, res as any);
  } catch (error) {
    console.error("[vercel] Handler error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
