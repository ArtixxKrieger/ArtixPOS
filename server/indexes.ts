import { pool } from "./db";

const INDEXES = [

  `CREATE INDEX IF NOT EXISTS idx_sales_user_del_created ON sales(user_id, deleted_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_branch_del_created ON sales(branch_id, deleted_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id, user_id, deleted_at)`,

  `CREATE INDEX IF NOT EXISTS idx_sales_tenant_del ON sales(tenant_id, deleted_at, created_at)`,

  `CREATE INDEX IF NOT EXISTS idx_sales_or_number ON sales(user_id, or_number) WHERE or_number IS NOT NULL`,

  `CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tenant_or_number ON sales(tenant_id, or_number) WHERE tenant_id IS NOT NULL AND or_number IS NOT NULL`,

`CREATE INDEX IF NOT EXISTS idx_refunds_user ON refunds(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_refunds_sale ON refunds(sale_id)`,

`CREATE INDEX IF NOT EXISTS idx_pending_orders_user_del ON pending_orders(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_pending_orders_branch ON pending_orders(branch_id, deleted_at)`,

`CREATE INDEX IF NOT EXISTS idx_discount_codes_user ON discount_codes(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code)`,

`CREATE INDEX IF NOT EXISTS idx_tables_user_del ON tables(user_id, deleted_at)`,

`CREATE INDEX IF NOT EXISTS idx_purchase_orders_user ON purchase_orders(user_id, created_at)`,

`CREATE INDEX IF NOT EXISTS idx_timelogs_user ON time_logs(user_id, clock_in)`,

`CREATE INDEX IF NOT EXISTS idx_service_staff_user_del ON service_staff(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_service_rooms_user_del ON service_rooms(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_appointments_user_del ON appointments(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_appointments_date_staff ON appointments(date, staff_id)`,

`CREATE INDEX IF NOT EXISTS idx_memberships_user_del ON memberships(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_memberships_customer ON memberships(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_membership_plans_user ON membership_plans(user_id, deleted_at)`,

`CREATE INDEX IF NOT EXISTS idx_user_branches_user ON user_branches(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_branches_branch ON user_branches(branch_id)`,

`CREATE INDEX IF NOT EXISTS idx_ingredients_user_del ON ingredients(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_product_recipes_product ON product_recipes(product_id)`,

`CREATE INDEX IF NOT EXISTS idx_wifi_vouchers_user ON wifi_vouchers(user_id, created_at)`,

`CREATE INDEX IF NOT EXISTS idx_payroll_periods_user ON payroll_periods(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON payroll_entries(period_id)`,

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

`CREATE INDEX IF NOT EXISTS idx_sales_created_brin            ON sales            USING brin(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_brin       ON audit_logs       USING brin(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_loyalty_points_log_created_brin ON loyalty_points_log USING brin(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_logs_created_brin       ON stock_logs       USING brin(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_time_logs_created_brin        ON time_logs        USING brin(created_at)`,

`CREATE INDEX IF NOT EXISTS idx_loyalty_points_log_customer   ON loyalty_points_log(customer_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_loyalty_points_log_user       ON loyalty_points_log(user_id, customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_loyalty_points_log_sale       ON loyalty_points_log(sale_id) WHERE sale_id IS NOT NULL`,

`CREATE INDEX IF NOT EXISTS idx_stock_logs_product            ON stock_logs(product_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_logs_user               ON stock_logs(user_id, created_at)`,

`CREATE INDEX IF NOT EXISTS idx_waste_log_user                ON waste_log(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_waste_log_product             ON waste_log(product_id) WHERE product_id IS NOT NULL`,

`CREATE INDEX IF NOT EXISTS idx_membership_checkins_membership ON membership_check_ins(membership_id, checked_in_at)`,
  `CREATE INDEX IF NOT EXISTS idx_membership_checkins_customer  ON membership_check_ins(customer_id, checked_in_at)`,

`CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires        ON revoked_tokens(expires_at)`,

`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity             ON audit_logs(tenant_id, entity, entity_id) WHERE entity_id IS NOT NULL`,

`CREATE INDEX IF NOT EXISTS idx_sales_active_tenant           ON sales(tenant_id, created_at)            WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_products_active_user          ON products(user_id, category)             WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_customers_active_user         ON customers(user_id)                      WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_suppliers_active_user         ON suppliers(user_id)                      WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_ingredients_active_user       ON ingredients(user_id)                    WHERE deleted_at IS NULL`,

`CREATE INDEX IF NOT EXISTS idx_notifications_unread          ON notifications(user_id, created_at)      WHERE read_at IS NULL`,

`CREATE INDEX IF NOT EXISTS idx_timelogs_open                 ON time_logs(user_id)                      WHERE clock_out IS NULL AND deleted_at IS NULL`,

`CREATE INDEX IF NOT EXISTS idx_stock_transfers_user          ON stock_transfers(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON stock_transfer_items(transfer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product  ON stock_transfer_items(product_id)`,

`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user       ON push_subscriptions(user_id)`,

`DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS bloom;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sales_bloom ON sales USING bloom(tenant_id, payment_method, discount_type) WITH (length=128)';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END $$`,
];

const FK_CASCADE_MIGRATIONS = [

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
];

const COLUMN_MIGRATIONS = [
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date text`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS batch_number text`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS requires_prescription boolean DEFAULT false`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS generic_name text`,

  `ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS break_start text`,
  `ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS break_minutes integer DEFAULT 0`,
  `ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS clock_out_notes text`,

  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_in text DEFAULT '0'`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_out text DEFAULT '0'`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS cash_adjustments text`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS denomination_open text`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS denomination_close text`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS variance text`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS gat_beginning text DEFAULT '0'`,
  `ALTER TABLE shifts ADD COLUMN IF NOT EXISTS gat_ending text DEFAULT '0'`,

  `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pos_features jsonb`,

  `ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at text`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS active_branch_id integer REFERENCES branches(id) ON DELETE SET NULL`,
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
