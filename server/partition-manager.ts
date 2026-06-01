/**
 * Partition Manager
 *
 * Auto-creates future monthly partitions for high-growth tables that have
 * been converted to RANGE-partitioned tables via the migration script at
 * scripts/migrate-to-partitioned.sql.
 *
 * If the table is NOT yet partitioned (legacy schema), this module is a
 * no-op — it logs a hint and exits cleanly so startup is never blocked.
 *
 * Tables managed: sales, audit_logs
 *
 * Partition naming: <table>_y<YYYY>m<MM>  e.g. sales_y2024m06
 *
 * Why monthly?
 *   - Query pruning: a date-range query spanning one month touches one
 *     partition instead of the whole table. Its index is ~12× smaller than
 *     the full-table index, fits in shared_buffers more easily → faster reads.
 *   - Cleanup: dropping an old partition is instant (no DELETE, no VACUUM).
 *   - Manageability: 12 partitions/year is easy to reason about.
 */
import { pool } from "./db";

const PARTITIONED_TABLES = ["sales", "audit_logs"] as const;
const MONTHS_BEHIND = 2;  // Create partitions going back this far (catch-up)
const MONTHS_AHEAD  = 4;  // Create partitions this many months in advance

async function isPartitioned(tableName: string): Promise<boolean> {
  const result = await pool.query<{ is_part: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM   pg_partitioned_table pt
      JOIN   pg_class c ON c.oid = pt.partrelid
      WHERE  c.relname = $1
        AND  c.relnamespace = 'public'::regnamespace
    ) AS is_part
  `, [tableName]);
  return result.rows[0]?.is_part ?? false;
}

// Returns the set of partition names that already exist in pg_class.
async function existingPartitions(tableName: string): Promise<Set<string>> {
  const result = await pool.query<{ relname: string }>(`
    SELECT c.relname
    FROM   pg_inherits i
    JOIN   pg_class    c ON c.oid = i.inhrelid
    JOIN   pg_class    p ON p.oid = i.inhparent
    WHERE  p.relname = $1
      AND  p.relnamespace = 'public'::regnamespace
  `, [tableName]);
  return new Set(result.rows.map(r => r.relname));
}

async function ensureMonthlyPartitions(tableName: string): Promise<number> {
  const now = new Date();

  // Snapshot existing partitions before creating anything — pg_class reports
  // all child tables regardless of whether CREATE TABLE IF NOT EXISTS is a
  // no-op or creates a new table, so this is the only reliable way to count
  // genuinely new partitions without false positives.
  const existing = await existingPartitions(tableName);
  let created = 0;

  for (let delta = -MONTHS_BEHIND; delta <= MONTHS_AHEAD; delta++) {
    const d    = new Date(now.getFullYear(), now.getMonth() + delta, 1);
    const nd   = new Date(d.getFullYear(),   d.getMonth() + 1,       1);

    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const nyyyy= nd.getFullYear();
    const nmm  = String(nd.getMonth() + 1).padStart(2, "0");

    const partName = `${tableName}_y${yyyy}m${mm}`;
    const fromVal  = `${yyyy}-${mm}-01T00:00:00.000Z`;
    const toVal    = `${nyyyy}-${nmm}-01T00:00:00.000Z`;

    // CREATE TABLE IF NOT EXISTS is fully idempotent — safe on every restart.
    await pool.query(
      `CREATE TABLE IF NOT EXISTS "${partName}"
         PARTITION OF "${tableName}"
         FOR VALUES FROM ($1) TO ($2)`,
      [fromVal, toVal],
    );

    if (!existing.has(partName)) created++;
  }

  return created;
}

export async function ensurePartitions(): Promise<void> {
  for (const table of PARTITIONED_TABLES) {
    try {
      if (!(await isPartitioned(table))) {
        // Table hasn't been migrated to partitioned yet — skip silently.
        continue;
      }
      const n = await ensureMonthlyPartitions(table);
      if (n > 0) {
        console.log(`[partitions] ${table} — created ${n} new monthly partition(s)`);
      } else {
        console.log(`[partitions] ${table} — all partitions up to date`);
      }
    } catch (err: unknown) {
      // Non-fatal: a partition creation error must never crash the server.
      console.warn(`[partitions] ${table} — check failed:`, (err as Error)?.message ?? String(err));
    }
  }
}
