import { AsyncLocalStorage } from "async_hooks";
import { Pool, PoolClient } from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import type { Request, Response, NextFunction } from "express";
import type { AuthUser } from "./middleware";

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
      } catch {
        try { await client.query("ROLLBACK"); } catch { /* best-effort */ }
      } finally {
        client.release();
      }
    };

    try {
      client = await pool.connect();
      await client.query("BEGIN");
      // Switch to the non-superuser app role so that FORCE ROW LEVEL SECURITY
      // and all RLS policies are actually enforced.  Postgres superusers
      // bypass RLS unconditionally; artixpos_app has NOBYPASSRLS so it does not.
      // SET LOCAL means the role reverts automatically at COMMIT / ROLLBACK.
      // Guard: artixpos_app may not exist on fresh databases where setupRLS
      // hasn't run yet (e.g. Vercel cold-start before first db:push). In that
      // case we skip the role switch and proceed without RLS enforcement so
      // the request still succeeds — this is safe because the app-level WHERE
      // clause on userId is always present.
      try {
        await client.query(`SET LOCAL ROLE artixpos_app`);
      } catch (roleErr: any) {
        if (roleErr?.message?.includes("artixpos_app")) {
          console.warn("[tenant-ctx] artixpos_app role not found — proceeding without RLS role switch");
        } else {
          throw roleErr;
        }
      }
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
