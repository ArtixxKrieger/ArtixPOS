import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import os from "os";
import * as schema from "@shared/schema";
import { _tenantStore } from "./tenant-context";

const isServerless = !!process.env.VERCEL;

// On Vercel, page-load fires many concurrent requests (auth, products, settings,
// pending-orders, notifications, dashboard…).  Each one holds a dedicated pool
// connection for its entire lifecycle via tenantContextMiddleware.  A pool of 5
// was exhausted by the first page-load burst, causing "timeout exceeded" errors
// for subsequent requests (e.g. creating a product).  Raise to 15 so the burst
// is absorbed without queuing.  The DB connection limit on Supabase free tier is
// 60; 15 per Vercel instance leaves plenty of headroom for multiple warm instances.
const TOTAL_POOL     = isServerless ? 15 : parseInt(process.env.DB_POOL_MAX ?? "20", 10);
const CLUSTER_WORKERS_ENV = parseInt(process.env.CLUSTER_WORKERS ?? "0", 10);
const EFFECTIVE_WORKERS   = CLUSTER_WORKERS_ENV > 0 ? CLUSTER_WORKERS_ENV
  : (process.env.NODE_ENV === "production" ? os.cpus().length : 1);
const POOL_MAX = Math.max(2, Math.floor(TOTAL_POOL / EFFECTIVE_WORKERS));

const connectionString =
  process.env.SUPABASE_POOLER_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
  ssl: connectionString && !connectionString.includes("localhost")
    ? { rejectUnauthorized: false }
    : false,

  max: POOL_MAX,

  // Keep connections alive for 55 s on Vercel so warm function instances
  // reuse existing connections between requests instead of re-establishing
  // each time. allowExitOnIdle:false lets the pool hold connections open;
  // Vercel manages the function lifecycle independently.
  idleTimeoutMillis: isServerless ? 55_000 : 30_000,
  allowExitOnIdle: false,

  // 4 s on Vercel — fail fast so the server-side retry (below, in
  // tenant-context.ts) kicks in quickly rather than making the user wait
  // 15 s before the client-side retry fires.
  connectionTimeoutMillis: isServerless ? 4_000 : 15_000,
});

export const STATEMENT_TIMEOUT_MS = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS ?? "15000", 10);
export const LOCK_TIMEOUT_MS      = parseInt(process.env.DB_LOCK_TIMEOUT_MS      ?? "5000",  10);

// NOTE: We intentionally do NOT set statement_timeout / lock_timeout here via
// pool.on("connect").  On Supabase's PgBouncer transaction-mode pooler (port
// 6543) each pool.query() may land on a different server connection, so
// session-level SET commands set at connect time do not persist.  Instead,
// tenantContextMiddleware sets them via SET LOCAL inside every tenant
// transaction, where they are guaranteed to apply and automatically revert on
// COMMIT / ROLLBACK.  For dbSystem (bypass) queries Supabase's own idle
// timeouts provide a safety net.

pool.on("error", (err: Error) => {
  console.error("[db] Unexpected pool client error:", err.message);
});

pool.connect()
  .then((client: PoolClient) => { client.release(); })
  .catch(() => {});

const _baseDb = drizzle(pool, { schema });

// ── System / bypass DB ────────────────────────────────────────────────────────
// Runs as the pool owner (postgres / superuser, BYPASSRLS) and NEVER routes
// through the tenant-scoped proxy.  Use ONLY for operations where the
// application-level WHERE clause is the security boundary (e.g. user_settings
// keyed by userId) and tenant-context RLS would cause false-negative reads.
export const dbSystem: typeof _baseDb = _baseDb;

