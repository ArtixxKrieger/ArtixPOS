import { redisGet, redisSet, redisDel, redisDelByPattern, redisAvailable } from "./redis";
import { recordCacheHit, recordCacheMiss } from "./metrics";

const MAX_ENTRIES = 5_000;

type Entry<T> = { value: T; expiresAt: number };

class TtlCache {
  private store = new Map<string, Entry<any>>();

  private inflight = new Map<string, Promise<any>>();

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (this.store.size > MAX_ENTRIES) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      recordCacheMiss();
      return undefined;
    }
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

    redisDel(key).catch(() => {});
  }

  delByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }

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

  async getOrFetch<T>(key: string, fetchFn: () => Promise<T>, ttlMs: number): Promise<T> {
    const l1 = this.get<T>(key);
    if (l1 !== undefined) return l1;

    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise: Promise<T> = (async () => {
      try {
        if (redisAvailable) {
          const l2 = await redisGet<T>(key);
          if (l2 !== null && l2 !== undefined) {
            this.set(key, l2, ttlMs);
            recordCacheHit();
            return l2;
          }
        }

        const value = await fetchFn();
        await this.setAsync(key, value, ttlMs);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  async getAsync<T>(key: string, ttlMs: number = TTL.BARCODE): Promise<T | undefined> {
    if (!redisAvailable) return this.get<T>(key);
    const l1 = this.get<T>(key);
    if (l1 !== undefined) return l1;
    const l2 = await redisGet<T>(key);
    if (l2 !== null && l2 !== undefined) {
      this.set(key, l2, ttlMs);
      recordCacheHit();
      return l2;
    }
    return undefined;
  }

  async setAsync<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.set(key, value, ttlMs);

    if (!redisAvailable) return;

    await redisSet(key, value, ttlMs);
  }
}

export const cache = new TtlCache();

setInterval(() => cache.purgeExpired(), 5 * 60 * 1000).unref();

export const TTL = {
  PRODUCTS: 120_000,
  SETTINGS: 120_000,
  BARCODE: 300_000,
  ANALYTICS: 90_000,
} as const;

export function productsCacheKey(uid: string) {
  return `products:${uid}`;
}
export function settingsCacheKey(uid: string) {
  return `settings:${uid}`;
}
export function barcodeCacheKey(uid: string, barcode: string) {
  return `barcode:${uid}:${barcode}`;
}
export function dashboardCacheKey(uid: string, bid: number | null) {
  return `dashboard:${uid}:${bid ?? "all"}`;
}
export function customersCacheKey(uid: string) {
  return `customers:${uid}`;
}
export function notificationsCacheKey(uid: string) {
  return `notifications:${uid}`;
}
export function suppliersCacheKey(uid: string) {
  return `suppliers:${uid}`;
}
export function tablesCacheKey(uid: string) {
  return `tables:${uid}`;
}
export function salesCacheKey(uid: string, bid: number | null, tag: string) {
  return `sales:${uid}:${bid ?? "all"}:${tag}`;
}
