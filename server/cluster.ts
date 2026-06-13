

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

    setTimeout(() => cluster.fork(), 1_000);
  });
} else {

  if (!PRODUCTION && NUM_WORKERS > 1 && cluster.isPrimary) {
    console.log(
      `[cluster] Development mode — cluster disabled. ` +
      `Set NODE_ENV=production to enable ${NUM_WORKERS}-worker cluster.`
    );
  }

import("./index.js").catch((err: Error) => {
    console.error("[cluster] Failed to boot server:", err.message);
    process.exit(1);
  });
}
