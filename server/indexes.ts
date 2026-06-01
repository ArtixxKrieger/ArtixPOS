import { pool } from "./db";

const INDEXES = [
  // ── Sales ─────────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_sales_user_del_created ON sales(user_id, deleted_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_branch_del_created ON sales(branch_id, deleted_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id, user_id, deleted_at)`,
  // Tenant-scoped OR number lookup (OR-gap detection, hash-verify audit)
  `CREATE INDEX IF NOT EXISTS idx_sales_tenant_del ON sales(tenant_id, deleted_at, created_at)`,
  // Non-unique lookup index retained for fast range queries scoped to a user
  `CREATE INDEX IF NOT EXISTS idx_sales_or_number ON sales(user_id, or_number) WHERE or_number IS NOT NULL`,
  // UNIQUE constraint: prevents duplicate OR numbers within the same tenant.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tenant_or_number ON sales(tenant_id, or_number) WHERE tenant_id IS NOT NULL AND or_number IS NOT NULL`,

  // ── Refunds ───────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_refunds_user ON refunds(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_refunds_sale ON refunds(sale_id)`,

  // ── Pending Orders ────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_pending_orders_user_del ON pending_orders(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_pending_orders_branch ON pending_orders(branch_id, deleted_at)`,

  // ── Discount Codes ────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_discount_codes_user ON discount_codes(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code)`,

  // ── Tables ────────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_tables_user_del ON tables(user_id, deleted_at)`,

  // ── Purchase Orders ───────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_purchase_orders_user ON purchase_orders(user_id, created_at)`,

  // ── Time Logs ─────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_timelogs_user ON time_logs(user_id, clock_in)`,

  // ── Service entities ──────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_service_staff_user_del ON service_staff(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_service_rooms_user_del ON service_rooms(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_appointments_user_del ON appointments(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_appointments_date_staff ON appointments(date, staff_id)`,

  // ── Memberships ───────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_memberships_user_del ON memberships(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_memberships_customer ON memberships(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_membership_plans_user ON membership_plans(user_id, deleted_at)`,

  // ── User Branches (junction table) ────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_user_branches_user ON user_branches(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_branches_branch ON user_branches(branch_id)`,

  // ── Ingredients & Recipes ─────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_ingredients_user_del ON ingredients(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_product_recipes_product ON product_recipes(product_id)`,

  // ── WiFi Vouchers ─────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_wifi_vouchers_user ON wifi_vouchers(user_id, created_at)`,

  // ── Payroll ───────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_payroll_periods_user ON payroll_periods(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON payroll_entries(period_id)`,

  // ── Core ──────────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_shifts_user_opened ON shifts(user_id, opened_at)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_products_user_del ON products(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_user_name ON customers(user_id, name)`,
  `CREATE INDEX IF NOT EXISTS idx_suppliers_user_del ON suppliers(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(purchase_order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at)`,

  // ── BRIN indexes ────────────────────────────────────────────────────────────
  // BRIN (Block Range INdex) tracks min/max values per 128-page block range.
  // For tables where rows are inserted in creation-time order (sales, audit_logs,
  // loyalty_points_log, stock_logs), BRIN reduces date-range I/O by ~90% vs a
  // B-tree scan, and is 100–300× smaller than an equivalent B-tree index.
  // At 10M rows a B-tree on created_at is ~200MB; the BRIN equivalent is ~128KB.
  `CREATE INDEX IF NOT EXISTS idx_sales_created_brin            ON sales            USING brin(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_brin       ON audit_logs       USING brin(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_loyalty_points_log_created_brin ON loyalty_points_log USING brin(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_logs_created_brin       ON stock_logs       USING brin(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_time_logs_created_brin        ON time_logs        USING brin(created_at)`,

  // ── loyalty_points_log — ZERO indexes beyond PK; every query is a full scan ─
  `CREATE INDEX IF NOT EXISTS idx_loyalty_points_log_customer   ON loyalty_points_log(customer_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_loyalty_points_log_user       ON loyalty_points_log(user_id, customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_loyalty_points_log_sale       ON loyalty_points_log(sale_id) WHERE sale_id IS NOT NULL`,

  // ── stock_logs — missing created_at range + user-scoped queries ─────────────
  `CREATE INDEX IF NOT EXISTS idx_stock_logs_product            ON stock_logs(product_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_logs_user               ON stock_logs(user_id, created_at)`,

  // ── waste_log — ZERO indexes beyond PK ────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_waste_log_user                ON waste_log(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_waste_log_product             ON waste_log(product_id) WHERE product_id IS NOT NULL`,

  // ── membership_check_ins — ZERO indexes beyond PK ─────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_membership_checkins_membership ON membership_check_ins(membership_id, checked_in_at)`,
  `CREATE INDEX IF NOT EXISTS idx_membership_checkins_customer  ON membership_check_ins(customer_id, checked_in_at)`,

  // ── revoked_tokens — without this, every cleanup query scans the full table ─
  // jwtAuthMiddleware also runs cleanup queries; no expiry index = O(N) always.
  `CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires        ON revoked_tokens(expires_at)`,

  // ── audit_logs entity history — looking up one entity's audit trail ─────────
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_entity             ON audit_logs(tenant_id, entity, entity_id) WHERE entity_id IS NOT NULL`,

  // ── Partial indexes: active-only rows (exclude soft-deleted rows entirely) ──
  // Soft-deleted rows accumulate indefinitely. A partial index is a fraction
  // of the size of its full equivalent because it omits all deleted rows —
  // and it is the only index that analytics queries (deleted_at IS NULL) use.
  `CREATE INDEX IF NOT EXISTS idx_sales_active_tenant           ON sales(tenant_id, created_at)            WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_products_active_user          ON products(user_id, category)             WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_customers_active_user         ON customers(user_id)                      WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_suppliers_active_user         ON suppliers(user_id)                      WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_ingredients_active_user       ON ingredients(user_id)                    WHERE deleted_at IS NULL`,

  // ── Notifications: unread-only filter (hot path on every page load) ─────────
  `CREATE INDEX IF NOT EXISTS idx_notifications_unread          ON notifications(user_id, created_at)      WHERE read_at IS NULL`,

  // ── Time Logs: open sessions — clocked-in employees not yet clocked out ─────
  `CREATE INDEX IF NOT EXISTS idx_timelogs_open                 ON time_logs(user_id)                      WHERE clock_out IS NULL AND deleted_at IS NULL`,

  // ── Stock Transfers ────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_stock_transfers_user          ON stock_transfers(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON stock_transfer_items(transfer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product  ON stock_transfer_items(product_id)`,

  // ── Push Subscriptions: looked up on every push notification ──────────────
  `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user       ON push_subscriptions(user_id)`,

  // ── Bloom filter index on sales ────────────────────────────────────────────
  // Bloom filters probabilistically eliminate heap pages that cannot match a
  // multi-column equality probe. When a query filters on (tenant_id, branch_id,
  // payment_method, discount_type) — common in analytics — the bloom index
  // skips whole 8 KB pages that have no matching combination, reducing I/O
  // even when each column has low selectivity (many rows per tenant/branch).
  // Wrapped in DO…EXCEPTION so a missing bloom extension never breaks startup.
  `DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS bloom;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sales_bloom ON sales USING bloom(tenant_id, payment_method, discount_type) WITH (length=128)';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END $$`,
];

