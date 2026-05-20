import { pool } from "./db";

/**
 * Applies PostgreSQL Row-Level Security (RLS) policies to every tenant-scoped
 * table.  Safe to call on every startup — all statements are idempotent.
 *
 * Design:
 *  - A helper function `current_tenant_id()` reads the session variable
 *    `app.current_tenant` that the tenant middleware sets via SET LOCAL.
 *  - FORCE ROW LEVEL SECURITY ensures the policies apply even to the
 *    database superuser, so a missing WHERE clause in application code can
 *    never leak cross-tenant rows.
 *  - Tables used during authentication (users, tenants, revoked_tokens) are
 *    NOT forced — auth queries run before any tenant context is established
 *    and need unrestricted access.
 *  - Admin bypass is achieved via `SET LOCAL row_security = off` in an
 *    explicit transaction (see runAsAdmin in server/tenant-context.ts).
 */
export async function setupRLS(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      -- ── Helper: read current tenant from session variable ──────────────────
      -- STABLE means Postgres can cache the result within a single query,
      -- which is critical for user_id-based policies that call this in a
      -- subquery evaluated once per candidate row.
      CREATE OR REPLACE FUNCTION current_tenant_id()
      RETURNS TEXT STABLE LANGUAGE SQL AS $$
        SELECT NULLIF(current_setting('app.current_tenant', TRUE), '')
      $$;

      -- ── Helper: set of user IDs belonging to the current tenant ────────────
      -- Used by all tables that are scoped by user_id rather than tenant_id.
      CREATE OR REPLACE FUNCTION current_tenant_user_ids()
      RETURNS SETOF TEXT STABLE LANGUAGE SQL AS $$
        SELECT id FROM users WHERE tenant_id = current_tenant_id()
      $$;
    `);

    // ── Group A: tables with a direct tenant_id column ──────────────────────
    const tenantIdTables = [
      "branches",
      "audit_logs",
      "invite_tokens",
      "or_sequences",
      "sales",
      "role_permissions",
      "tenant_subscriptions",
      "subscription_payments",
      "ai_memories",
    ];

    for (const t of tenantIdTables) {
      await client.query(`
        ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON ${t};
        CREATE POLICY tenant_isolation ON ${t}
          USING  (tenant_id = current_tenant_id())
          WITH CHECK (tenant_id = current_tenant_id());
      `);
    }

    // ── Group B: tables scoped by user_id (resolved via users.tenant_id) ───
    const userIdTables = [
      "products",
      "tables",
      "customers",
      "expenses",
      "shifts",
      "discount_codes",
      "service_staff",
      "service_rooms",
      "appointments",
      "membership_plans",
      "memberships",
      "membership_check_ins",
      "time_logs",
      "ingredients",
      "wifi_vouchers",
      "payroll_periods",
      "notifications",
      "stock_logs",
      "waste_log",
      "stock_transfers",
      "loyalty_tiers",
      "loyalty_rewards",
      "loyalty_points_log",
      "push_subscriptions",
      "user_branches",
      "pending_orders",
      "refunds",
      "suppliers",
      "purchase_orders",
      "user_settings",
    ];

    for (const t of userIdTables) {
      await client.query(`
        ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON ${t};
        CREATE POLICY tenant_isolation ON ${t}
          USING  (user_id IN (SELECT current_tenant_user_ids()))
          WITH CHECK (user_id IN (SELECT current_tenant_user_ids()));
      `);
    }

    // ── Group C: child tables without a direct user_id or tenant_id ─────────

    // product_sizes / product_modifiers / product_recipes → via products
    for (const t of ["product_sizes", "product_modifiers", "product_recipes"]) {
      await client.query(`
        ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON ${t};
        CREATE POLICY tenant_isolation ON ${t}
          USING (
            product_id IN (
              SELECT id FROM products WHERE user_id IN (SELECT current_tenant_user_ids())
            )
          )
          WITH CHECK (
            product_id IN (
              SELECT id FROM products WHERE user_id IN (SELECT current_tenant_user_ids())
            )
          );
      `);
    }

    // purchase_order_items → via purchase_orders
    await client.query(`
      ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
      ALTER TABLE purchase_order_items FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON purchase_order_items;
      CREATE POLICY tenant_isolation ON purchase_order_items
        USING (
          purchase_order_id IN (
            SELECT id FROM purchase_orders WHERE user_id IN (SELECT current_tenant_user_ids())
          )
        )
        WITH CHECK (
          purchase_order_id IN (
            SELECT id FROM purchase_orders WHERE user_id IN (SELECT current_tenant_user_ids())
          )
        );
    `);

    // supplier_products → via suppliers
    await client.query(`
      ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;
      ALTER TABLE supplier_products FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON supplier_products;
      CREATE POLICY tenant_isolation ON supplier_products
        USING (
          supplier_id IN (
            SELECT id FROM suppliers WHERE user_id IN (SELECT current_tenant_user_ids())
          )
        )
        WITH CHECK (
          supplier_id IN (
            SELECT id FROM suppliers WHERE user_id IN (SELECT current_tenant_user_ids())
          )
        );
    `);

    // stock_transfer_items → via stock_transfers
    await client.query(`
      ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;
      ALTER TABLE stock_transfer_items FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON stock_transfer_items;
      CREATE POLICY tenant_isolation ON stock_transfer_items
        USING (
          transfer_id IN (
            SELECT id FROM stock_transfers WHERE user_id IN (SELECT current_tenant_user_ids())
          )
        )
        WITH CHECK (
          transfer_id IN (
            SELECT id FROM stock_transfers WHERE user_id IN (SELECT current_tenant_user_ids())
          )
        );
    `);

    // payroll_entries → via employee_user_id (must be in same tenant)
    await client.query(`
      ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE payroll_entries FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON payroll_entries;
      CREATE POLICY tenant_isolation ON payroll_entries
        USING (
          employee_user_id IN (SELECT current_tenant_user_ids())
        )
        WITH CHECK (
          employee_user_id IN (SELECT current_tenant_user_ids())
        );
    `);

    // ── Group D: users — RLS enabled but NOT forced ─────────────────────────
    // Auth queries (login, token validation) run as the postgres superuser
    // BEFORE any tenant context is set.  Superusers bypass non-forced RLS,
    // so login can still look up any user by email.
    // Tenant-scoped requests run with SET LOCAL app.current_tenant, which
    // passes through the policy and limits visibility to same-tenant users.
    await client.query(`
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON users;
      CREATE POLICY tenant_isolation ON users
        USING  (tenant_id = current_tenant_id() OR tenant_id IS NULL)
        WITH CHECK (tenant_id = current_tenant_id() OR tenant_id IS NULL);
    `);

    console.log("[rls] ✓ Row-Level Security policies applied to all tenant tables");
  } catch (err) {
    console.error("[rls] ✗ Failed to apply RLS policies:", err);
    throw err;
  } finally {
    client.release();
  }
}
