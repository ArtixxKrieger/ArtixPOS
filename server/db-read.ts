import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import { _tenantStore } from "./tenant-context";
import { db } from "./db";

const READ_URL =
  process.env.DATABASE_READ_URL   ||
  process.env.SUPABASE_READ_URL   ||
  null;

const isServerless = !!process.env.VERCEL;

let _baseDbRead: typeof db;

if (READ_URL) {
  const readPool = new Pool({
    connectionString: READ_URL,
    ssl: { rejectUnauthorized: false },
    max: isServerless ? 15 : parseInt(process.env.DB_READ_POOL_MAX ?? "10", 10),
    idleTimeoutMillis:       isServerless ? 55_000 : 30_000,
    connectionTimeoutMillis: isServerless ?  4_000 :  5_000,
    allowExitOnIdle: false,
  });

  readPool.on("error", (err: Error) => {
    console.error("[db-read] Unexpected pool error:", err.message);
  });

  _baseDbRead = drizzle(readPool, { schema });
  console.log("[db-read] Read replica connected ✓ (offloading SELECT queries)");
} else {
  _baseDbRead = db;
  if (process.env.NODE_ENV !== "test") {
    console.info("[db-read] No DATABASE_READ_URL set — using primary DB for reads");
  }
}

// ── RLS-aware read proxy ──────────────────────────────────────────────────────
// When a tenant context is active we route reads through the same
// per-request connection that has SET LOCAL app.current_tenant set.
// This ensures RLS policies are enforced on read-replica queries too.
export const dbRead = new Proxy(_baseDbRead, {
  get(target, prop: string | symbol) {
    const store = _tenantStore.getStore();
    const activeDb = (store && store !== "admin") ? store.db : target;
    const value = Reflect.get(activeDb, prop, activeDb);
    return typeof value === "function" ? value.bind(activeDb) : value;
  },
}) as typeof _baseDbRead;
