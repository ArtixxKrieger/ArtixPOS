// ── In-process metrics collector ──────────────────────────────────────────────
// Lightweight, zero-dependency stats tracker. Resets on process restart.
// Exposed at GET /api/metrics for external monitoring panels.

interface Bucket {
  requests: number;
  errors: number;       // 5xx responses
  cacheHits: number;
  cacheMisses: number;
  totalLatencyMs: number;
  latencySamples: number[];  // last N samples for percentile calculation
}

const MAX_SAMPLES = 1_000; // rolling window size for latency percentiles

const bucket: Bucket = {
  requests: 0,
  errors: 0,
  cacheHits: 0,
  cacheMisses: 0,
  totalLatencyMs: 0,
  latencySamples: [],
};

const startedAt = Date.now();

// ── Writers (called from middleware / cache) ───────────────────────────────────

export function recordRequest(durationMs: number, statusCode: number): void {
  bucket.requests++;
  bucket.totalLatencyMs += durationMs;
  if (statusCode >= 500) bucket.errors++;

  // Keep only the last MAX_SAMPLES values (circular push).
  if (bucket.latencySamples.length >= MAX_SAMPLES) {
    bucket.latencySamples.shift();
  }
  bucket.latencySamples.push(durationMs);
}

export function recordCacheHit(): void  { bucket.cacheHits++;   }
export function recordCacheMiss(): void { bucket.cacheMisses++; }

// ── Percentile helper ──────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Snapshot (called by /api/metrics route) ────────────────────────────────────

export function getMetricsSnapshot() {
  const sorted = [...bucket.latencySamples].sort((a, b) => a - b);
  const total  = bucket.cacheHits + bucket.cacheMisses;

  return {
    uptimeSec:     Math.floor((Date.now() - startedAt) / 1_000),
    requests: {
      total:        bucket.requests,
      errors5xx:    bucket.errors,
      errorRate:    bucket.requests > 0
        ? +((bucket.errors / bucket.requests) * 100).toFixed(2)
        : 0,
    },
    latency: {
      avgMs:  bucket.requests > 0
        ? +(bucket.totalLatencyMs / bucket.requests).toFixed(2)
        : 0,
      p50Ms:  percentile(sorted, 50),
      p95Ms:  percentile(sorted, 95),
      p99Ms:  percentile(sorted, 99),
      samples: sorted.length,
    },
    cache: {
      hits:     bucket.cacheHits,
      misses:   bucket.cacheMisses,
      total,
      hitRate:  total > 0
        ? +((bucket.cacheHits / total) * 100).toFixed(2)
        : null,
    },
  };
}
