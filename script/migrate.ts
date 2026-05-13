/**
 * Production-safe migration runner.
 *
 * Run with:  npx tsx script/migrate.ts
 *
 * Handles the "existing database" case (previously managed with db:push) by
 * baselining the initial migration snapshot without executing it — identical
 * to Flyway's baseline concept.  All subsequent migration files are applied
 * normally via Drizzle's migrator.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[migrate] ✗ FATAL: DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: !DATABASE_URL.includes("localhost") ? { rejectUnauthorized: false } : false,
  max: 1,
  connectionTimeoutMillis: 10_000,
});

const db = drizzle(pool);
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "migrations");

async function baseline(client: any): Promise<void> {
  console.log("[migrate] Baselining — marking initial migration as applied without running it...");

  await client.query(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id       SERIAL PRIMARY KEY,
      hash     TEXT NOT NULL UNIQUE,
      created_at BIGINT
    )
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.warn("[migrate] No migration files found in", MIGRATIONS_DIR);
    return;
  }

  const initialFile = files[0];
  const hash = initialFile.replace(".sql", "");

  await client.query(
    `INSERT INTO "__drizzle_migrations" (hash, created_at)
     VALUES ($1, $2)
     ON CONFLICT (hash) DO NOTHING`,
    [hash, Date.now()],
  );

  console.log(`[migrate] ✓ Baselined: ${initialFile}`);
}

async function run(): Promise<void> {
  console.log("[migrate] Connecting to database…");
  const client = await pool.connect();

  try {
    // Detect whether this is an existing db:push database
    const { rows: tableRows } = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
      ) AS exists
    `);
    const dbAlreadyPopulated = tableRows[0].exists;

    const { rows: migRows } = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '__drizzle_migrations'
      ) AS exists
    `);
    const hasMigrationsTable = migRows[0].exists;

    if (dbAlreadyPopulated && !hasMigrationsTable) {
      await baseline(client);
    }

    client.release();

    console.log("[migrate] Running pending migrations…");
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    console.log("[migrate] ✓ All migrations applied successfully");
  } catch (err) {
    client.release();
    console.error("[migrate] ✗ Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
