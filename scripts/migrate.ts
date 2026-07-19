/**
 * scripts/migrate.ts
 *
 * Idempotent schema migration runner.
 * Runs at build time on Vercel (via `vercel-build`) so every deployment
 * automatically applies new columns and tables to Supabase.
 * Also safe to run manually at any time.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts
 */

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("[migrate] DATABASE_URL is not set — aborting.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

// ---------------------------------------------------------------------------
// All statements are idempotent (IF NOT EXISTS / EXCEPTION WHEN duplicate).
// Add new ones at the bottom so ordering is always additive.
// ---------------------------------------------------------------------------

const MIGRATIONS: string[] = [
  // ── Products ──────────────────────────────────────────────────────────────
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date text`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS batch_number text`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_prescription boolean DEFAULT false`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS generic_name text`,

  // ── Time logs ─────────────────────────────────────────────────────────────
  `ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS break_start text`,
  `ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS break_minutes integer DEFAULT 0`,
  `ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS clock_out_notes text`,

  // ── Shifts ────────────────────────────────────────────────────────────────
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_in text DEFAULT '0'`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_out text DEFAULT '0'`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_adjustments text`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS denomination_open text`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS denomination_close text`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS variance text`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS gat_beginning text DEFAULT '0'`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS gat_ending text DEFAULT '0'`,

  // ── User settings ─────────────────────────────────────────────────────────
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pos_features jsonb`,
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notification_preferences jsonb`,
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS mikrotik_enabled integer DEFAULT 0`,
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS mikrotik_host text`,
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS mikrotik_port text DEFAULT '80'`,
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS mikrotik_user text DEFAULT 'admin'`,
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS mikrotik_password text`,
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS mikrotik_hotspot_profile text DEFAULT 'default'`,
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS mikrotik_use_ssl integer DEFAULT 0`,

  // ── Users ─────────────────────────────────────────────────────────────────
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS active_branch_id integer REFERENCES branches(id) ON DELETE SET NULL`,

  // ── Wi-Fi vouchers ────────────────────────────────────────────────────────
  `ALTER TABLE wifi_vouchers ADD COLUMN IF NOT EXISTS mikrotik_user_id text`,

  // ── FK cascade constraints ────────────────────────────────────────────────
  `DO $$ BEGIN
    ALTER TABLE product_sizes
      ADD CONSTRAINT fk_product_sizes_product
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `DO $$ BEGIN
    ALTER TABLE product_modifiers
      ADD CONSTRAINT fk_product_modifiers_product
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `DO $$ BEGIN
    ALTER TABLE user_branches
      ADD CONSTRAINT fk_user_branches_user_cascade
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  `DO $$ BEGIN
    ALTER TABLE user_branches
      ADD CONSTRAINT fk_user_branches_branch_cascade
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

  // ── New tables ────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS user_sessions (
    id           text NOT NULL,
    jti          text NOT NULL,
    user_id      text NOT NULL,
    device_name  text,
    ip_address   text,
    created_at   text,
    last_seen_at text,
    expires_at   text NOT NULL,
    CONSTRAINT user_sessions_pkey       PRIMARY KEY (id),
    CONSTRAINT user_sessions_jti_unique UNIQUE (jti),
    CONSTRAINT user_sessions_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
];

async function main() {
  const client = await pool.connect();
  let ok = 0;
  let warn = 0;

  try {
    for (const stmt of MIGRATIONS) {
      const preview = stmt.replace(/\s+/g, " ").trim().slice(0, 72);
      try {
        await client.query(stmt);
        console.log(`  ✓ ${preview}`);
        ok++;
      } catch (err: any) {
        console.warn(`  ⚠ ${preview}`);
        console.warn(`    → ${err.message?.split("\n")[0] ?? String(err)}`);
        warn++;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`\n[migrate] Done — ${ok} applied, ${warn} skipped/warned.`);
  if (warn > 0) {
    console.log("[migrate] Warnings above are usually harmless (column already exists, etc.).");
  }
}

main().catch((err) => {
  console.error("[migrate] Fatal:", err.message ?? err);
  process.exit(1);
});
