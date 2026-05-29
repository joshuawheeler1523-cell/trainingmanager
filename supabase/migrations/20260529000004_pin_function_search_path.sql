-- Pin search_path = '' on 6 functions flagged by the security advisor's
-- function_search_path_mutable lint.
--
-- Why this matters even for SECURITY INVOKER functions: an unpinned
-- search_path lets a caller temporarily prepend a schema they control,
-- shadowing built-in objects the function references. Pinning the search
-- path to '' (empty) forces every reference to be either pg_catalog (which
-- Postgres adds implicitly) or fully schema-qualified, removing the attack
-- surface.
--
-- Each function body here is already fully-qualified or uses only pg_catalog
-- builtins, so this change is non-behavioral:
--
-- - apply_standard_triggers(p_table_name): references public.set_updated_at,
--   public.write_audit_log and uses pg_catalog format(). All qualified.
-- - bump_version(): trigger that bumps new.version. No function calls.
-- - frequency_to_annual(p_frequency): pure CASE statement. No function calls.
-- - proficiency_rank(p_proficiency): pure CASE statement. No function calls.
-- - set_actor_audit_fields(): trigger that uses auth.uid() (fully qualified).
-- - set_updated_at(): trigger that uses now() (pg_catalog).

ALTER FUNCTION public.apply_standard_triggers(p_table_name text) SET search_path = '';
ALTER FUNCTION public.bump_version() SET search_path = '';
ALTER FUNCTION public.frequency_to_annual(p_frequency text) SET search_path = '';
ALTER FUNCTION public.proficiency_rank(p_proficiency text) SET search_path = '';
ALTER FUNCTION public.set_actor_audit_fields() SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';
