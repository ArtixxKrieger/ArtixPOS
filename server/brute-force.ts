/**
 * brute-force.ts
 *
 * In-memory per-IP login attempt tracker with progressive blocking.
 * Detects brute-force and credential-stuffing attacks before they
 * hit the database.
 *
 * Thresholds (per IP, rolling window):
 *   ≥ 5  failures in 15 min → block for 15 min  (medium)
 *   ≥ 20 failures in 15 min → block for 1 h     (high)
 *   ≥ 50 failures in 15 min → block for 24 h    (critical — credential stuffing)
 *
 * On any successful login the failure counter for that IP is cleared.
 *
 * ⚠️  CLUSTER-MODE LIMITATION: This store is per-process (in-memory only).
 * In production cluster mode (N worker processes) an attacker gets N × 5
 * attempts before any single worker blocks them.
 * To fix: replace `store` with a shared Redis-backed counter using the
 * existing Upstash client in server/cache.ts (INCR + EXPIRE + GET pattern).
 * Until then, the rate-limiter on /api/auth/* provides a secondary cap.
 */

import type { Request, Response, NextFunction } from "express";

interface AttemptRecord {
  timestamps: number[];
  blockedUntil: number;
}

const WINDOW_MS   = 15 * 60 * 1000;
const THRESHOLDS  = [
  { count: 50, blockMs: 24 * 60 * 60 * 1000 }, // credential stuffing → 24 h
  { count: 20, blockMs:      60 * 60 * 1000  }, // high brute force   → 1 h
  { count:  5, blockMs:  15 * 60 * 1000      }, // medium brute force → 15 min
] as const;

const store = new Map<string, AttemptRecord>();

function getIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

function getRecord(ip: string): AttemptRecord {
  if (!store.has(ip)) {
    store.set(ip, { timestamps: [], blockedUntil: 0 });
  }
  return store.get(ip)!;
}

function pruneWindow(record: AttemptRecord): void {
  const cutoff = Date.now() - WINDOW_MS;
  record.timestamps = record.timestamps.filter(t => t > cutoff);
}

/** Call this every time a login attempt FAILS. */
export function recordFailedAttempt(ip: string): void {
  const record = getRecord(ip);
  pruneWindow(record);
  record.timestamps.push(Date.now());

  const count = record.timestamps.length;
  for (const { count: threshold, blockMs } of THRESHOLDS) {
    if (count >= threshold) {
      record.blockedUntil = Date.now() + blockMs;
      console.warn(
        `[brute-force] IP ${ip} blocked for ${blockMs / 60_000} min after ${count} failed attempts`
      );
      break;
    }
  }
}

/** Call this every time a login attempt SUCCEEDS — resets the counter. */
export function recordSuccessfulLogin(ip: string): void {
  store.delete(ip);
}

/** Returns true when the IP is currently blocked. */
export function isBlocked(ip: string): boolean {
  const record = store.get(ip);
  if (!record) return false;
  if (record.blockedUntil > Date.now()) return true;
  // Block window expired — clean up
  if (record.blockedUntil > 0) {
    record.blockedUntil = 0;
    pruneWindow(record);
  }
  return false;
}

/** Returns seconds remaining in the block (0 when not blocked). */
export function blockSecondsRemaining(ip: string): number {
  const record = store.get(ip);
  if (!record || record.blockedUntil <= Date.now()) return 0;
  return Math.ceil((record.blockedUntil - Date.now()) / 1000);
}

/**
 * Express middleware — drop blocked IPs before they touch the handler.
 * Apply directly to /api/auth/login and /api/auth/local-login.
 */
export function bruteForceGuard(req: Request, res: Response, next: NextFunction): void {
  const ip = getIp(req);
  if (isBlocked(ip)) {
    const remaining = blockSecondsRemaining(ip);
    res
      .status(429)
      .set("Retry-After", String(remaining))
      .json({
        message: `Too many failed login attempts. Try again in ${Math.ceil(remaining / 60)} minute(s).`,
        retryAfter: remaining,
      });
    return;
  }
  next();
}

// Purge stale records every 30 minutes so memory doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of store.entries()) {
    pruneWindow(record);
    if (record.timestamps.length === 0 && record.blockedUntil < now) {
      store.delete(ip);
    }
  }
}, 30 * 60 * 1000).unref();
