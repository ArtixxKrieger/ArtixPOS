-- ============================================================
-- Fix Supabase Security Advisor Warnings
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. Fix Function Search Path Mutable ─────────────────────
-- Adds SET search_path = '' to prevent search-path injection attacks.
-- Table names are fully-qualified (public.) to compensate.

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

-- ── 2. Fix Public/Signed-In Can Execute SECURITY DEFINER Function ──
-- Revoke broad PUBLIC execute privilege; only the app role needs it.

REVOKE EXECUTE ON FUNCTION public.current_tenant_user_ids() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.current_tenant_user_ids() TO artixpos_app;
GRANT  EXECUTE ON FUNCTION public.current_tenant_id()       TO artixpos_app;

-- ── 3. Fix RLS Disabled on public.tenants (CRITICAL) ────────
-- Enable RLS but do NOT force it — the postgres superuser must still
-- be able to do cross-tenant lookups (slug resolution, login).
-- artixpos_app (tenant-scoped requests) will be limited to one tenant.

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.tenants;
CREATE POLICY tenant_isolation ON public.tenants
  USING  (id = public.current_tenant_id())
  WITH CHECK (id = public.current_tenant_id());

-- ── 4. Fix RLS Disabled on public.revoked_tokens (CRITICAL) ─
-- Auth middleware (postgres role) checks tokens before any tenant context
-- is set, so non-forced RLS lets it see all rows.
-- artixpos_app is restricted to tokens of the current tenant's users.

ALTER TABLE public.revoked_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.revoked_tokens;
CREATE POLICY tenant_isolation ON public.revoked_tokens
  USING  (user_id IN (SELECT public.current_tenant_user_ids()))
  WITH CHECK (user_id IN (SELECT public.current_tenant_user_ids()));

-- ── 5. Fix Unindexed Foreign Keys on public.appointments ────
-- Creates indexes on all FK columns that were missing them.

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

-- ── Done ─────────────────────────────────────────────────────
-- After running this, refresh the Supabase Security Advisor —
-- all listed warnings should be resolved.
