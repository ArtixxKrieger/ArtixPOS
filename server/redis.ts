import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

let _redis: Redis | null | undefined = undefined;

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
    limiter: Ratelimit.slidingWindow(1000, "15 m"),
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
    await redis.set(key, value, { px: ttlMs });
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
