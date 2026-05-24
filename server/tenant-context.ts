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
      // Retry once on connection timeout — page-load bursts can briefly exhaust
      // the pool; a short wait lets a concurrent request release its connection.
      try {
        client = await pool.connect();
      } catch (firstErr: any) {
        const msg: string = firstErr?.message ?? "";
        if (msg.includes("timeout exceeded") || msg.includes("connection timeout")) {
          await new Promise<void>((r) => setTimeout(r, 500));
          client = await pool.connect();
        } else {
          throw firstErr;
        }
      }

      // ── 2 round-trips instead of 6 ────────────────────────────────────────
      //
      // Previously this middleware made 6 sequential DB round-trips:
      //   BEGIN → SAVEPOINT → SET LOCAL ROLE → RELEASE SAVEPOINT →
      //   set_config → SET LOCAL timeouts
      // At ~100-150 ms per trip (Vercel US ↔ remote DB), that was 600-900 ms
      // of pure overhead before any route handler ran.
      //
      // Now:
      //   Round-trip 1 — BEGIN + role switch (via DO block, no savepoint
      //                  needed because PL/pgSQL exception handlers keep the
      //                  transaction alive) + timeout SETs, all in one call.
      //   Round-trip 2 — set_config with parameterised tenant ID (pg extended
      //                  query protocol only supports one stmt with params).
      //
      // The DO block replaces the SAVEPOINT pattern: PL/pgSQL's EXCEPTION
      // clause catches the "permission denied to set role" error internally and
      // never propagates it to the transaction, so the transaction stays live
      // regardless of whether the role exists on this DB.
      await client.query(
        `BEGIN;
         DO $$
         BEGIN
           SET LOCAL ROLE artixpos_app;
         EXCEPTION WHEN OTHERS THEN
           NULL;
         END;
         $$;
         SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS};
         SET LOCAL lock_timeout = ${LOCK_TIMEOUT_MS};`
      );

      // Round-trip 2: set_config requires a parameter ($1) so it must be a
      // separate call (pg extended query protocol = single statement only).
      await client.query(
        `SELECT set_config('app.current_tenant', $1, TRUE)`,
        [user.tenantId]
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
