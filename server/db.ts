import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "@shared/schema";

type DB = LibSQLDatabase<typeof schema>;

let _db: DB | null = null;

function createDb(): DB {
  if (_db) return _db;

  const url = process.env.TURSO_DATABASE_URL;

  if (!url) {
    if (process.env.VERCEL === "1") {
      // On Vercel, file-based/in-memory SQLite requires WASM which @vercel/node
      // doesn't bundle. A remote Turso database is required.
      throw new Error(
        "TURSO_DATABASE_URL is not set. " +
        "On Vercel you must use a remote Turso database — " +
        "create one at https://turso.tech and add TURSO_DATABASE_URL + TURSO_AUTH_TOKEN to your Vercel environment variables."
      );
    }
    // Local dev: use a file-based SQLite database (WASM works fine here)
    const client = createClient({ url: "file:local.db" });
    _db = drizzle(client, { schema });
    return _db;
  }

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  _db = drizzle(client, { schema });
  return _db;
}

// Lazy proxy — module loads immediately; DB is only created on first query.
// This prevents WASM-load crashes at module initialization on Vercel.
export const db = new Proxy({} as DB, {
  get(_target, prop: string | symbol) {
    return (createDb() as any)[prop];
  },
});
