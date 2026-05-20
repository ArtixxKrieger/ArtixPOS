-- ============================================================
-- MASTER RLS FIX — paste into Supabase SQL Editor and run
-- Covers every table flagged in the Security Advisor.
-- Safe to re-run at any time (all statements are idempotent).
-- ============================================================


-- ── STEP 1: App role ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'artixpos_app') THEN
    CREATE ROLE artixpos_app
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO artixpos_app;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO artixpos_app;


-- ── STEP 2: Helper functions (fixed search_path) ─────────────
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS TEXT STABLE LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT NULLIF(current_setting('app.current_tenant', TRUE), '')
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_user_ids()
RETURNS SETOF TEXT STABLE LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.users WHERE tenant_id = public.current_tenant_id()
$$;

-- Restrict SECURITY DEFINER function to app role only
REVOKE EXECUTE ON FUNCTION public.current_tenant_user_ids() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_tenant_id()       TO artixpos_app;
GRANT  EXECUTE ON FUNCTION public.current_tenant_user_ids() TO artixpos_app;


-- ── STEP 3: Group A — tables with tenant_id column ───────────
-- These are FORCED so even the table owner is restricted.

ALTER TABLE public.branches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches             FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.branches;
CREATE POLICY tenant_isolation ON public.branches
  USING  (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.audit_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs           FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.audit_logs;
CREATE POLICY tenant_isolation ON public.audit_logs
  USING  (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.invite_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_tokens        FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.invite_tokens;
CREATE POLICY tenant_isolation ON public.invite_tokens
  USING  (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.or_sequences         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.or_sequences         FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.or_sequences;
CREATE POLICY tenant_isolation ON public.or_sequences
  USING  (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.sales                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales                FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.sales;
CREATE POLICY tenant_isolation ON public.sales
  USING  (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.role_permissions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions     FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.role_permissions;
CREATE POLICY tenant_isolation ON public.role_permissions
  USING  (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.tenant_subscriptions;
CREATE POLICY tenant_isolation ON public.tenant_subscriptions
  USING  (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.subscription_payments;
CREATE POLICY tenant_isolation ON public.subscription_payments
  USING  (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.ai_memories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_memories          FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.ai_memories;
CREATE POLICY tenant_isolation ON public.ai_memories
  USING  (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());


-- ── STEP 4: Group B — tables scoped by user_id ───────────────

ALTER TABLE public.products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products             FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.products;
CREATE POLICY tenant_isolation ON public.products
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.tables               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables               FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.tables;
CREATE POLICY tenant_isolation ON public.tables
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers            FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.customers;
CREATE POLICY tenant_isolation ON public.customers
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses             FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.expenses;
CREATE POLICY tenant_isolation ON public.expenses
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.shifts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts               FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.shifts;
CREATE POLICY tenant_isolation ON public.shifts
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.discount_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_codes       FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.discount_codes;
CREATE POLICY tenant_isolation ON public.discount_codes
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.service_staff        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_staff        FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.service_staff;
CREATE POLICY tenant_isolation ON public.service_staff
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.service_rooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_rooms        FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.service_rooms;
CREATE POLICY tenant_isolation ON public.service_rooms
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.appointments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments         FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.appointments;
CREATE POLICY tenant_isolation ON public.appointments
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.membership_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_plans     FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.membership_plans;
CREATE POLICY tenant_isolation ON public.membership_plans
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.memberships          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships          FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.memberships;
CREATE POLICY tenant_isolation ON public.memberships
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.membership_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_check_ins FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.membership_check_ins;
CREATE POLICY tenant_isolation ON public.membership_check_ins
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.time_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_logs            FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.time_logs;
CREATE POLICY tenant_isolation ON public.time_logs
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.ingredients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients          FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.ingredients;
CREATE POLICY tenant_isolation ON public.ingredients
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.wifi_vouchers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wifi_vouchers        FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.wifi_vouchers;
CREATE POLICY tenant_isolation ON public.wifi_vouchers
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.payroll_periods      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_periods      FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.payroll_periods;
CREATE POLICY tenant_isolation ON public.payroll_periods
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications        FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.notifications;
CREATE POLICY tenant_isolation ON public.notifications
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.stock_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_logs           FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.stock_logs;
CREATE POLICY tenant_isolation ON public.stock_logs
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.waste_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_log            FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.waste_log;
CREATE POLICY tenant_isolation ON public.waste_log
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.stock_transfers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers      FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.stock_transfers;
CREATE POLICY tenant_isolation ON public.stock_transfers
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.loyalty_tiers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_tiers        FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.loyalty_tiers;
CREATE POLICY tenant_isolation ON public.loyalty_tiers
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.loyalty_rewards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_rewards      FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.loyalty_rewards;
CREATE POLICY tenant_isolation ON public.loyalty_rewards
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.loyalty_points_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_points_log   FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.loyalty_points_log;
CREATE POLICY tenant_isolation ON public.loyalty_points_log
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.push_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions   FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.push_subscriptions;
CREATE POLICY tenant_isolation ON public.push_subscriptions
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.user_branches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_branches        FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.user_branches;
CREATE POLICY tenant_isolation ON public.user_branches
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.pending_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_orders       FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.pending_orders;
CREATE POLICY tenant_isolation ON public.pending_orders
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.refunds              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds              FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.refunds;
CREATE POLICY tenant_isolation ON public.refunds
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.suppliers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers            FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.suppliers;
CREATE POLICY tenant_isolation ON public.suppliers
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders      FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.purchase_orders;
CREATE POLICY tenant_isolation ON public.purchase_orders
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

ALTER TABLE public.user_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings        FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.user_settings;
CREATE POLICY tenant_isolation ON public.user_settings
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));


-- ── STEP 5: Group C — child tables ───────────────────────────

ALTER TABLE public.product_sizes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_sizes        FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.product_sizes;
CREATE POLICY tenant_isolation ON public.product_sizes
  USING (product_id IN (
    SELECT id FROM public.products
    WHERE user_id IN (SELECT public.current_tenant_user_ids())
  ))
  WITH CHECK (product_id IN (
    SELECT id FROM public.products
    WHERE user_id IN (SELECT public.current_tenant_user_ids())
  ));

ALTER TABLE public.product_modifiers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_modifiers    FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.product_modifiers;
CREATE POLICY tenant_isolation ON public.product_modifiers
  USING (product_id IN (
    SELECT id FROM public.products
    WHERE user_id IN (SELECT public.current_tenant_user_ids())
  ))
  WITH CHECK (product_id IN (
    SELECT id FROM public.products
    WHERE user_id IN (SELECT public.current_tenant_user_ids())
  ));

ALTER TABLE public.product_recipes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_recipes      FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.product_recipes;
CREATE POLICY tenant_isolation ON public.product_recipes
  USING (product_id IN (
    SELECT id FROM public.products
    WHERE user_id IN (SELECT public.current_tenant_user_ids())
  ))
  WITH CHECK (product_id IN (
    SELECT id FROM public.products
    WHERE user_id IN (SELECT public.current_tenant_user_ids())
  ));

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.purchase_order_items;
CREATE POLICY tenant_isolation ON public.purchase_order_items
  USING (purchase_order_id IN (
    SELECT id FROM public.purchase_orders
    WHERE user_id IN (SELECT public.current_tenant_user_ids())
  ))
  WITH CHECK (purchase_order_id IN (
    SELECT id FROM public.purchase_orders
    WHERE user_id IN (SELECT public.current_tenant_user_ids())
  ));

ALTER TABLE public.supplier_products    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products    FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.supplier_products;
CREATE POLICY tenant_isolation ON public.supplier_products
  USING (supplier_id IN (
    SELECT id FROM public.suppliers
    WHERE user_id IN (SELECT public.current_tenant_user_ids())
  ))
  WITH CHECK (supplier_id IN (
    SELECT id FROM public.suppliers
    WHERE user_id IN (SELECT public.current_tenant_user_ids())
  ));

ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.stock_transfer_items;
CREATE POLICY tenant_isolation ON public.stock_transfer_items
  USING (transfer_id IN (
    SELECT id FROM public.stock_transfers
    WHERE user_id IN (SELECT public.current_tenant_user_ids())
  ))
  WITH CHECK (transfer_id IN (
    SELECT id FROM public.stock_transfers
    WHERE user_id IN (SELECT public.current_tenant_user_ids())
  ));

ALTER TABLE public.payroll_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_entries      FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.payroll_entries;
CREATE POLICY tenant_isolation ON public.payroll_entries
  USING  (employee_user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (employee_user_id IN (SELECT public.current_tenant_user_ids()));


-- ── STEP 6: Auth tables — RLS ON but NOT forced ───────────────
-- postgres superuser bypasses non-forced RLS, so auth/login
-- routes (which run as postgres) still work without a tenant context.

ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.users;
CREATE POLICY tenant_isolation ON public.users
  USING  (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.tenants              ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.tenants;
CREATE POLICY tenant_isolation ON public.tenants
  USING  (id = public.current_tenant_id())
  WITH CHECK (id = public.current_tenant_id());

ALTER TABLE public.revoked_tokens       ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.revoked_tokens;
CREATE POLICY tenant_isolation ON public.revoked_tokens
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));


-- ── STEP 7: Missing FK indexes ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_user_id
  ON public.appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_branch_id
  ON public.appointments(branch_id);
CREATE INDEX IF NOT EXISTS idx_appointments_customer_id
  ON public.appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_staff_id
  ON public.appointments(staff_id);
CREATE INDEX IF NOT EXISTS idx_appointments_room_id
  ON public.appointments(room_id);

-- Done — refresh the Supabase Security Advisor to confirm.
