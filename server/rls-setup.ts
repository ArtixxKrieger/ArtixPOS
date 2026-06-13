import { pool } from "./db";

export async function setupRLS(): Promise<void> {
  const client = await pool.connect();
  try {

await client.query(`
      DO $$
      BEGIN
        -- Grant BYPASSRLS to whichever role the app pool connects as.
        -- Fails silently on managed DBs where we lack ALTER ROLE privilege.
        EXECUTE format('ALTER ROLE %I BYPASSRLS', current_user);
      EXCEPTION WHEN others THEN
        RAISE WARNING '[rls] Could not grant BYPASSRLS to %: % — dbSystem will rely on non-forced RLS instead',
          current_user, SQLERRM;
      END
      $$;

      DO $$
      BEGIN
        -- Allow the pool user to switch into artixpos_app via SET LOCAL ROLE.
        -- Required so tenant-context middleware can enforce RLS on tenant requests.
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'artixpos_app') THEN
          EXECUTE format('GRANT artixpos_app TO %I', current_user);
        END IF;
      EXCEPTION WHEN others THEN
        RAISE WARNING '[rls] Could not grant artixpos_app to %: %', current_user, SQLERRM;
      END
      $$;
    `);

await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'artixpos_app') THEN
          CREATE ROLE artixpos_app
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOREPLICATION NOBYPASSRLS;
        END IF;
      END
      $$;

      -- Broad DML grant on all existing tables/sequences so artixpos_app can
      -- read and write data.  RLS policies are the real access control layer.
      GRANT SELECT, INSERT, UPDATE, DELETE
        ON ALL TABLES IN SCHEMA public TO artixpos_app;
      GRANT USAGE, SELECT
        ON ALL SEQUENCES IN SCHEMA public TO artixpos_app;
    `);

await client.query(`
      -- Read the tenant ID the middleware stored in the session variable.
      -- STABLE lets Postgres cache the result within one query execution.
      -- SET search_path = '' prevents search-path injection (Supabase advisor).
      CREATE OR REPLACE FUNCTION public.current_tenant_id()
      RETURNS TEXT STABLE LANGUAGE SQL
      SECURITY INVOKER
      SET search_path = ''
      AS $$
        SELECT NULLIF(current_setting('app.current_tenant', TRUE), '')
      $$;

      -- Return every user ID that belongs to the current tenant.
      -- SECURITY DEFINER runs this as the function owner (postgres/superuser)
      -- so it can SELECT from the users table without being blocked by the
      -- users table's own RLS policy — preventing a circular dependency.
      -- The WHERE clause still limits results to the current tenant.
      -- SET search_path = '' prevents search-path injection; table names are
      -- fully-qualified to compensate.
      CREATE OR REPLACE FUNCTION public.current_tenant_user_ids()
      RETURNS SETOF TEXT STABLE LANGUAGE SQL
      SECURITY DEFINER
      SET search_path = ''
      AS $$
        SELECT id FROM public.users WHERE tenant_id = public.current_tenant_id()
      $$;

      -- Revoke execute from PUBLIC so only the app role can call this
      -- SECURITY DEFINER function (Supabase-specific anon/authenticated
      -- roles are skipped here — they do not exist on Replit PostgreSQL).
      REVOKE EXECUTE ON FUNCTION public.current_tenant_user_ids() FROM PUBLIC;

      -- Make sure artixpos_app can call both helpers.
      GRANT EXECUTE ON FUNCTION public.current_tenant_id()       TO artixpos_app;
      GRANT EXECUTE ON FUNCTION public.current_tenant_user_ids() TO artixpos_app;
    `);

const tenantIdTables = [
      "branches",
      "audit_logs",
      "or_sequences",
      "sales",
      "role_permissions",
      "tenant_subscriptions",
      "subscription_payments",
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

await client.query(`
      ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE user_settings NO FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON user_settings;
      CREATE POLICY tenant_isolation ON user_settings
        USING  (user_id IN (SELECT current_tenant_user_ids()))
        WITH CHECK (user_id IN (SELECT current_tenant_user_ids()));
    `);

for (const t of ["product_sizes", "product_modifiers", "product_recipes"]) {
      await client.query(`
        ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON ${t};
        CREATE POLICY tenant_isolation ON ${t}
          USING (
            product_id IN (
              SELECT id FROM products
              WHERE user_id IN (SELECT current_tenant_user_ids())
            )
          )
          WITH CHECK (
            product_id IN (
              SELECT id FROM products
              WHERE user_id IN (SELECT current_tenant_user_ids())
            )
          );
      `);
    }

await client.query(`
      ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
      ALTER TABLE purchase_order_items FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON purchase_order_items;
      CREATE POLICY tenant_isolation ON purchase_order_items
        USING (
          purchase_order_id IN (
            SELECT id FROM purchase_orders
            WHERE user_id IN (SELECT current_tenant_user_ids())
          )
        )
        WITH CHECK (
          purchase_order_id IN (
            SELECT id FROM purchase_orders
            WHERE user_id IN (SELECT current_tenant_user_ids())
          )
        );
    `);

await client.query(`
      ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;
      ALTER TABLE supplier_products FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON supplier_products;
      CREATE POLICY tenant_isolation ON supplier_products
        USING (
          supplier_id IN (
            SELECT id FROM suppliers
            WHERE user_id IN (SELECT current_tenant_user_ids())
          )
        )
        WITH CHECK (
          supplier_id IN (
            SELECT id FROM suppliers
            WHERE user_id IN (SELECT current_tenant_user_ids())
          )
        );
    `);

await client.query(`
      ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;
      ALTER TABLE stock_transfer_items FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON stock_transfer_items;
      CREATE POLICY tenant_isolation ON stock_transfer_items
        USING (
          transfer_id IN (
            SELECT id FROM stock_transfers
            WHERE user_id IN (SELECT current_tenant_user_ids())
          )
        )
        WITH CHECK (
          transfer_id IN (
            SELECT id FROM stock_transfers
            WHERE user_id IN (SELECT current_tenant_user_ids())
          )
        );
    `);

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

await client.query(`
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON users;
      CREATE POLICY tenant_isolation ON users
        USING  (
          current_user <> 'artixpos_app'
          OR tenant_id IS NULL
          OR tenant_id = current_tenant_id()
        )
        WITH CHECK (
          current_user <> 'artixpos_app'
          OR tenant_id IS NULL
          OR tenant_id = current_tenant_id()
        );
    `);

await client.query(`
      ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON tenants;
      CREATE POLICY tenant_isolation ON tenants
        USING  (id = current_tenant_id())
        WITH CHECK (id = current_tenant_id());
    `);

await client.query(`
      ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON revoked_tokens;
      CREATE POLICY tenant_isolation ON revoked_tokens
        USING  (user_id IN (SELECT current_tenant_user_ids()))
        WITH CHECK (user_id IN (SELECT current_tenant_user_ids()));
    `);

await client.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_user_id     ON appointments(user_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_branch_id   ON appointments(branch_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_customer_id ON appointments(customer_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_staff_id    ON appointments(staff_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_room_id     ON appointments(room_id);
    `);

    console.log("[rls] ✓ Row-Level Security policies applied to all tenant tables");
  } catch (err) {
    console.error("[rls] ✗ Failed to apply RLS policies:", err);
    throw err;
  } finally {
    client.release();
  }
}
