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

async function ensureMonthlyPartitions(tableName: string): Promise<number> {
  const now = new Date();
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

    // IF NOT EXISTS means this is fully idempotent — safe to run on every restart.
    const result = await pool.query(
      `CREATE TABLE IF NOT EXISTS "${partName}"
         PARTITION OF "${tableName}"
         FOR VALUES FROM ($1) TO ($2)`,
      [fromVal, toVal],
    );
    // commandStatus is "CREATE TABLE" when a new partition was created,
    // undefined / no-op when it already existed.
    if ((result as any).command === "CREATE") created++;
  }

  return created;
}

export async function ensurePartitions(): Promise<void> {
  for (const table of PARTITIONED_TABLES) {
    try {
      if (!(await isPartitioned(table))) {
        // Table hasn't been migrated yet — skip silently.
        continue;
      }
      const n = await ensureMonthlyPartitions(table);
      if (n > 0) {
        console.log(`[partitions] ${table} — created ${n} new monthly partition(s)`);
      } else {
        console.log(`[partitions] ${table} — all partitions up to date`);
      }
    } catch (err: unknown) {
      // Non-fatal: a partition creation error must never bring down the server.
      console.warn(`[partitions] ${table} — partition check failed:`, (err as Error)?.message ?? String(err));
    }
  }
}
