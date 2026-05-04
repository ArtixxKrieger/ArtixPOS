// ── Read Replica Connection ────────────────────────────────────────────────────
// When DATABASE_READ_URL or SUPABASE_READ_URL is set (e.g. a Supabase read
// replica), all read-only queries route here instead of the primary DB.
// This offloads analytics and list queries, leaving the primary pool free
// for writes — the single biggest DB scalability win.
//
// If neither env var is set, this module re-exports the primary DB instance
// so existing code works without any changes.

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import { db } from "./db";

const READ_URL =
  process.env.DATABASE_READ_URL   ||
  process.env.SUPABASE_READ_URL   ||
  null; // explicit null — falls through to primary below

const isServerless = !!process.env.VERCEL;

let _dbRead: typeof db;

if (READ_URL) {
  const readPool = new Pool({
    connectionString: READ_URL,
    ssl: { rejectUnauthorized: false },
    max: isServerless ? 5 : parseInt(process.env.DB_READ_POOL_MAX ?? "10", 10),
    idleTimeoutMillis:     isServerless ? 10_000 : 30_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: isServerless,
  });

  readPool.on("error", (err) => {
    console.error("[db-read] Unexpected pool error:", err.message);
  });

  _dbRead = drizzle(readPool, { schema });
  console.log("[db-read] Read replica connected ✓ (offloading SELECT queries)");
} else {
  // No read replica configured — fall through to primary.
  // Zero performance penalty; upgrade path requires only setting the env var.
  _dbRead = db;
  if (process.env.NODE_ENV !== "test") {
    console.info("[db-read] No DATABASE_READ_URL set — using primary DB for reads");
  }
}

export const dbRead = _dbRead;
