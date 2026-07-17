import { db } from "../../db";
import { sql } from "drizzle-orm";

export interface BirXReportData {
  agg: Record<string, unknown>;
  paymentRows: Record<string, unknown>[];
  discountRows: Record<string, unknown>[];
}

export async function getBirXReportData(
  userId: string,
  startDate: string,
): Promise<BirXReportData> {
  const [aggResult, pmResult, dtResult] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int                                                                      AS total_txn,
        COALESCE(SUM(CAST(total              AS NUMERIC)), 0)::float8                     AS gross_sales,
        COALESCE(SUM(CAST(tax                AS NUMERIC)), 0)::float8                     AS vat_amount,
        COALESCE(SUM(CAST(discount           AS NUMERIC)), 0)::float8                     AS total_discount,
        COALESCE(SUM(CAST(loyalty_discount   AS NUMERIC)), 0)::float8                     AS total_loyalty_discount,
        COALESCE(SUM(CAST(vatable_sales      AS NUMERIC)), 0)::float8                     AS vatable_sales,
        COALESCE(SUM(CAST(vat_exempt_sales   AS NUMERIC)), 0)::float8                     AS vat_exempt_sales,
        COALESCE(SUM(CAST(zero_rated_sales   AS NUMERIC)), 0)::float8                     AS zero_rated_sales,
        MIN(CASE
              WHEN or_number ~ '^[0-9]+$'        THEN CAST(or_number AS bigint)
              WHEN or_number ~ '^[A-Z]+-[0-9]+$' THEN CAST(substring(or_number FROM position('-' IN or_number) + 1) AS bigint)
            END)                                                                           AS or_min,
        MAX(CASE
              WHEN or_number ~ '^[0-9]+$'        THEN CAST(or_number AS bigint)
              WHEN or_number ~ '^[A-Z]+-[0-9]+$' THEN CAST(substring(or_number FROM position('-' IN or_number) + 1) AS bigint)
            END)                                                                           AS or_max
      FROM sales
      WHERE user_id = ANY(
        SELECT id FROM users WHERE tenant_id = (
          SELECT tenant_id FROM users WHERE id = ${userId}
        )
      )
        AND deleted_at IS NULL
        AND created_at >= ${startDate}
    `),
    db.execute(sql`
      SELECT
        COALESCE(payment_method, 'cash')                                  AS pm,
        COUNT(*)::int                                                      AS count,
        COALESCE(SUM(CAST(total AS NUMERIC)), 0)::float8                  AS total
      FROM sales
      WHERE user_id = ANY(
        SELECT id FROM users WHERE tenant_id = (
          SELECT tenant_id FROM users WHERE id = ${userId}
        )
      )
        AND deleted_at IS NULL
        AND created_at >= ${startDate}
      GROUP BY payment_method
    `),
    db.execute(sql`
      SELECT
        COALESCE(discount_type, 'regular')                                AS dt,
        COUNT(*)::int                                                      AS count,
        COALESCE(SUM(CAST(total    AS NUMERIC)), 0)::float8               AS total,
        COALESCE(SUM(CAST(discount AS NUMERIC)), 0)::float8               AS discount
      FROM sales
      WHERE user_id = ANY(
        SELECT id FROM users WHERE tenant_id = (
          SELECT tenant_id FROM users WHERE id = ${userId}
        )
      )
        AND deleted_at IS NULL
        AND created_at >= ${startDate}
      GROUP BY discount_type
    `),
  ]);

  return {
    agg: (aggResult.rows as Record<string, unknown>[])[0] ?? {},
    paymentRows: pmResult.rows as Record<string, unknown>[],
    discountRows: dtResult.rows as Record<string, unknown>[],
  };
}

export interface BirSummaryData {
  agg: Record<string, unknown>;
  paymentRows: Record<string, unknown>[];
}

export async function getBirSummaryData(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<BirSummaryData> {
  const [aggResult, pmResult] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int                                                                             AS total_txn,
        COALESCE(SUM(CAST(total            AS NUMERIC)), 0)::float8                              AS gross_sales,
        COALESCE(SUM(CAST(tax              AS NUMERIC)), 0)::float8                              AS output_vat,
        COALESCE(SUM(CAST(vatable_sales    AS NUMERIC)), 0)::float8                              AS vatable_sales,
        COALESCE(SUM(CAST(vat_exempt_sales AS NUMERIC)), 0)::float8                              AS vat_exempt_sales,
        COALESCE(SUM(CAST(zero_rated_sales AS NUMERIC)), 0)::float8                              AS zero_rated_sales,
        COALESCE(SUM(CAST(discount         AS NUMERIC)), 0)::float8                              AS total_discount,
        (COUNT(*) FILTER (WHERE discount_type IN ('sc','pwd')))::int                              AS sc_pwd_count,
        COALESCE(SUM(CAST(discount AS NUMERIC)) FILTER (WHERE discount_type IN ('sc','pwd')), 0)::float8 AS sc_pwd_discount,
        MIN(CASE
              WHEN or_number ~ '^[0-9]+$'        THEN CAST(or_number AS bigint)
              WHEN or_number ~ '^[A-Z]+-[0-9]+$' THEN CAST(substring(or_number FROM position('-' IN or_number) + 1) AS bigint)
            END)                                                                                  AS or_min,
        MAX(CASE
              WHEN or_number ~ '^[0-9]+$'        THEN CAST(or_number AS bigint)
              WHEN or_number ~ '^[A-Z]+-[0-9]+$' THEN CAST(substring(or_number FROM position('-' IN or_number) + 1) AS bigint)
            END)                                                                                  AS or_max
      FROM sales
      WHERE user_id = ANY(
        SELECT id FROM users WHERE tenant_id = (
          SELECT tenant_id FROM users WHERE id = ${userId}
        )
      )
        AND deleted_at IS NULL
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
    `),
    db.execute(sql`
      SELECT
        COALESCE(payment_method, 'cash')                             AS pm,
        COUNT(*)::int                                                AS count,
        COALESCE(SUM(CAST(total AS NUMERIC)), 0)::float8            AS total
      FROM sales
      WHERE user_id = ANY(
        SELECT id FROM users WHERE tenant_id = (
          SELECT tenant_id FROM users WHERE id = ${userId}
        )
      )
        AND deleted_at IS NULL
        AND created_at >= ${startDate}
        AND created_at <= ${endDate}
      GROUP BY payment_method
    `),
  ]);

  return {
    agg: (aggResult.rows as Record<string, unknown>[])[0] ?? {},
    paymentRows: pmResult.rows as Record<string, unknown>[],
  };
}

