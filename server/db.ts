import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import os from "os";
import * as schema from "@shared/schema";
import { _tenantStore } from "./tenant-context";

const isServerless = !!process.env.VERCEL;

const TOTAL_POOL     = isServerless ? 5 : parseInt(process.env.DB_POOL_MAX ?? "20", 10);
const CLUSTER_WORKERS_ENV = parseInt(process.env.CLUSTER_WORKERS ?? "0", 10);
const EFFECTIVE_WORKERS   = CLUSTER_WORKERS_ENV > 0 ? CLUSTER_WORKERS_ENV
  : (process.env.NODE_ENV === "production" ? os.cpus().length : 1);
const POOL_MAX = Math.max(2, Math.floor(TOTAL_POOL / EFFECTIVE_WORKERS));

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_POOLER_URL ||
  process.env.SUPABASE_DATABASE_URL;

export const pool = new Pool({
  connectionString,
  ssl: connectionString && !connectionString.includes("localhost")
    ? { rejectUnauthorized: false }
    : false,

  max: POOL_MAX,

  idleTimeoutMillis: isServerless ? 10_000 : 30_000,

  connectionTimeoutMillis: 5_000,

  allowExitOnIdle: isServerless,
});

const STATEMENT_TIMEOUT_MS = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS ?? "15000", 10);
const LOCK_TIMEOUT_MS      = parseInt(process.env.DB_LOCK_TIMEOUT_MS      ?? "5000",  10);

pool.on("connect", (client) => {
  client.query(
    `SET statement_timeout = ${STATEMENT_TIMEOUT_MS}; SET lock_timeout = ${LOCK_TIMEOUT_MS};`
  ).catch((err) => {
    console.warn("[db] Could not set session timeouts:", err.message);
  });
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool client error:", err.message);
});

pool.connect()
  .then((client) => { client.release(); })
  .catch(() => {});

const _baseDb = drizzle(pool, { schema });

// ── RLS-aware DB proxy ────────────────────────────────────────────────────────
// When a request is running inside tenantContextMiddleware, _tenantStore holds
// a Drizzle instance backed by a dedicated connection that has:
//   BEGIN + SET LOCAL app.current_tenant = '<tenantId>'
//
// This Proxy transparently redirects ALL db.* calls to that tenant connection
// so RLS policies are enforced on every query — even if route code calls the
// global `db` import directly.
//
// Outside a tenant context (auth endpoints, startup, runAsAdmin) the proxy
// falls through to the global connection pool.
export const db = new Proxy(_baseDb, {
  get(target, prop: string | symbol) {
    const store = _tenantStore.getStore();
    const activeDb = (store && store !== "admin") ? store.db : target;
    const value = Reflect.get(activeDb, prop, activeDb);
    return typeof value === "function" ? value.bind(activeDb) : value;
  },
}) as typeof _baseDb;
