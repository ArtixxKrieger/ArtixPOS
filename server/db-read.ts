import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import { _tenantStore } from "./tenant-context";
import { db } from "./db";

const READ_URL = process.env.DATABASE_READ_URL || process.env.SUPABASE_READ_URL || null;

const isServerless = !!process.env.VERCEL;
const isContainerPlatform =
  !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RENDER || !!process.env.FLY_APP_NAME;

let _baseDbRead: typeof db;

if (READ_URL) {
  const dbSslVerify = process.env.DB_SSL_VERIFY === "true";
  const readPool = new Pool({
    connectionString: READ_URL,
    ssl: { rejectUnauthorized: dbSslVerify },
    max: isServerless ? 15 : parseInt(process.env.DB_READ_POOL_MAX ?? "10", 10),
    idleTimeoutMillis: isServerless ? 55_000 : 30_000,
    connectionTimeoutMillis: isServerless ? 4_000 : 5_000,
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

export const dbRead = new Proxy(_baseDbRead, {
  get(target, prop: string | symbol) {
    const store = _tenantStore.getStore();
    const activeDb = store && store !== "admin" ? store.db : target;
    const value = Reflect.get(activeDb, prop, activeDb);
    return typeof value === "function" ? value.bind(activeDb) : value;
  },
}) as typeof _baseDbRead;
