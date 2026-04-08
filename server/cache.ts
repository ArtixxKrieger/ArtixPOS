type Entry<T> = { value: T; expiresAt: number };

class TtlCache {
  private store = new Map<string, Entry<any>>();

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
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
}

export const cache = new TtlCache();

export const TTL = {
  PRODUCTS: 30_000,   // 30s — catalog changes only on admin edits
  SETTINGS: 60_000,   // 60s — rarely changes mid-shift
  BARCODE:  120_000,  // 2min — barcode→product mapping is very stable
} as const;

export function productsCacheKey(uid: string)  { return `products:${uid}`; }
export function settingsCacheKey(uid: string)   { return `settings:${uid}`; }
export function barcodeCacheKey(uid: string, barcode: string) { return `barcode:${uid}:${barcode}`; }
