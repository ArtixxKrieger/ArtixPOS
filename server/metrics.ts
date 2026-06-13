

import { redisGet, redisSet } from "./redis";

interface Bucket {
  requests: number;
  errors: number;
  cacheHits: number;
  cacheMisses: number;
  totalLatencyMs: number;
  latencySamples: number[];
}

const MAX_SAMPLES = 1_000;
const REDIS_KEY   = "metrics:lifetime";
const REDIS_TTL   = 365 * 24 * 60 * 60 * 1_000;

interface Lifetime {
  requests: number;
  errors: number;
  cacheHits: number;
  cacheMisses: number;
  totalLatencyMs: number;
}

let baseline: Lifetime = { requests: 0, errors: 0, cacheHits: 0, cacheMisses: 0, totalLatencyMs: 0 };
let baselineLoaded = false;

redisGet<Lifetime>(REDIS_KEY).then((saved) => {
  if (saved) {
    baseline = saved;
    console.log(
      `[metrics] Lifetime stats restored from Redis — ${saved.requests.toLocaleString()} total requests`
    );
  }
  baselineLoaded = true;
}).catch(() => { baselineLoaded = true; });

const session: Bucket = {
  requests: 0,
  errors: 0,
  cacheHits: 0,
  cacheMisses: 0,
  totalLatencyMs: 0,
  latencySamples: [],
};

const startedAt = Date.now();

export function recordRequest(durationMs: number, statusCode: number): void {
  session.requests++;
  session.totalLatencyMs += durationMs;
  if (statusCode >= 500) session.errors++;
  if (session.latencySamples.length >= MAX_SAMPLES) session.latencySamples.shift();
  session.latencySamples.push(durationMs);
}

export function recordCacheHit():  void { session.cacheHits++;   }
export function recordCacheMiss(): void { session.cacheMisses++; }

setInterval(async () => {
  try {
    const toSave: Lifetime = {
      requests:      baseline.requests      + session.requests,
      errors:        baseline.errors        + session.errors,
      cacheHits:     baseline.cacheHits     + session.cacheHits,
      cacheMisses:   baseline.cacheMisses   + session.cacheMisses,
      totalLatencyMs: baseline.totalLatencyMs + session.totalLatencyMs,
    };
    await redisSet(REDIS_KEY, toSave, REDIS_TTL);
  } catch {

  }
}, 60_000).unref();

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function getMetricsSnapshot() {
  const sorted = [...session.latencySamples].sort((a, b) => a - b);

  const totalRequests    = baseline.requests      + session.requests;
  const totalErrors      = baseline.errors        + session.errors;
  const totalCacheHits   = baseline.cacheHits     + session.cacheHits;
  const totalCacheMisses = baseline.cacheMisses   + session.cacheMisses;
  const totalLatency     = baseline.totalLatencyMs + session.totalLatencyMs;
  const totalCache       = totalCacheHits + totalCacheMisses;

  return {
    uptimeSec:        Math.floor((Date.now() - startedAt) / 1_000),
    baselineRestored: baselineLoaded,
    requests: {
      total:      totalRequests,
      session:    session.requests,
      errors5xx:  totalErrors,
      errorRate:  totalRequests > 0
        ? +((totalErrors / totalRequests) * 100).toFixed(2)
        : 0,
    },
    latency: {
      avgMs:  totalRequests > 0 ? +(totalLatency / totalRequests).toFixed(2) : 0,
      p50Ms:  percentile(sorted, 50),
      p95Ms:  percentile(sorted, 95),
      p99Ms:  percentile(sorted, 99),
      samples: sorted.length,
    },
    cache: {
      hits:    totalCacheHits,
      misses:  totalCacheMisses,
      total:   totalCache,
      hitRate: totalCache > 0
        ? +((totalCacheHits / totalCache) * 100).toFixed(2)
        : null,
    },
  };
}
