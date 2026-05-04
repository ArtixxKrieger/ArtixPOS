import { db } from "./db";
import { sql } from "drizzle-orm";

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_sales_user_del_created ON sales(user_id, deleted_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_branch_del_created ON sales(branch_id, deleted_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id, user_id, deleted_at)`,
  // Non-unique lookup index retained for fast range queries scoped to a user
  `CREATE INDEX IF NOT EXISTS idx_sales_or_number ON sales(user_id, or_number) WHERE or_number IS NOT NULL`,
  // UNIQUE constraint: prevents duplicate OR numbers within the same tenant.
  // Combined with the atomic or_sequences upsert this provides defence-in-depth
  // against any future code path that bypasses the sequence logic.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_tenant_or_number ON sales(tenant_id, or_number) WHERE tenant_id IS NOT NULL AND or_number IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_shifts_user_opened ON shifts(user_id, opened_at)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_products_user_del ON products(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_user_name ON customers(user_id, name)`,
  `CREATE INDEX IF NOT EXISTS idx_suppliers_user_del ON suppliers(user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_appointments_date_staff ON appointments(date, staff_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memberships_customer ON memberships(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(purchase_order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at)`,
  // Audit logs are queried by tenant_id on every admin / audit-trail request
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at)`,
];

export async function ensureIndexes(): Promise<void> {
  for (const stmt of INDEXES) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (err: any) {
      console.warn("[indexes]", stmt.slice(0, 60), "—", err?.message ?? err);
    }
  }
  console.log("[indexes] Performance indexes verified.");
}
