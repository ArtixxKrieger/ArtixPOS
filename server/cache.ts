const MAX_ENTRIES = 5_000; // prevent unbounded growth under high tenant load

type Entry<T> = { value: T; expiresAt: number };

class TtlCache {
  private store = new Map<string, Entry<any>>();

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    // Evict oldest entry when the map exceeds the cap.
    if (this.store.size > MAX_ENTRIES) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  del(key: string): void {
    this.store.delete(key);
  }

  delByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  size(): number {
    return this.store.size;
  }

  /** Purge all entries whose TTL has elapsed. Called periodically. */
  purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
}

export const cache = new TtlCache();

// Proactively sweep expired entries every 5 minutes so stale data
// does not accumulate in memory between reads.
setInterval(() => cache.purgeExpired(), 5 * 60 * 1000).unref();

export const TTL = {
  PRODUCTS: 30_000,   // 30s — catalog changes only on admin edits
  SETTINGS: 60_000,   // 60s — rarely changes mid-shift
  BARCODE:  120_000,  // 2min — barcode→product mapping is very stable
} as const;

export function productsCacheKey(uid: string)  { return `products:${uid}`; }
export function settingsCacheKey(uid: string)   { return `settings:${uid}`; }
export function barcodeCacheKey(uid: string, barcode: string) { return `barcode:${uid}:${barcode}`; }
