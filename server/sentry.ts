import type { Express, Request, Response, NextFunction } from "express";

let _initialized = false;

export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[sentry] SENTRY_DSN not set — error tracking disabled");
    return;
  }
  if (_initialized) return;
  _initialized = true;

  const Sentry = await import("@sentry/node");
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.npm_package_version,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0.0,
    sendDefaultPii: false,
  });
  console.log("[sentry] ✓ Error tracking initialized");
}

export async function applySentryErrorHandler(app: Express): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const Sentry = await import("@sentry/node");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(Sentry.expressErrorHandler() as any);
}
