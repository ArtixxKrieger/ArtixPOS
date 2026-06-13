

import { createHash } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { getRedis, redisAvailable } from "./redis";

const WINDOW_MS   = 15 * 60 * 1000;
const WINDOW_SECS = WINDOW_MS / 1000;

const THRESHOLDS = [
  { count: 50, blockMs: 24 * 60 * 60 * 1000 },
  { count: 20, blockMs:      60 * 60 * 1000  },
  { count:  5, blockMs:  15 * 60 * 1000      },
] as const;

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

const hashIp   = (ip: string) => createHash("sha256").update(ip).digest("hex").slice(0, 16);
const cntKey   = (ip: string) => `bf:cnt:${hashIp(ip)}`;
const blockKey = (ip: string) => `bf:block:${hashIp(ip)}`;

async function redisRecordFailed(ip: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const count = await redis.incr(cntKey(ip));

    if (count === 1) await redis.expire(cntKey(ip), WINDOW_SECS);

    for (const { count: threshold, blockMs } of THRESHOLDS) {
      if (count >= threshold) {
        const blockSecs = Math.ceil(blockMs / 1000);

        await redis.set(blockKey(ip), blockSecs, { ex: blockSecs });
        console.warn(
          `[brute-force] Redis: IP blocked for ${blockMs / 60_000} min after ${count} failed attempts`,
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

async function redisBlockSeconds(ip: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const ttl = await redis.ttl(blockKey(ip));

    return ttl > 0 ? ttl : 0;
  } catch {
    return 0;
  }
}

export function recordFailedAttempt(ip: string): void {
  memRecordFailed(ip);
  if (redisAvailable) void redisRecordFailed(ip);
}

export function recordSuccessfulLogin(ip: string): void {
  memClear(ip);
  if (redisAvailable) void redisClear(ip);
}

export async function bruteForceGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = getIp(req);

if (memIsBlocked(ip)) {
    rejectBlocked(res, memBlockSeconds(ip));
    return;
  }

if (redisAvailable) {
    const remaining = await redisBlockSeconds(ip);
    if (remaining > 0) {

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

const EMAIL_WINDOW_MS   = 60 * 60 * 1000;
const EMAIL_WINDOW_SECS = EMAIL_WINDOW_MS / 1000;

const EMAIL_THRESHOLDS = [
  { count: 25, blockMs: 24 * 60 * 60 * 1000 },
  { count: 10, blockMs:  2 * 60 * 60 * 1000 },
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

export function recordEmailFailedAttempt(email: string): void {
  const hash = hashEmail(email);
  memEmailRecordFailed(hash);
  if (redisAvailable) void redisEmailRecordFailed(hash);
}

export function recordEmailSuccessfulLogin(email: string): void {
  const hash = hashEmail(email);
  memEmailClear(hash);
  if (redisAvailable) void redisEmailClear(hash);
}

export async function checkEmailBlocked(
  email: string,
): Promise<{ blocked: false } | { blocked: true; retryAfterSecs: number }> {
  const hash = hashEmail(email);

  const memSecs = memEmailBlockSeconds(hash);
  if (memSecs > 0) return { blocked: true, retryAfterSecs: memSecs };

  if (redisAvailable) {
    const redisSecs = await redisEmailBlockSeconds(hash);
    if (redisSecs > 0) {

      const record = getEmailRecord(hash);
      record.blockedUntil = Date.now() + redisSecs * 1000;
      return { blocked: true, retryAfterSecs: redisSecs };
    }
  }

  return { blocked: false };
}

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
