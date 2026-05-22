import { AsyncLocalStorage } from "async_hooks";
import { Pool, PoolClient } from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import type { Request, Response, NextFunction } from "express";
import type { AuthUser } from "./middleware";
import { STATEMENT_TIMEOUT_MS, LOCK_TIMEOUT_MS } from "./db";

type TenantStore = {
  tenantId: string;
  db: NodePgDatabase<typeof schema>;
  client: PoolClient;
};

// AsyncLocalStorage holds the per-request tenant context.
// Any code running within a tenantContextMiddleware-wrapped request
// will find the tenant-scoped DB here.
export const _tenantStore = new AsyncLocalStorage<TenantStore | "admin">();

/**
 * Returns the tenant-scoped Drizzle instance if we are inside a tenant
 * request context, otherwise returns the provided fallback (global pool).
 */
export function getTenantDb(
  fallback: NodePgDatabase<typeof schema>
): NodePgDatabase<typeof schema> {
  const store = _tenantStore.getStore();
  if (store && store !== "admin") return store.db;
  return fallback;
}

/**
 * Express middleware — must be placed after jwtAuthMiddleware.
 *
 * For every authenticated request that has a tenantId:
 *  1. Checks out a dedicated DB connection from the pool
 *  2. Opens a transaction and sets SET LOCAL app.current_tenant = ?
 *     (SET LOCAL reverts automatically when the transaction ends)
 *  3. Stores a Drizzle instance backed by that connection in AsyncLocalStorage
 *  4. Commits / releases on response finish or close
 *
 * All db.* calls within the request handler automatically route through
 * this connection (via the Proxy in server/db.ts), so RLS policies see
 * the correct tenant ID on every query.
 */
export function tenantContextMiddleware(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as AuthUser | undefined;
    if (!user?.tenantId) return next();

    let client: PoolClient | null = null;
    let settled = false;

    const cleanup = async () => {
      if (settled || !client) return;
      settled = true;
      try {
        await client.query("COMMIT");
        client.release();
      } catch (commitErr) {
        // COMMIT failed — the transaction is in an aborted state.
        // Best-effort ROLLBACK, then ALWAYS destroy the connection so it is
        // never returned to the pool in a dirty state.  Passing an Error to
        // release() tells node-postgres to discard this connection entirely
        // instead of recycling it, which prevents the next pool.query() caller
        // from receiving a connection whose transaction is still "aborted"
        // (pg error code 25P02).
        console.error("[tenant-ctx] COMMIT failed — rolling back and destroying connection:", commitErr);
        try {
          await client.query("ROLLBACK");
        } catch (rbErr) {
          console.error("[tenant-ctx] ROLLBACK also failed:", rbErr);
        }
        // Destroy regardless of whether ROLLBACK succeeded.
        client.release(commitErr instanceof Error ? commitErr : new Error(String(commitErr)));
      }
    };

    try {
      client = await pool.connect();
      await client.query("BEGIN");
      // Switch to the non-superuser app role so that FORCE ROW LEVEL SECURITY
      // and all RLS policies are actually enforced.  Postgres superusers
      // bypass RLS unconditionally; artixpos_app has NOBYPASSRLS so it does not.
      // SET LOCAL means the role reverts automatically at COMMIT / ROLLBACK.
      //
      // CRITICAL: We wrap the SET LOCAL ROLE in a SAVEPOINT because in PostgreSQL
      // ANY error inside an open transaction — even a caught one — marks the entire
      // transaction as ABORTED.  Without the savepoint, a "permission denied to set
      // role" failure catches cleanly in JS but leaves the connection in the aborted
      // state, causing every subsequent query to fail with 25P02 ("current transaction
      // is aborted").  Rolling back to the savepoint restores a live transaction.
      await client.query("SAVEPOINT before_role_switch");
      try {
        await client.query(`SET LOCAL ROLE artixpos_app`);
        await client.query("RELEASE SAVEPOINT before_role_switch");
      } catch (roleErr: any) {
        // Roll back to savepoint so the transaction is still alive — then continue
        // without the role switch.  Without this rollback the next query would fail
        // with 25P02 regardless of whether the role error was "expected" or not.
        try { await client.query("ROLLBACK TO SAVEPOINT before_role_switch"); } catch {}
        console.warn("[tenant-ctx] SET LOCAL ROLE artixpos_app failed — proceeding without RLS role switch:", (roleErr as any)?.message);
      }
      await client.query(
        `SELECT set_config('app.current_tenant', $1, TRUE)`,
        [user.tenantId]
      );

      // Apply query timeouts as SET LOCAL so they are scoped to this transaction
      // and automatically revert on COMMIT / ROLLBACK.  This is the only reliable
      // way to enforce timeouts on Supabase's PgBouncer transaction-mode pooler
      // (port 6543): session-level SET commands set at pool.connect() time do NOT
      // persist because each transaction may be assigned a different backend
      // connection by PgBouncer.
      await client.query(
        `SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}; SET LOCAL lock_timeout = ${LOCK_TIMEOUT_MS};`
      );

      const tenantDb = drizzle(client, { schema });

      res.on("finish", cleanup);
      res.on("close", cleanup);

      _tenantStore.run({ tenantId: user.tenantId, db: tenantDb, client }, next);
    } catch (err) {
      if (client && !settled) {
        settled = true;
        try { await client.query("ROLLBACK"); } catch { /* best-effort */ }
        client.release();
      }
      next(err);
    }
  };
}

/**
 * Runs a callback with RLS bypassed (SET LOCAL row_security = off).
 * Use for platform-level admin operations that must query across tenants,
 * or for auth operations that run before tenant context is established.
 *
 * The callback receives an adminDb Drizzle instance backed by a dedicated
 * connection that has row_security disabled for the duration of the call.
 */
export async function runAsAdmin<T>(
  pool: Pool,
  fn: (adminDb: NodePgDatabase<typeof schema>) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL row_security = off");
    const adminDb = drizzle(client, { schema });
    const result = await _tenantStore.run("admin", () => fn(adminDb));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* best-effort */ }
    throw err;
  } finally {
    client.release();
  }
}
