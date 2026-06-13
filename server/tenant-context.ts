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

export const _tenantStore = new AsyncLocalStorage<TenantStore | "admin">();

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

console.error("[tenant-ctx] COMMIT failed — rolling back and destroying connection:", commitErr);
        try {
          await client.query("ROLLBACK");
        } catch (rbErr) {
          console.error("[tenant-ctx] ROLLBACK also failed:", rbErr);
        }

        client.release(commitErr instanceof Error ? commitErr : new Error(String(commitErr)));
      }
    };

    try {

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
        try { await client.query("ROLLBACK"); } catch {  }
        client.release();
      }
      next(err);
    }
  };
}

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
    try { await client.query("ROLLBACK"); } catch {  }
    throw err;
  } finally {
    client.release();
  }
}