/**
 * Returns all numeric OR numbers for the user's tenant, ordered ascending.
 * Handles both plain numeric strings ("0000001") and the "SR-" prefixed
 * format the system generates ("SR-0000001"), as well as any other
 * uppercase-prefix format ("ABC-0000001"), so gap detection works regardless
 * of which OR number format is in use.
 */
export async function getBirOrNumbers(userId: string): Promise<number[]> {
  const result = await db.execute(sql`
    SELECT
      CAST(
        CASE
          WHEN or_number ~ '^[0-9]+$'        THEN or_number
          WHEN or_number ~ '^[A-Z]+-[0-9]+$' THEN substring(or_number FROM position('-' IN or_number) + 1)
        END
      AS bigint) AS n
    FROM   sales
    WHERE  user_id = ANY(
             SELECT id FROM users WHERE tenant_id = (
               SELECT tenant_id FROM users WHERE id = ${userId}
             )
           )
      AND  (
             or_number ~ '^[0-9]+$'
          OR or_number ~ '^[A-Z]+-[0-9]+$'
           )
      AND  deleted_at IS NULL
    ORDER  BY n
  `);
  return (result.rows as any[]).map((r) => Number(r.n));
}

/** Returns void-trail rows for the user's tenant (latest 1 000 voided sales). */
export async function getBirVoidTrailRows(userId: string): Promise<Record<string, unknown>[]> {
  const result = await db.execute(sql`
    SELECT
      s.id, s.or_number, s.receipt_number, s.invoice_number,
      s.total, s.subtotal, s.tax, s.discount,
      s.vatable_sales, s.vat_exempt_sales, s.zero_rated_sales,
      s.discount_type, s.sale_hash, s.void_reason,
      s.deleted_at, s.created_at, s.user_id,
      u.name AS deleted_by_name
    FROM   sales s
    LEFT   JOIN users u ON u.id = s.deleted_by
    WHERE  s.user_id = ANY(
             SELECT id FROM users
             WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = ${userId})
           )
      AND  s.deleted_at IS NOT NULL
    ORDER  BY s.deleted_at DESC
    LIMIT  1000
  `);
  return result.rows as Record<string, unknown>[];
}

/** Same data as getBirVoidTrailRows but with all fields needed for CSV export. */
export async function getBirVoidTrailExportRows(
  userId: string,
): Promise<Record<string, unknown>[]> {
  const result = await db.execute(sql`
    SELECT
      s.id, s.or_number, s.receipt_number, s.total, s.void_reason,
      s.deleted_at, s.created_at, s.user_id, s.subtotal, s.tax, s.discount,
      s.vatable_sales, s.vat_exempt_sales, s.zero_rated_sales,
      s.discount_type, s.sale_hash, s.invoice_number,
      u.name AS deleted_by_name
    FROM   sales s
    LEFT   JOIN users u ON u.id = s.deleted_by
    WHERE  s.user_id = ANY(
             SELECT id FROM users
             WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = ${userId})
           )
      AND  s.deleted_at IS NOT NULL
    ORDER  BY s.deleted_at DESC
    LIMIT  10000
  `);
  return result.rows as Record<string, unknown>[];
}

/** Returns all sales rows needed for hash/integrity verification. */
export async function getBirHashVerifyRows(
  userId: string,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<Record<string, unknown>[]> {
  const { startDate, endDate } = opts;
  const result = await db.execute(sql`
    SELECT
      id, user_id, receipt_number, or_number, invoice_number,
      subtotal, tax, discount, vatable_sales, vat_exempt_sales, zero_rated_sales,
      total, discount_type, created_at, sale_hash
    FROM sales
    WHERE user_id = ANY(
            SELECT id FROM users WHERE tenant_id = (
              SELECT tenant_id FROM users WHERE id = ${userId}
            )
          )
      AND deleted_at IS NULL
      ${startDate ? sql`AND created_at >= ${startDate}` : sql``}
      ${endDate ? sql`AND created_at <= ${endDate}` : sql``}
    ORDER BY id ASC
  `);
  return result.rows as Record<string, unknown>[];
}

/** Returns refund audit trail rows for CSV export. */
export async function getBirRefundTrailRows(userId: string): Promise<Record<string, unknown>[]> {
  const result = await db.execute(sql`
    SELECT
      r.id, r.sale_id, r.amount, r.reason, r.created_at,
      u.name AS processed_by_name,
      s.or_number, s.receipt_number, s.total AS sale_total
    FROM refunds r
    LEFT JOIN users u ON u.id = r.processed_by
    LEFT JOIN sales s ON s.id = r.sale_id
    WHERE r.user_id = ANY(
      SELECT id FROM users
      WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = ${userId})
    )
    ORDER BY r.created_at DESC
    LIMIT 10000
  `);
  return result.rows as Record<string, unknown>[];
}
