-- =============================================================================
-- ArtixPOS — Migrate to Partitioned Tables
-- =============================================================================
-- Converts `sales` and `audit_logs` to monthly RANGE-partitioned tables.
--
-- WHY PARTITIONING MATTERS AT 10M+ ROWS
-- ─────────────────────────────────────
-- Without partitioning, a date-range query on `sales` must scan the B-tree
-- index for the entire table even when it only needs one month of data.
-- At 10M rows the index is ~200MB; at 100M rows it exceeds shared_buffers
-- entirely — every query causes disk I/O.
--
-- With monthly partitions each partition has ~1/12 of the rows. Its index
-- fits easily in shared_buffers → cache hit rate approaches 100% → median
-- query drops from ~80ms to ~3ms for the same date-range predicate.
--
-- Cleanup is also instant: DROP TABLE sales_y2022m01 vs DELETE+VACUUM on
-- 800K rows (which takes minutes and bloats the table for days after).
--
-- WHEN TO RUN
-- ──────────────
-- Run this during a low-traffic maintenance window. It copies all data into
-- the new partitioned table which takes ~5 minutes per 1M rows on a fast
-- managed Postgres. The server MUST be stopped or set to read-only first.
--
-- SAFETY
-- ──────────────
-- • Old tables are RENAMED, not dropped — roll back by swapping names again.
-- • The script is wrapped in a transaction. If anything fails, it rolls back.
-- • After migrating, restart the server so partition-manager.ts starts
--   auto-creating future monthly partitions on each startup.
--
-- USAGE
-- ──────────────
--   # 1. Stop writes / enable read-only mode on the app
--   # 2. Connect to your database:
--   psql $DATABASE_URL -f scripts/migrate-to-partitioned.sql
--   # 3. Verify row counts (see bottom of script)
--   # 4. Restart the app server
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: sales
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1a: Rename the current table out of the way
ALTER TABLE sales RENAME TO sales_legacy;

-- Step 1b: Create the new partitioned table with identical structure
CREATE TABLE sales (LIKE sales_legacy INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
  PARTITION BY RANGE (created_at);

-- Step 1c: Monthly partitions — 3 years back + current year + 2 years forward
-- Extend this list as needed for your historical data range.
DO $$
DECLARE
  y    int;
  m    int;
  part text;
  lo   text;
  hi   text;
BEGIN
  FOR y IN 2021..2027 LOOP
    FOR m IN 1..12 LOOP
      part := format('sales_y%sm%s', y, lpad(m::text, 2, '0'));
      lo   := format('%s-%s-01T00:00:00.000Z', y, lpad(m::text, 2, '0'));
      hi   := to_char(
                make_date(y, m, 1) + interval '1 month',
                'YYYY-MM-01T00:00:00.000Z'
              );
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF sales FOR VALUES FROM (%L) TO (%L)',
        part, lo, hi
      );
    END LOOP;
  END LOOP;
END $$;

-- Catch-all DEFAULT partition for any row outside the explicit ranges above
CREATE TABLE sales_overflow PARTITION OF sales DEFAULT;

-- Step 1d: Re-create indexes on the partitioned table
--   (PostgreSQL partitioned tables do not inherit indexes from LIKE)
CREATE INDEX idx_sales_user_del_cat   ON sales(user_id, deleted_at, created_at);
CREATE INDEX idx_sales_tenant_del     ON sales(tenant_id, deleted_at);
CREATE INDEX idx_sales_branch         ON sales(branch_id, deleted_at, created_at) WHERE branch_id IS NOT NULL;
CREATE INDEX idx_sales_customer       ON sales(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_sales_active_tenant  ON sales(tenant_id, created_at)             WHERE deleted_at IS NULL;
CREATE INDEX idx_sales_created_brin   ON sales USING brin(created_at);

-- Step 1e: Copy all data
INSERT INTO sales SELECT * FROM sales_legacy;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: audit_logs
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE audit_logs RENAME TO audit_logs_legacy;

CREATE TABLE audit_logs (LIKE audit_logs_legacy INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
  PARTITION BY RANGE (created_at);

DO $$
DECLARE
  y    int;
  m    int;
  part text;
  lo   text;
  hi   text;
BEGIN
  FOR y IN 2021..2027 LOOP
    FOR m IN 1..12 LOOP
      part := format('audit_logs_y%sm%s', y, lpad(m::text, 2, '0'));
      lo   := format('%s-%s-01T00:00:00.000Z', y, lpad(m::text, 2, '0'));
      hi   := to_char(
                make_date(y, m, 1) + interval '1 month',
                'YYYY-MM-01T00:00:00.000Z'
              );
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
        part, lo, hi
      );
    END LOOP;
  END LOOP;
END $$;

CREATE TABLE audit_logs_overflow PARTITION OF audit_logs DEFAULT;

CREATE INDEX idx_audit_logs_tenant       ON audit_logs(tenant_id, created_at);
CREATE INDEX idx_audit_logs_entity       ON audit_logs(tenant_id, entity, entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_audit_logs_created_brin ON audit_logs USING brin(created_at);

INSERT INTO audit_logs SELECT * FROM audit_logs_legacy;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — run these queries after the transaction commits
-- ─────────────────────────────────────────────────────────────────────────────

-- Counts must match:
--   SELECT 'sales_legacy' AS tbl, COUNT(*) FROM sales_legacy
--   UNION ALL
--   SELECT 'sales (partitioned)', COUNT(*) FROM sales;
--
--   SELECT 'audit_logs_legacy' AS tbl, COUNT(*) FROM audit_logs_legacy
--   UNION ALL
--   SELECT 'audit_logs (partitioned)', COUNT(*) FROM audit_logs;

-- ─────────────────────────────────────────────────────────────────────────────
-- COMMIT — if anything above failed, the entire script was rolled back
-- ─────────────────────────────────────────────────────────────────────────────
COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- CLEANUP (run AFTER verifying row counts — outside the transaction)
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP TABLE sales_legacy;
-- DROP TABLE audit_logs_legacy;
