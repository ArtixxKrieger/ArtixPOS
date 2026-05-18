import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import os from "os";
import * as schema from "@shared/schema";

const isServerless = !!process.env.VERCEL;

// Total DB connection budget across ALL workers.
// In cluster mode (N forks) each worker gets budget ÷ N connections so the
// grand total never exceeds DB_POOL_MAX regardless of how many cores are used.
//
// Example: DB_POOL_MAX=20, 4-core production cluster → 5 per worker = 20 total.
// Example: DB_POOL_MAX=20, dev (1 process)           → 20 per worker = 20 total.
//
// Override DB_POOL_MAX to raise the total budget (e.g. 40 on a dedicated DB).
// Override CLUSTER_WORKERS to tell each worker how many siblings exist.
const TOTAL_POOL     = isServerless ? 5 : parseInt(process.env.DB_POOL_MAX ?? "20", 10);
const CLUSTER_WORKERS_ENV = parseInt(process.env.CLUSTER_WORKERS ?? "0", 10);
const EFFECTIVE_WORKERS   = CLUSTER_WORKERS_ENV > 0 ? CLUSTER_WORKERS_ENV
  : (process.env.NODE_ENV === "production" ? os.cpus().length : 1);
const POOL_MAX = Math.max(2, Math.floor(TOTAL_POOL / EFFECTIVE_WORKERS));

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_POOLER_URL ||
  process.env.SUPABASE_DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: connectionString && !connectionString.includes("localhost")
    ? { rejectUnauthorized: false }
    : false,

  max: POOL_MAX,

  // Idle connections released after 30s (10s serverless) so replicas don't
  // hold slots they're not using.
  idleTimeoutMillis: isServerless ? 10_000 : 30_000,

  // Fail fast rather than queue requests indefinitely.
  connectionTimeoutMillis: 5_000,

  allowExitOnIdle: isServerless,
});

// ── PostgreSQL session-level timeouts ─────────────────────────────────────────
// Set per-connection so they apply regardless of how Drizzle issues queries.
//
// statement_timeout  — kills any single query that runs longer than N ms.
//                      Prevents a missing index or lock contention from holding
//                      a pool slot indefinitely and starving other requests.
//                      Default: 15 s. Override with DB_STATEMENT_TIMEOUT_MS.
//
// lock_timeout       — fails fast if a query waits more than N ms to acquire
//                      a lock (e.g. concurrent UPDATE on same row). Avoids
//                      cascading pile-up of waiting connections.
//                      Default: 5 s. Override with DB_LOCK_TIMEOUT_MS.
const STATEMENT_TIMEOUT_MS = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS ?? "15000", 10);
const LOCK_TIMEOUT_MS      = parseInt(process.env.DB_LOCK_TIMEOUT_MS      ?? "5000",  10);

pool.on("connect", (client) => {
  client.query(
    `SET statement_timeout = ${STATEMENT_TIMEOUT_MS}; SET lock_timeout = ${LOCK_TIMEOUT_MS};`
  ).catch((err) => {
    console.warn("[db] Could not set session timeouts:", err.message);
  });
});

// Log pool errors so they surface in structured logs instead of crashing.
pool.on("error", (err) => {
  console.error("[db] Unexpected pool client error:", err.message);
});

// Pre-warm the pool on startup so the first real query doesn't pay the
// connection-setup cost (~80-120 ms). Fire-and-forget — never blocks boot.
pool.connect()
  .then((client) => { client.release(); })
  .catch(() => {});

export const db = drizzle(pool, { schema });
export { pool };
