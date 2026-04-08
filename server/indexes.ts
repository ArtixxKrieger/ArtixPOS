import { db } from "./db";
import { sql } from "drizzle-orm";

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_sales_user_del_created ON sales(user_id, deleted_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_branch_del_created ON sales(branch_id, deleted_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id, user_id, deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_shifts_user_opened ON shifts(user_id, opened_at)`,
  `CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_appointments_date_staff ON appointments(date, staff_id)`,
  `CREATE INDEX IF NOT EXISTS idx_memberships_customer ON memberships(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(purchase_order_id)`,
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
