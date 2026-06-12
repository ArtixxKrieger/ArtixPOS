import { pool } from "./db";

/**
 * Applies PostgreSQL Row-Level Security (RLS) policies to every tenant-scoped
 * table.  Safe to call on every startup — all statements are idempotent.
 *
 * Design:
 *  - A non-superuser role `artixpos_app` is created and granted all DML
 *    privileges on every table.  Per-request tenant transactions switch to
 *    this role via `SET LOCAL ROLE artixpos_app` so RLS is enforced — even
 *    though the pool connects as the `postgres` superuser (who normally
 *    bypasses RLS, including FORCE ROW LEVEL SECURITY).
 *
 *  - `current_tenant_id()` reads the session variable `app.current_tenant`
 *    set by tenantContextMiddleware.
 *
 *  - `current_tenant_user_ids()` is SECURITY DEFINER (runs as its owner,
 *    `postgres`) so it can query the `users` table without hitting `users`
 *    own RLS policy — avoiding a circular dependency where the product
 *    policy asks "which users?" and the users policy asks "which tenant?"
 *    using the same call stack.
 *
 *  - FORCE ROW LEVEL SECURITY on all tenant tables forces the policies to
 *    apply even to the table owner role.  Superuser (postgres) is still
 *    exempt — that is intentional: auth routes and runAsAdmin run as postgres
 *    and need cross-tenant access.
 *
 *  - Tables used during authentication (users, tenants, revoked_tokens) are
 *    NOT forced — auth queries run before any tenant context is established.
 *
 *  - Admin bypass is achieved via runAsAdmin in server/tenant-context.ts,
 *    which never calls SET LOCAL ROLE artixpos_app (stays as postgres).
 */
export async function setupRLS(): Promise<void> {
  const client = await pool.connect();
  try {
    // ── 0. Grant BYPASSRLS to the connecting pool user + membership in artixpos_app
    // dbSystem (server/storage.ts) runs queries as the pool owner role — it is
    // intentionally NOT routed through artixpos_app so it can bypass RLS for
    // cross-user admin operations (e.g. settings upsert, auth lookups).
    // On Replit's managed PostgreSQL the pool owner is often NOT a superuser,
    // so FORCE ROW LEVEL SECURITY would still block it.  Granting BYPASSRLS
    // ensures dbSystem can always read/write freely while artixpos_app (used for
    // tenant-scoped requests) remains fully subject to policies.
    //
    // We also GRANT artixpos_app TO current_user so that tenant-context middleware
    // can issue SET LOCAL ROLE artixpos_app.  Without this grant, SET LOCAL ROLE
    // fails with "permission denied to set role", which — even when caught in JS —
    // aborts the open PostgreSQL transaction and causes every subsequent query on
    // the same connection to fail with 25P02 ("current transaction is aborted").
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

    // ── 1. Create non-superuser app role ──────────────────────────────────────
    // `artixpos_app` has no SUPERUSER and no BYPASSRLS — so every query it
    // runs is fully subject to the RLS policies defined below.
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

    // ── 2. Helper functions ───────────────────────────────────────────────────
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

    // ── 3. Group A: tables with a direct tenant_id column ────────────────────
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

    // ── 4. Group B: tables scoped by user_id (via users.tenant_id) ───────────
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

    // ── 4b. user_settings — ENABLE but NOT FORCE ──────────────────────────────
    // user_settings is accessed by dbSystem (the pool owner role) for upserts
    // during onboarding and settings saves.  FORCE ROW LEVEL SECURITY would
    // block the pool owner if it doesn't have BYPASSRLS (which we attempt to
    // grant in step 0 but may not succeed on managed DBs).
    //
    // Non-forced RLS means: the pool owner (postgres / db owner) bypasses the
    // policy freely, while artixpos_app (used for tenant-scoped requests) is
    // still subject to the tenant_isolation policy.  All dbSystem queries use
    // an explicit WHERE user_id = ? clause so isolation is maintained at the
    // application level.
    await client.query(`
      ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE user_settings NO FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON user_settings;
      CREATE POLICY tenant_isolation ON user_settings
        USING  (user_id IN (SELECT current_tenant_user_ids()))
        WITH CHECK (user_id IN (SELECT current_tenant_user_ids()));
    `);

    // ── 5. Group C: child tables (no direct user_id / tenant_id) ─────────────

    // product_sizes / product_modifiers / product_recipes → via products
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

    // purchase_order_items → via purchase_orders
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

    // supplier_products → via suppliers
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

    // stock_transfer_items → via stock_transfers
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

    // payroll_entries → via employee_user_id
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

    // ── 6. users — RLS enabled but NOT forced ─────────────────────────────────
    // Auth queries (login, token validation) run as postgres BEFORE any tenant
    // context is established.  On standard PostgreSQL the table owner (postgres)
    // bypasses non-forced RLS automatically.  On Supabase, however, the managed
    // postgres role is NOT a true superuser — so the RLS policy IS evaluated
    // even for non-forced tables.
    //
    // The Catch-22:
    //   A returning user has a non-null tenant_id in the DB. At login time,
    //   current_tenant_id() returns NULL (no tenant context yet).
    //   The old policy USING (tenant_id IS NULL OR tenant_id = current_tenant_id())
    //   evaluates:  FALSE  OR  (non-null = NULL) → FALSE OR NULL → NULL → row hidden.
    //   The DB returns 0 rows, findOrCreateUser inserts a NEW user, and the
    //   returning user is forced through onboarding again.
    //
    // Fix:
    //   Add a role check: when the query is running as the pool owner (postgres /
    //   any non-artixpos_app role), skip tenant filtering entirely.  artixpos_app
    //   always has a tenant context set by tenantContextMiddleware, so the normal
    //   isolation still applies for all in-session queries.
    //
    //   runAsAdmin (SET LOCAL row_security = off) remains as belt-and-suspenders:
    //   if the role check is insufficient on a given Postgres build the row_security
    //   flag provides a second layer of bypass.
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

    // ── 7. tenants — RLS enabled but NOT forced ───────────────────────────────
    // The postgres superuser (used for auth/admin) bypasses non-forced RLS so
    // cross-tenant lookups (slug resolution, login) still work.
    // artixpos_app (tenant-scoped requests) can only see the active tenant.
    await client.query(`
      ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON tenants;
      CREATE POLICY tenant_isolation ON tenants
        USING  (id = current_tenant_id())
        WITH CHECK (id = current_tenant_id());
    `);

    // ── 8. revoked_tokens — RLS enabled but NOT forced ────────────────────────
    // Auth middleware (running as postgres) needs to check any token freely.
    // artixpos_app is restricted to tokens belonging to the current tenant's users.
    await client.query(`
      ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON revoked_tokens;
      CREATE POLICY tenant_isolation ON revoked_tokens
        USING  (user_id IN (SELECT current_tenant_user_ids()))
        WITH CHECK (user_id IN (SELECT current_tenant_user_ids()));
    `);

    // ── 9. Indexes for unindexed foreign keys on appointments ─────────────────
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
