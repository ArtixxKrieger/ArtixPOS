import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// ── Redis singleton ────────────────────────────────────────────────────────────
// Uses Upstash REST API — works across autoscale replicas with no persistent
// TCP connection needed. Returns null when env vars are not configured so the
// app degrades gracefully to in-memory fallback.

let _redis: Redis | null | undefined = undefined; // undefined = not yet initialised

/** True only when Upstash env vars are set. Use to skip async Redis calls entirely. */
export const redisAvailable = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

export function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    _redis = null;
    console.warn("[redis] UPSTASH_REDIS_REST_URL / TOKEN not set — falling back to in-memory");
    return null;
  }
  try {
    _redis = new Redis({ url, token });
    console.log("[redis] Connected to Upstash Redis ✓");
    return _redis;
  } catch (err) {
    _redis = null;
    console.error("[redis] Failed to initialise Redis client:", err);
    return null;
  }
}

// ── Shared rate limiters ───────────────────────────────────────────────────────
// Created lazily on first use. Matches the same windows as the express-rate-limit
// fallback so behaviour is consistent whether Redis is available or not.

let _authRatelimit: Ratelimit | null | undefined = undefined;
let _apiRatelimit: Ratelimit | null | undefined = undefined;
let _aiRatelimit: Ratelimit | null | undefined = undefined;

export function getAuthRatelimit(): Ratelimit | null {
  if (_authRatelimit !== undefined) return _authRatelimit;
  const redis = getRedis();
  if (!redis) { _authRatelimit = null; return null; }
  _authRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "15 m"),
    prefix: "rl:auth",
    analytics: false,
  });
  return _authRatelimit;
}

export function getApiRatelimit(): Ratelimit | null {
  if (_apiRatelimit !== undefined) return _apiRatelimit;
  const redis = getRedis();
  if (!redis) { _apiRatelimit = null; return null; }
  _apiRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(300, "15 m"),
    prefix: "rl:api",
    analytics: false,
  });
  return _apiRatelimit;
}

export function getAiRatelimit(): Ratelimit | null {
  if (_aiRatelimit !== undefined) return _aiRatelimit;
  const redis = getRedis();
  if (!redis) { _aiRatelimit = null; return null; }
  _aiRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "1 h"),
    prefix: "rl:ai",
    analytics: false,
  });
  return _aiRatelimit;
}

// ── Low-level helpers ──────────────────────────────────────────────────────────
// These wrap Redis commands with error swallowing so a Redis hiccup never
// crashes the request — the caller falls back to the in-memory tier.

export async function redisGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    return await redis.get<T>(key);
  } catch (err) {
    console.error("[redis] GET error:", err);
    return null;
  }
}

export async function redisSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, value, { px: ttlMs }); // px = millisecond TTL
  } catch (err) {
    console.error("[redis] SET error:", err);
  }
}

export async function redisDel(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (err) {
    console.error("[redis] DEL error:", err);
  }
}

export async function redisDelByPattern(pattern: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    // SCAN is safe on large keyspaces — non-blocking unlike KEYS.
    let cursor: string | number = 0;
    do {
      const [nextCursor, keys]: [string | number, string[]] = await redis.scan(cursor, { match: pattern, count: 100 });
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (String(cursor) !== "0");
  } catch (err) {
    console.error("[redis] DEL_BY_PATTERN error:", err);
  }
}
