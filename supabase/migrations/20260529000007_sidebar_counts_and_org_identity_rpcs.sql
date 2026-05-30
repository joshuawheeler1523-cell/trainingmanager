-- Two round-trip-reduction RPCs for the (authenticated) layout.
--
-- The layout currently fires ~10 separate HTTP round-trips to Supabase
-- before content reaches the browser. At your data scale, per-query
-- *computation* is microseconds; the cost is the ~30-50ms network latency
-- per round-trip. This collapses 4 of those round-trips into 1, saving
-- roughly 100-150ms on every page load.
--
-- 1. sidebar_counts(p_org_id) — returns work-intake, request-queue, and
--    one-on-ones counts in a single call. Replaces 3 separate head-only
--    COUNT queries the layout used to fire in parallel.
--
-- 2. org_identity(p_org_id) — returns organizations.preset_key + label
--    overrides + the relevant module feature flags + the caller's role in
--    the org, all in one row. Replaces:
--      - organizations SELECT
--      - feature_flags SELECT (filtered to module.* keys)
--      - user_role_in_org RPC (called from getOrgIdentity)
--      - is_manager RPC (the layout called this separately too)
--
-- Both are SECURITY INVOKER + SET search_path = ''; RLS on the underlying
-- tables (organizations, feature_flags, tras, education_requests, one_on_ones)
-- enforces the access boundary — callers see counts/identity only for orgs
-- they're a member of.

-- ── sidebar_counts(p_org_id) ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sidebar_counts(p_org_id uuid)
RETURNS TABLE(
  work_intake_count int,
  request_queue_count int,
  one_on_ones_count int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    (SELECT COUNT(*)::int FROM public.tras
       WHERE org_id = p_org_id
         AND status = ANY(ARRAY['draft','documented','submitted','approved'])),
    (SELECT COUNT(*)::int FROM public.education_requests
       WHERE org_id = p_org_id
         AND status = ANY(ARRAY['new','under_review'])
         AND deleted_at IS NULL),
    (SELECT COUNT(*)::int FROM public.one_on_ones
       WHERE org_id = p_org_id
         AND completed_at IS NULL
         AND scheduled_for >= now()
         AND scheduled_for <= now() + interval '7 days');
$$;

REVOKE EXECUTE ON FUNCTION public.sidebar_counts(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sidebar_counts(uuid) TO authenticated;

COMMENT ON FUNCTION public.sidebar_counts(uuid) IS
  'Single-call helper for the authenticated layout sidebar. Returns work-intake, request-queue, and one-on-ones counts for the given org. SECURITY INVOKER — underlying-table RLS enforces access scoping.';

-- ── org_identity(p_org_id) ─────────────────────────────────────────────────
--
-- Returns one row. module_flags is a jsonb object like
--   {"module.classes": true, "module.training_planner": false, ...}
-- with only the keys explicitly set in feature_flags; the TS caller layers
-- in the defaults (hospital_training preset → all on).
--
-- user_role is the result of user_role_in_org for the caller — included so
-- the layout doesn't have to fire a second is_manager RPC.

CREATE OR REPLACE FUNCTION public.org_identity(p_org_id uuid)
RETURNS TABLE(
  preset_key text,
  role_labels jsonb,
  entity_labels jsonb,
  module_flags jsonb,
  user_role text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    o.preset_key,
    o.role_labels,
    o.entity_labels,
    (SELECT jsonb_object_agg(ff.key, ff.enabled)
       FROM public.feature_flags ff
       WHERE ff.org_id = p_org_id
         AND ff.key IN ('module.classes','module.training_planner','module.education_requests')
    ),
    public.user_role_in_org(p_org_id)
  FROM public.organizations o
  WHERE o.id = p_org_id;
$$;

REVOKE EXECUTE ON FUNCTION public.org_identity(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.org_identity(uuid) TO authenticated;

COMMENT ON FUNCTION public.org_identity(uuid) IS
  'Single-call helper resolving the workspace identity (preset_key, role/entity label overrides, module feature flags, and the caller''s role) for the given org. SECURITY INVOKER — organizations + feature_flags RLS enforces access.';
