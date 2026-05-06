import { redisGet, redisSet, redisDel, redisDelByPattern } from "./redis";
import { recordCacheHit, recordCacheMiss } from "./metrics";

const MAX_ENTRIES = 5_000; // prevent unbounded growth under high tenant load

type Entry<T> = { value: T; expiresAt: number };

class TtlCache {
  private store = new Map<string, Entry<any>>();

  // ── L1: synchronous in-memory ──────────────────────────────────────────────

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.store.size > MAX_ENTRIES) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) { recordCacheMiss(); return undefined; }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      recordCacheMiss();
      return undefined;
    }
    recordCacheHit();
    return entry.value as T;
  }

  del(key: string): void {
    this.store.delete(key);
    // Fire-and-forget Redis delete so other replicas also lose the stale entry.
    redisDel(key).catch(() => {});
  }

  delByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
    // SCAN + DEL matching keys in Redis.
    redisDelByPattern(`${prefix}*`).catch(() => {});
  }

  size(): number {
    return this.store.size;
  }

  purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  // ── L2: Redis-aware async API ──────────────────────────────────────────────
  // Routes that can tolerate an async read should prefer these methods so all
  // autoscale replicas share the same warm cache instead of each building its own.

  async getAsync<T>(key: string): Promise<T | undefined> {
    // 1. Check L1 first — instant, no network.
    // Note: get() already records hit/miss for L1.
    const l1 = this.get<T>(key);
    if (l1 !== undefined) return l1;

    // 2. Miss on L1 — try Redis L2.
    const l2 = await redisGet<T>(key);
    if (l2 !== null && l2 !== undefined) {
      // Warm L1 so the next call on this replica is instant.
      // We don't know the original TTL precisely, so cap at max TTL (2 min).
      this.set(key, l2, TTL.BARCODE);
      recordCacheHit(); // L2 hit — correct the miss recorded by get() above
      return l2;
    }

    return undefined;
  }

  async setAsync<T>(key: string, value: T, ttlMs: number): Promise<void> {
    // Write to L1 (sync, instant for this replica).
    this.set(key, value, ttlMs);
    // Write to L2 (async, shared across all replicas).
    await redisSet(key, value, ttlMs);
  }
}

export const cache = new TtlCache();

// Proactively sweep expired entries every 5 minutes.
setInterval(() => cache.purgeExpired(), 5 * 60 * 1000).unref();

export const TTL = {
  PRODUCTS: 120_000,  // 2min — catalog changes only on admin edits
  SETTINGS: 120_000,  // 2min — rarely changes mid-shift
  BARCODE:  300_000,  // 5min — barcode→product mapping is very stable
  ANALYTICS: 90_000,  // 90s — analytics data is expensive to compute
} as const;

export function productsCacheKey(uid: string)  { return `products:${uid}`; }
export function settingsCacheKey(uid: string)   { return `settings:${uid}`; }
export function barcodeCacheKey(uid: string, barcode: string) { return `barcode:${uid}:${barcode}`; }
