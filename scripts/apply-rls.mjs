/**
 * Apply all RLS policies to the database.
 * Plain ESM JavaScript — runs with just `node scripts/apply-rls.mjs`.
 * No tsx, no TypeScript compiler needed.
 */
import pg from "pg";
const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_POOLER_URL ||
  process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
  console.error(
    "[rls] ✗ No database connection string found.\n" +
    "      Set DATABASE_URL, SUPABASE_POOLER_URL, or SUPABASE_DATABASE_URL."
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: !connectionString.includes("localhost") ? { rejectUnauthorized: false } : false,
  max: 2,
  connectionTimeoutMillis: 15_000,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log("[rls] Connected. Applying policies…\n");

    // ── 1. App role ────────────────────────────────────────────────────────
    console.log("[rls] 1/9 — artixpos_app role");
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'artixpos_app') THEN
          CREATE ROLE artixpos_app
            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
        END IF;
      END $$;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO artixpos_app;
      GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO artixpos_app;
    `);

    // ── 2. Helper functions (fixed search_path) ────────────────────────────
    console.log("[rls] 2/9 — helper functions");
    await client.query(`
      CREATE OR REPLACE FUNCTION public.current_tenant_id()
      RETURNS TEXT STABLE LANGUAGE SQL SECURITY INVOKER SET search_path = '' AS $$
        SELECT NULLIF(current_setting('app.current_tenant', TRUE), '')
      $$;

      CREATE OR REPLACE FUNCTION public.current_tenant_user_ids()
      RETURNS SETOF TEXT STABLE LANGUAGE SQL SECURITY DEFINER SET search_path = '' AS $$
        SELECT id FROM public.users WHERE tenant_id = public.current_tenant_id()
      $$;

      REVOKE EXECUTE ON FUNCTION public.current_tenant_user_ids() FROM PUBLIC;
      GRANT  EXECUTE ON FUNCTION public.current_tenant_id()       TO artixpos_app;
      GRANT  EXECUTE ON FUNCTION public.current_tenant_user_ids() TO artixpos_app;
    `);

    // ── 3. Group A — tenant_id tables (FORCE RLS) ─────────────────────────
    console.log("[rls] 3/9 — Group A: tenant_id tables");
    for (const t of [
      "branches", "audit_logs", "invite_tokens", "or_sequences",
      "sales", "role_permissions", "tenant_subscriptions",
      "subscription_payments", "ai_memories",
    ]) {
      await client.query(`
        ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.${t} FORCE  ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON public.${t};
        CREATE POLICY tenant_isolation ON public.${t}
          USING  (tenant_id = public.current_tenant_id())
          WITH CHECK (tenant_id = public.current_tenant_id());
      `);
    }

    // ── 4. Group B — user_id tables (FORCE RLS) ───────────────────────────
    console.log("[rls] 4/9 — Group B: user_id tables");
    for (const t of [
      "products", "tables", "customers", "expenses", "shifts",
      "discount_codes", "service_staff", "service_rooms", "appointments",
      "membership_plans", "memberships", "membership_check_ins", "time_logs",
      "ingredients", "wifi_vouchers", "payroll_periods", "notifications",
      "stock_logs", "waste_log", "stock_transfers", "loyalty_tiers",
      "loyalty_rewards", "loyalty_points_log", "push_subscriptions",
      "user_branches", "pending_orders", "refunds", "suppliers",
      "purchase_orders", "user_settings",
    ]) {
      await client.query(`
        ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.${t} FORCE  ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON public.${t};
        CREATE POLICY tenant_isolation ON public.${t}
          USING  (user_id IN (SELECT public.current_tenant_user_ids()))
          WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));
      `);
    }

    // ── 5. Group C — child tables (FORCE RLS) ─────────────────────────────
    console.log("[rls] 5/9 — Group C: child tables");
    for (const t of ["product_sizes", "product_modifiers", "product_recipes"]) {
      await client.query(`
        ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE public.${t} FORCE  ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON public.${t};
        CREATE POLICY tenant_isolation ON public.${t}
          USING  (product_id IN (SELECT id FROM public.products WHERE user_id IN (SELECT public.current_tenant_user_ids())))
          WITH CHECK (product_id IN (SELECT id FROM public.products WHERE user_id IN (SELECT public.current_tenant_user_ids())));
      `);
    }
    await client.query(`
      ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.purchase_order_items FORCE  ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON public.purchase_order_items;
      CREATE POLICY tenant_isolation ON public.purchase_order_items
        USING  (purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE user_id IN (SELECT public.current_tenant_user_ids())))
        WITH CHECK (purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE user_id IN (SELECT public.current_tenant_user_ids())));

      ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.supplier_products FORCE  ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON public.supplier_products;
      CREATE POLICY tenant_isolation ON public.supplier_products
        USING  (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id IN (SELECT public.current_tenant_user_ids())))
        WITH CHECK (supplier_id IN (SELECT id FROM public.suppliers WHERE user_id IN (SELECT public.current_tenant_user_ids())));

      ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.stock_transfer_items FORCE  ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON public.stock_transfer_items;
      CREATE POLICY tenant_isolation ON public.stock_transfer_items
        USING  (transfer_id IN (SELECT id FROM public.stock_transfers WHERE user_id IN (SELECT public.current_tenant_user_ids())))
        WITH CHECK (transfer_id IN (SELECT id FROM public.stock_transfers WHERE user_id IN (SELECT public.current_tenant_user_ids())));

      ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.payroll_entries FORCE  ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON public.payroll_entries;
      CREATE POLICY tenant_isolation ON public.payroll_entries
        USING  (employee_user_id IN (SELECT public.current_tenant_user_ids()))
        WITH CHECK (employee_user_id IN (SELECT public.current_tenant_user_ids()));
    `);

    // ── 6. users (RLS on, NOT forced) ─────────────────────────────────────
    console.log("[rls] 6/9 — users");
    await client.query(`
      ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON public.users;
      CREATE POLICY tenant_isolation ON public.users
        USING  (tenant_id = public.current_tenant_id())
        WITH CHECK (tenant_id = public.current_tenant_id());
    `);

    // ── 7. tenants (RLS on, NOT forced) ───────────────────────────────────
    console.log("[rls] 7/9 — tenants");
    await client.query(`
      ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON public.tenants;
      CREATE POLICY tenant_isolation ON public.tenants
        USING  (id = public.current_tenant_id())
        WITH CHECK (id = public.current_tenant_id());
    `);

    // ── 8. revoked_tokens (RLS on, NOT forced) ────────────────────────────
    console.log("[rls] 8/9 — revoked_tokens");
    await client.query(`
      ALTER TABLE public.revoked_tokens ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON public.revoked_tokens;
      CREATE POLICY tenant_isolation ON public.revoked_tokens
        USING  (user_id IN (SELECT public.current_tenant_user_ids()))
        WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));
    `);

    // ── 9. FK indexes ──────────────────────────────────────────────────────
    console.log("[rls] 9/9 — FK indexes");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_user_id     ON public.appointments(user_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_branch_id   ON public.appointments(branch_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_customer_id ON public.appointments(customer_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_staff_id    ON public.appointments(staff_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_room_id     ON public.appointments(room_id);
    `);

    console.log("\n[rls] ✓ All RLS policies applied successfully.");
  } catch (err) {
    console.error("\n[rls] ✗ Failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
