

import { pool } from "./db";

const PARTITIONED_TABLES = ["sales", "audit_logs"] as const;
const MONTHS_BEHIND = 2;
const MONTHS_AHEAD  = 4;

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

async function existingPartitions(tableName: string): Promise<Set<string>> {
  const result = await pool.query<{ relname: string }>(`
    SELECT c.relname
    FROM   pg_inherits i
    JOIN   pg_class    c ON c.oid = i.inhrelid
    JOIN   pg_class    p ON p.oid = i.inhparent
    WHERE  p.relname = $1
      AND  p.relnamespace = 'public'::regnamespace
  `, [tableName]);
  return new Set(result.rows.map((r: any) => r.relname));
}

async function ensureMonthlyPartitions(tableName: string): Promise<number> {
  const now = new Date();

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

        continue;
      }
      const n = await ensureMonthlyPartitions(table);
      if (n > 0) {
        console.log(`[partitions] ${table} — created ${n} new monthly partition(s)`);
      } else {
        console.log(`[partitions] ${table} — all partitions up to date`);
      }
    } catch (err: unknown) {

      console.warn(`[partitions] ${table} — check failed:`, (err as Error)?.message ?? String(err));
    }
  }
}
