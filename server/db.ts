import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import os from "os";
import * as schema from "@shared/schema";
import { _tenantStore } from "./tenant-context";

const isServerless = !!process.env.VERCEL;
const isContainerPlatform =
  !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RENDER || !!process.env.FLY_APP_NAME;

// On serverless each instance handles 1 request at a time.
// On container platforms (Railway, Render, Fly.io) you scale by adding containers,
// not by forking workers — keep pool per-container reasonable.
const TOTAL_POOL = isServerless
  ? parseInt(process.env.DB_POOL_MAX ?? "3", 10)
  : isContainerPlatform
    ? parseInt(process.env.DB_POOL_MAX ?? "10", 10)
    : parseInt(process.env.DB_POOL_MAX ?? "20", 10);
const CLUSTER_WORKERS_ENV = parseInt(process.env.CLUSTER_WORKERS ?? "0", 10);
const EFFECTIVE_WORKERS =
  CLUSTER_WORKERS_ENV > 0
    ? CLUSTER_WORKERS_ENV
    : isContainerPlatform
      ? 1
      : process.env.NODE_ENV === "production"
        ? os.cpus().length
        : 1;
const POOL_MAX = Math.max(2, Math.floor(TOTAL_POOL / EFFECTIVE_WORKERS));

const connectionString =
  process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

const dbSslVerify = process.env.DB_SSL_VERIFY === "true";

export const pool = new Pool({
  connectionString,
  ssl:
    connectionString && !connectionString.includes("localhost")
      ? { rejectUnauthorized: dbSslVerify }
      : false,

  max: POOL_MAX,

  idleTimeoutMillis: isServerless ? 55_000 : 30_000,
  allowExitOnIdle: false,

  connectionTimeoutMillis: isServerless ? 10_000 : 15_000,
});

export const STATEMENT_TIMEOUT_MS = parseInt(process.env.DB_STATEMENT_TIMEOUT_MS ?? "15000", 10);
export const LOCK_TIMEOUT_MS = parseInt(process.env.DB_LOCK_TIMEOUT_MS ?? "5000", 10);

pool.on("error", (err: Error) => {
  console.error("[db] Unexpected pool client error:", err.message);
});

// Pre-warm the pool so the first request doesn't pay the TCP+TLS
// handshake cost. On Vercel serverless this is especially critical
// because cold starts have zero established connections.
pool
  .connect()
  .then((client: PoolClient) => {
    client.release();
  })
  .catch(() => {});

const _baseDb = drizzle(pool, { schema });

export const dbSystem: typeof _baseDb = _baseDb;

function savepointWrapBuilder(client: PoolClient, builder: unknown): unknown {
  if (!builder || typeof builder !== "object" || typeof (builder as any).then !== "function") {
    return builder;
  }

  return new Proxy(builder as object, {
    get(target: any, prop: string | symbol) {
      if (prop === "then") {
        return (onfulfilled?: unknown, onrejected?: unknown) => {
          const sp = `sp_${Math.random().toString(36).slice(2, 10)}`;
          const promise = client.query(`SAVEPOINT ${sp}`).then(async () => {
            try {
              const result = await new Promise<unknown>((resolve, reject) => {
                target.then(resolve, reject);
              });
              await client.query(`RELEASE SAVEPOINT ${sp}`).catch(() => {});
              return result;
            } catch (err: unknown) {
              const pg = err as any;

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

export const db = new Proxy(_baseDb, {
  get(target, prop: string | symbol) {
    const store = _tenantStore.getStore();
    const activeDb = store && store !== "admin" ? store.db : target;

    if (prop === "transaction" && store && store !== "admin") {
      const { client, db: tenantDb } = store;
      return async (callback: (tx: typeof tenantDb) => Promise<unknown>, _config?: unknown) => {
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
