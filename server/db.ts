import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const isServerless = !!process.env.VERCEL;

// Per-instance connection limit. Each autoscaled replica gets its own pool,
// so keep this low enough that N replicas don't exhaust the DB server limit.
// Default: 10 per instance. Override with DB_POOL_MAX env var.
const POOL_MAX = isServerless ? 5 : parseInt(process.env.DB_POOL_MAX ?? "10", 10);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
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
