-- =============================================================================
-- Cleanup — Drop the deprecated is_org_admin SQL alias
-- =============================================================================
-- Phase 2 introduced public.is_org_admin(uuid) as a backward-compat alias
-- delegating to public.is_manager(uuid). Phase 7 removed all TS-side imports.
-- This migration finishes the cleanup by:
--   1. Iterating every RLS policy that still references is_org_admin in its
--      USING or WITH CHECK clause (~50 policies left after Phases 3+4).
--   2. Dropping each and recreating with is_manager substituted in.
--   3. Dropping the public.is_org_admin function.
--
-- Behavior is unchanged: is_org_admin was already an alias for is_manager.
--
-- DOWN (rollback):
--   create or replace function public.is_org_admin(p_org_id uuid)
--     returns boolean language sql stable security definer
--     set search_path = '' as $$ select public.is_manager(p_org_id); $$;
--   -- Then re-rewrite each policy substituting is_manager → is_org_admin.
-- =============================================================================

DO $rewrite$
DECLARE
  v_policy record;
  v_new_qual text;
  v_new_check text;
  v_create_sql text;
BEGIN
  FOR v_policy IN
    SELECT schemaname, tablename, policyname, permissive, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND (
          (qual IS NOT NULL AND qual LIKE '%is_org_admin%')
          OR (with_check IS NOT NULL AND with_check LIKE '%is_org_admin%')
        )
  LOOP
    -- Substitute the function name. Both bare and schema-qualified call sites
    -- become public.is_manager.
    v_new_qual := regexp_replace(
      coalesce(v_policy.qual, ''),
      '(\bpublic\.)?is_org_admin\(',
      'public.is_manager(',
      'g'
    );
    v_new_check := regexp_replace(
      coalesce(v_policy.with_check, ''),
      '(\bpublic\.)?is_org_admin\(',
      'public.is_manager(',
      'g'
    );

    -- Drop the old policy.
    EXECUTE format('DROP POLICY %I ON public.%I', v_policy.policyname, v_policy.tablename);

    -- Rebuild CREATE POLICY statement piece by piece.
    v_create_sql := format(
      'CREATE POLICY %I ON public.%I AS %s FOR %s',
      v_policy.policyname,
      v_policy.tablename,
      v_policy.permissive,
      v_policy.cmd
    );

    IF v_policy.qual IS NOT NULL THEN
      v_create_sql := v_create_sql || format(' USING (%s)', v_new_qual);
    END IF;

    IF v_policy.with_check IS NOT NULL THEN
      v_create_sql := v_create_sql || format(' WITH CHECK (%s)', v_new_check);
    END IF;

    EXECUTE v_create_sql;
  END LOOP;
END $rewrite$;

-- Sanity check: no policy should still reference is_org_admin.
DO $verify$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*)
    INTO v_remaining
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND qual LIKE '%is_org_admin%')
        OR (with_check IS NOT NULL AND with_check LIKE '%is_org_admin%')
      );
  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'is_org_admin still referenced by % policies after rewrite', v_remaining;
  END IF;
END $verify$;

-- Now safe to drop the function. Other functions that may have called it
-- (none today in our schema, but let's check) would error if it still
-- referenced — DROP FUNCTION will fail cleanly with "cannot drop ... because
-- other objects depend on it" if anything is missed.
DROP FUNCTION public.is_org_admin(uuid);
