/**
 * brute-force.ts
 *
 * Two-layer login attempt tracker with progressive blocking.
 *
 * Layer 1 — Per-IP (existing):
 *   Blocks an IP after repeated failures regardless of which account is targeted.
 *   Thresholds (rolling 15-min window):
 *     ≥ 5  failures → block for 15 min  (medium brute force)
 *     ≥ 20 failures → block for 1 h     (high brute force)
 *     ≥ 50 failures → block for 24 h    (credential stuffing)
 *
 * Layer 2 — Per-email (new):
 *   Blocks a specific account after repeated failures even if the attacker
 *   rotates IPs (VPN/proxy/botnet). The email is SHA-256-hashed before use as
 *   a key so no PII is stored in Redis or in-process memory.
 *   Thresholds (rolling 1-hour window):
 *     ≥ 10 failures → block for 2 h
 *     ≥ 25 failures → block for 24 h
 *
 * When Upstash Redis is configured it is the primary shared store so every
 * cluster worker sees the same block state. Falls back to a per-process
 * in-memory Map when Redis is unavailable.
 *
 * Redis key scheme:
 *   bf:cnt:{ip}        — IP failure counter; TTL = WINDOW_SECS
 *   bf:block:{ip}      — IP block marker;    TTL = block duration
 *   bf:ecnt:{emailHash} — email failure counter; TTL = EMAIL_WINDOW_SECS
 *   bf:eblock:{emailHash} — email block marker; TTL = block duration
 */

import { createHash } from "crypto";
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

// Hash the IP before using as a Redis key — avoids storing raw IP addresses (PII) in Redis.
const hashIp   = (ip: string) => createHash("sha256").update(ip).digest("hex").slice(0, 16);
const cntKey   = (ip: string) => `bf:cnt:${hashIp(ip)}`;
const blockKey = (ip: string) => `bf:block:${hashIp(ip)}`;

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
        const maskedIp = ip.replace(/(\d+\.\d+)\.\d+\.\d+/, "$1.*.*").replace(/([0-9a-f:]{4,}):[\da-f:]+$/i, "$1:****");
        console.warn(
          `[brute-force] Redis: IP ${maskedIp} blocked for ${blockMs / 60_000} min after ${count} failed attempts`,
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

// ── Per-email rate limiting ────────────────────────────────────────────────────
// Catches IP-rotating attackers who target a single account from many IPs.
// The email is hashed with SHA-256 before storage so no PII hits Redis or RAM.

const EMAIL_WINDOW_MS   = 60 * 60 * 1000; // 1-hour rolling window
const EMAIL_WINDOW_SECS = EMAIL_WINDOW_MS / 1000;

const EMAIL_THRESHOLDS = [
  { count: 25, blockMs: 24 * 60 * 60 * 1000 }, // sustained campaign → 24 h
  { count: 10, blockMs:  2 * 60 * 60 * 1000 }, // targeted attack    → 2 h
] as const;

const emailStore = new Map<string, AttemptRecord>();

function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function getEmailRecord(hash: string): AttemptRecord {
  if (!emailStore.has(hash)) emailStore.set(hash, { timestamps: [], blockedUntil: 0 });
  return emailStore.get(hash)!;
}

function pruneEmailWindow(record: AttemptRecord): void {
  const cutoff = Date.now() - EMAIL_WINDOW_MS;
  record.timestamps = record.timestamps.filter(t => t > cutoff);
}

function memEmailRecordFailed(hash: string): void {
  const record = getEmailRecord(hash);
  pruneEmailWindow(record);
  record.timestamps.push(Date.now());
  const count = record.timestamps.length;
  for (const { count: threshold, blockMs } of EMAIL_THRESHOLDS) {
    if (count >= threshold) {
      record.blockedUntil = Date.now() + blockMs;
      break;
    }
  }
}

function memEmailBlockSeconds(hash: string): number {
  const record = emailStore.get(hash);
  if (!record || record.blockedUntil <= Date.now()) return 0;
  return Math.ceil((record.blockedUntil - Date.now()) / 1000);
}

function memEmailClear(hash: string): void {
  emailStore.delete(hash);
}

const eCntKey   = (h: string) => `bf:ecnt:${h}`;
const eBlockKey = (h: string) => `bf:eblock:${h}`;

async function redisEmailRecordFailed(hash: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const count = await redis.incr(eCntKey(hash));
    if (count === 1) await redis.expire(eCntKey(hash), EMAIL_WINDOW_SECS);
    for (const { count: threshold, blockMs } of EMAIL_THRESHOLDS) {
      if (count >= threshold) {
        const blockSecs = Math.ceil(blockMs / 1000);
        await redis.set(eBlockKey(hash), blockSecs, { ex: blockSecs });
        console.warn(`[brute-force] Redis: email blocked for ${blockMs / 3_600_000}h after ${count} failed attempts`);
        break;
      }
    }
  } catch (err) {
    console.error("[brute-force] Redis emailRecordFailed error:", err);
  }
}

async function redisEmailBlockSeconds(hash: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const ttl = await redis.ttl(eBlockKey(hash));
    return ttl > 0 ? ttl : 0;
  } catch {
    return 0;
  }
}

async function redisEmailClear(hash: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(eCntKey(hash), eBlockKey(hash));
  } catch (err) {
    console.error("[brute-force] Redis emailClear error:", err);
  }
}

/**
 * Record a failed login attempt for a specific email address.
 * Call this whenever an email/password pair fails authentication.
 */
export function recordEmailFailedAttempt(email: string): void {
  const hash = hashEmail(email);
  memEmailRecordFailed(hash);
  if (redisAvailable) void redisEmailRecordFailed(hash);
}

/**
 * Clear the email failure counter on successful login.
 * Call this alongside recordSuccessfulLogin().
 */
export function recordEmailSuccessfulLogin(email: string): void {
  const hash = hashEmail(email);
  memEmailClear(hash);
  if (redisAvailable) void redisEmailClear(hash);
}

/**
 * Check whether a specific email is currently blocked.
 * Returns { blocked: false } or { blocked: true, retryAfterSecs }.
 * Async because it may need to check Redis for cross-worker state.
 */
export async function checkEmailBlocked(
  email: string,
): Promise<{ blocked: false } | { blocked: true; retryAfterSecs: number }> {
  const hash = hashEmail(email);

  const memSecs = memEmailBlockSeconds(hash);
  if (memSecs > 0) return { blocked: true, retryAfterSecs: memSecs };

  if (redisAvailable) {
    const redisSecs = await redisEmailBlockSeconds(hash);
    if (redisSecs > 0) {
      // Warm local store to avoid repeated Redis lookups
      const record = getEmailRecord(hash);
      record.blockedUntil = Date.now() + redisSecs * 1000;
      return { blocked: true, retryAfterSecs: redisSecs };
    }
  }

  return { blocked: false };
}

// Purge stale in-memory records every 30 minutes to prevent memory creep.
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of store.entries()) {
    pruneWindow(record);
    if (record.timestamps.length === 0 && record.blockedUntil < now) store.delete(ip);
  }
  for (const [hash, record] of emailStore.entries()) {
    pruneEmailWindow(record);
    if (record.timestamps.length === 0 && record.blockedUntil < now) emailStore.delete(hash);
  }
}, 30 * 60 * 1000).unref();