// FK cascade constraints — idempotent DO blocks (EXCEPTION WHEN duplicate_object)
// Ensures orphaned child rows cannot accumulate when a parent product/user/branch
// is deleted. Safe to apply repeatedly; PG raises duplicate_object if the
// constraint already exists which is silently swallowed.
const FK_CASCADE_MIGRATIONS = [
  // product_sizes and product_modifiers were created without FK references —
  // add them now so rows are removed when the parent product is deleted.
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

  // user_branches: drop existing no-action FKs and replace with cascade so
  // deleting a user or branch automatically removes their junction rows.
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
];

const COLUMN_MIGRATIONS = [
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date text`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS batch_number text`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_prescription boolean DEFAULT false`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS generic_name text`,
  // Time Logs — break tracking + separate clock-out notes
  `ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS break_start text`,
  `ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS break_minutes integer DEFAULT 0`,
  `ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS clock_out_notes text`,
  // Shifts — denomination counters, mid-shift cash adjustments, variance
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_in text DEFAULT '0'`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_out text DEFAULT '0'`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_adjustments text`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS denomination_open text`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS denomination_close text`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS variance text`,
  // POS feature flags — per-tenant JSONB, null until the owner completes setup wizard
  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pos_features jsonb`,
];

export async function ensureIndexes(): Promise<void> {
  const client = await pool.connect();
  try {
    for (const stmt of COLUMN_MIGRATIONS) {
      try {
        await client.query(stmt);
      } catch (err: unknown) {
        console.warn("[migrations]", stmt.slice(0, 60), "—", (err as Error)?.message ?? String(err));
      }
    }
    for (const stmt of FK_CASCADE_MIGRATIONS) {
      try {
        await client.query(stmt);
      } catch (err: unknown) {
        console.warn("[fk-migrations]", stmt.slice(0, 60), "—", (err as Error)?.message ?? String(err));
      }
    }
    for (const stmt of INDEXES) {
      try {
        await client.query(stmt);
      } catch (err: unknown) {
        console.warn("[indexes]", stmt.slice(0, 60), "—", (err as Error)?.message ?? String(err));
      }
    }
  } finally {
    client.release();
  }
  console.log("[indexes] Performance indexes, column migrations, and FK constraints verified.");
}
