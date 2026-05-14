/**
 * Production cluster entry point.
 *
 * Forks one worker per logical CPU core so Node.js fully utilises the host
 * machine — a single-process Node server can only use one core, leaving
 * the rest idle. Cluster mode is the single biggest throughput improvement
 * available for free without any infrastructure changes.
 *
 * Usage (production run command):
 *   node ./dist/cluster.cjs
 *
 * Environment overrides:
 *   CLUSTER_WORKERS=1  — disable clustering (single process, good for debugging)
 *   CLUSTER_WORKERS=4  — force exactly 4 workers regardless of CPU count
 *
 * Redis cache (L2) keeps all workers sharing the same warm cache, so a
 * product-list update on one worker is immediately visible on all others.
 * The in-process L1 cache on each worker stays consistent because cache
 * invalidation calls also write to Redis via redisDel().
 */

import cluster from "node:cluster";
import os from "node:os";

const PRODUCTION = process.env.NODE_ENV === "production";
const WORKERS_ENV = parseInt(process.env.CLUSTER_WORKERS ?? "0", 10);
const NUM_CPUS    = os.cpus().length;
const NUM_WORKERS = WORKERS_ENV > 0 ? WORKERS_ENV : NUM_CPUS;

if (PRODUCTION && cluster.isPrimary && NUM_WORKERS > 1) {
  const model = os.cpus()[0]?.model?.trim() ?? "unknown";
  console.log(
    `[cluster] Primary ${process.pid} — spawning ${NUM_WORKERS} workers` +
    ` (${NUM_CPUS} × ${model})`
  );

  for (let i = 0; i < NUM_WORKERS; i++) cluster.fork();

  cluster.on("online", (w) =>
    console.log(`[cluster] Worker ${w.process.pid} online`)
  );

  cluster.on("exit", (worker, code, signal) => {
    const reason = signal ?? `exit code ${code}`;
    console.warn(
      `[cluster] Worker ${worker.process.pid} died (${reason}) — restarting`
    );
    // Brief delay before restarting to prevent restart storms on init errors.
    setTimeout(() => cluster.fork(), 1_000);
  });
} else {
  // Worker process or dev/single-process mode — boot the actual server.
  if (!PRODUCTION && NUM_WORKERS > 1 && cluster.isPrimary) {
    console.log(
      `[cluster] Development mode — cluster disabled. ` +
      `Set NODE_ENV=production to enable ${NUM_WORKERS}-worker cluster.`
    );
  }
  // Dynamic import wrapped in .catch() — avoids top-level await so this file
  // is compatible with esbuild --format=cjs used in the production build.
  import("./index.js").catch((err: Error) => {
    console.error("[cluster] Failed to boot server:", err.message);
    process.exit(1);
  });
}
