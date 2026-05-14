/**
 * brute-force.ts
 *
 * Per-IP login attempt tracker with progressive blocking.
 *
 * When Upstash Redis is configured, Redis is the primary shared store so every
 * cluster worker sees the same block state — an attacker can no longer bypass
 * the limit by hitting different workers. Falls back to a per-process in-memory
 * Map when Redis is unavailable (development / no env vars set).
 *
 * Thresholds (per IP, rolling 15-min window):
 *   ≥ 5  failures → block for 15 min  (medium brute force)
 *   ≥ 20 failures → block for 1 h     (high brute force)
 *   ≥ 50 failures → block for 24 h    (credential stuffing)
 *
 * Redis key scheme:
 *   bf:cnt:{ip}    — INCR counter; TTL = WINDOW_SECS (reset on success)
 *   bf:block:{ip}  — block marker; TTL = block duration; value = block seconds
 */

import type { Request, Response, NextFunction } from "express";
import { getRedis, redisAvailable } from "./redis";

const WINDOW_MS   = 15 * 60 * 1000;
const WINDOW_SECS = WINDOW_MS / 1000; // 900

const THRESHOLDS = [
  { count: 50, blockMs: 24 * 60 * 60 * 1000 }, // credential stuffing → 24 h
  { count: 20, blockMs:      60 * 60 * 1000  }, // high brute force   → 1 h
  { count:  5, blockMs:  15 * 60 * 1000      }, // medium brute force → 15 min
] as const;

// ── In-memory fallback ─────────────────────────────────────────────────────────
// Always active — provides instant blocking for same-worker repeat attempts
// even when Redis is the primary store (avoids a network round-trip per request
// once an IP is already in the local block list).

interface AttemptRecord {
  timestamps: number[];
  blockedUntil: number;
}

const store = new Map<string, AttemptRecord>();

function getRecord(ip: string): AttemptRecord {
  if (!store.has(ip)) store.set(ip, { timestamps: [], blockedUntil: 0 });
  return store.get(ip)!;
}

function pruneWindow(record: AttemptRecord): void {
  const cutoff = Date.now() - WINDOW_MS;
  record.timestamps = record.timestamps.filter(t => t > cutoff);
}

function memRecordFailed(ip: string): void {
  const record = getRecord(ip);
  pruneWindow(record);
  record.timestamps.push(Date.now());
  const count = record.timestamps.length;
  for (const { count: threshold, blockMs } of THRESHOLDS) {
    if (count >= threshold) {
      record.blockedUntil = Date.now() + blockMs;
      break;
    }
  }
}

function memIsBlocked(ip: string): boolean {
  const record = store.get(ip);
  if (!record) return false;
  if (record.blockedUntil > Date.now()) return true;
  if (record.blockedUntil > 0) { record.blockedUntil = 0; pruneWindow(record); }
  return false;
}

function memBlockSeconds(ip: string): number {
  const record = store.get(ip);
  if (!record || record.blockedUntil <= Date.now()) return 0;
  return Math.ceil((record.blockedUntil - Date.now()) / 1000);
}

function memClear(ip: string): void {
  store.delete(ip);
}

// ── Redis operations ───────────────────────────────────────────────────────────

const cntKey   = (ip: string) => `bf:cnt:${ip}`;
const blockKey = (ip: string) => `bf:block:${ip}`;

async function redisRecordFailed(ip: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const count = await redis.incr(cntKey(ip));
    // Set the sliding-window TTL on the very first increment for this IP.
    if (count === 1) await redis.expire(cntKey(ip), WINDOW_SECS);

    for (const { count: threshold, blockMs } of THRESHOLDS) {
      if (count >= threshold) {
        const blockSecs = Math.ceil(blockMs / 1000);
        // nx: false so a higher-severity block can overwrite a shorter one.
        await redis.set(blockKey(ip), blockSecs, { ex: blockSecs });
        console.warn(
          `[brute-force] Redis: IP ${ip} blocked for ${blockMs / 60_000} min after ${count} failed attempts`,
        );
        break;
      }
    }
  } catch (err) {
    console.error("[brute-force] Redis recordFailed error:", err);
  }
}

async function redisClear(ip: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(cntKey(ip), blockKey(ip));
  } catch (err) {
    console.error("[brute-force] Redis clear error:", err);
  }
}

/** Returns seconds remaining in the Redis block, or 0 when not blocked / Redis unavailable. */
async function redisBlockSeconds(ip: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const ttl = await redis.ttl(blockKey(ip));
    // ttl() returns -2 when the key doesn't exist, -1 when no expiry is set.
    return ttl > 0 ? ttl : 0;
  } catch {
    return 0;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Call this every time a login attempt FAILS.
 * Synchronous (fire-and-forget for Redis) so callers need no changes.
 */
export function recordFailedAttempt(ip: string): void {
  memRecordFailed(ip);
  if (redisAvailable) void redisRecordFailed(ip);
}

/**
 * Call this every time a login attempt SUCCEEDS — resets all counters.
 * Synchronous (fire-and-forget for Redis) so callers need no changes.
 */
export function recordSuccessfulLogin(ip: string): void {
  memClear(ip);
  if (redisAvailable) void redisClear(ip);
}

/**
 * Express middleware — reject blocked IPs before they touch the route handler.
 * Checks in-memory first (instant, no network), then Redis (cross-worker).
 * Falls back to in-memory-only when Redis is not configured.
 */
export async function bruteForceGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = getIp(req);

  // Fast-path: check this worker's own in-memory store first — zero latency.
  if (memIsBlocked(ip)) {
    rejectBlocked(res, memBlockSeconds(ip));
    return;
  }

  // Cross-worker check: consult Redis so blocks imposed by other workers apply here.
  if (redisAvailable) {
    const remaining = await redisBlockSeconds(ip);
    if (remaining > 0) {
      // Warm the local store so subsequent requests from this IP are caught
      // instantly without another Redis round-trip.
      const record = getRecord(ip);
      record.blockedUntil = Date.now() + remaining * 1000;
      rejectBlocked(res, remaining);
      return;
    }
  }

  next();
}

function rejectBlocked(res: Response, remaining: number): void {
  res
    .status(429)
    .set("Retry-After", String(remaining))
    .json({
      message: `Too many failed login attempts. Try again in ${Math.ceil(remaining / 60)} minute(s).`,
      retryAfter: remaining,
    });
}

function getIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

// Purge stale in-memory records every 30 minutes to prevent memory creep.
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of store.entries()) {
    pruneWindow(record);
    if (record.timestamps.length === 0 && record.blockedUntil < now) store.delete(ip);
  }
}, 30 * 60 * 1000).unref();