// ── Auto-SAVEPOINT wrapper ────────────────────────────────────────────────────
// Wraps a Drizzle query builder (any thenable returned by select/insert/update/
// delete/execute) so that its execution is bracketed by a PostgreSQL SAVEPOINT.
//
// Why this matters:
//   PostgreSQL marks a transaction "aborted" the moment any query inside it
//   throws an error. Every subsequent query on the SAME connection then fails
//   with "current transaction is aborted, commands ignored until end of
//   transaction block" — masking the real error with a confusing cascade.
//
//   By wrapping each individual query in a SAVEPOINT we get:
//     • A failed query rolls back only to its savepoint — the outer transaction
//       stays alive and subsequent queries work normally.
//     • The real error is thrown and logged at the site of the actual failure,
//       not buried under the cascade message.
//     • Explicit db.transaction() calls keep their own dedicated savepoint
//       (handled separately below) — no double-wrapping occurs.
function savepointWrapBuilder(client: PoolClient, builder: unknown): unknown {
  if (!builder || typeof builder !== "object" || typeof (builder as any).then !== "function") {
    return builder;
  }

  return new Proxy(builder as object, {
    get(target: any, prop: string | symbol) {
      // Intercept Promise resolution — this is the moment the query executes.
      if (prop === "then") {
        return (onfulfilled?: unknown, onrejected?: unknown) => {
          const sp = `sp_${Math.random().toString(36).slice(2, 10)}`;
          const promise = client.query(`SAVEPOINT ${sp}`)
            .then(async () => {
              try {
                const result = await new Promise<unknown>((resolve, reject) => {
                  target.then(resolve, reject);
                });
                await client.query(`RELEASE SAVEPOINT ${sp}`).catch(() => {});
                return result;
              } catch (err: unknown) {
                const pg = err as any;
                // 25P02 = "in_failed_sql_transaction" — this is the cascade symptom.
                // Log it distinctly so the real cause (logged above) is easy to find.
                if (pg?.code === "25P02") {
                  console.error(
                    "[db] Cascading transaction-aborted error suppressed — see the real error logged above.",
                    { code: pg.code, hint: pg.hint ?? "" },
                  );
                } else {
                  console.error("[db] Query failed inside tenant transaction:", {
                    code: pg?.code,
                    message: pg?.message,
                    detail: pg?.detail,
                    hint: pg?.hint,
                    table: pg?.table,
                    constraint: pg?.constraint,
                  });
                }
                await client.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {});
                throw err;
              }
            });
          return promise.then(
            onfulfilled as ((value: unknown) => unknown) | undefined,
            onrejected as ((reason: unknown) => unknown) | undefined,
          );
        };
      }

      // Builder chain methods (.where, .limit, .returning, …) return new builders —
      // propagate SAVEPOINT protection down the chain.
      const val = Reflect.get(target, prop, target);
      if (typeof val === "function") {
        return (...args: unknown[]) => {
          const result = val.apply(target, args);
          return savepointWrapBuilder(client, result);
        };
      }
      return val;
    },
  });
}

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

    // ── SAVEPOINT shim for explicit db.transaction() calls ────────────────────
    // If route code calls db.transaction() while we are already inside the
    // per-request tenant transaction, issuing a second BEGIN would silently
    // continue the existing transaction and then COMMIT it prematurely when the
    // inner callback finishes — destroying the SET LOCAL app.current_tenant
    // setting for all subsequent queries in the same request.
    //
    // Instead, we use PostgreSQL SAVEPOINTs, which give proper rollback
    // semantics without touching the outer transaction.
    if (prop === "transaction" && store && store !== "admin") {
      const { client, db: tenantDb } = store;
      return async (
        callback: (tx: typeof tenantDb) => Promise<unknown>,
        _config?: unknown,
      ) => {
        const sp = `sp_${Math.random().toString(36).slice(2, 10)}`;
        await client.query(`SAVEPOINT ${sp}`);
        try {
          const result = await callback(tenantDb);
          await client.query(`RELEASE SAVEPOINT ${sp}`);
          return result;
        } catch (err) {
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`).catch(() => {});
          throw err;
        }
      };
    }

    const value = Reflect.get(activeDb, prop, activeDb);
    if (typeof value !== "function") return value;

    // ── Auto-SAVEPOINT for every individual query in tenant context ───────────
    // Wrap each query builder so a single failed query cannot poison the rest
    // of the request transaction. See savepointWrapBuilder() above for details.
    if (store && store !== "admin" && prop !== "transaction") {
      const { client } = store;
      return function (this: unknown, ...args: unknown[]) {
        const result = (value as (...a: unknown[]) => unknown).apply(activeDb, args);
        return savepointWrapBuilder(client, result);
      };
    }

    return value.bind(activeDb);
  },
}) as typeof _baseDb;
