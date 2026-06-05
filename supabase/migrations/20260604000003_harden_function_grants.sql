-- =============================================================================
-- Tighten EXECUTE grants on internal SECURITY DEFINER helper functions.
-- =============================================================================
-- The security advisor flagged role/identity helper functions as executable by
-- `anon`. These are internal — used inside RLS policies (evaluated as the
-- querying role) and by authenticated app code — and an anonymous visitor never
-- legitimately calls them. Revoke the implicit public/anon EXECUTE and grant
-- explicitly to `authenticated` (so RLS still works) and `service_role`. This
-- shrinks the anonymous attack surface without touching any of the intentional
-- public, token-gated endpoints (feedback, intake, invite-accept, SSO discovery,
-- project share), which keep their anon grant.
-- =============================================================================

revoke execute on function public.agency_org_ids(p_agency_id uuid) from public, anon;
grant execute on function public.agency_org_ids(p_agency_id uuid) to authenticated, service_role;
revoke execute on function public.current_agency_id() from public, anon;
grant execute on function public.current_agency_id() to authenticated, service_role;
revoke execute on function public.current_instructor_id(p_org_id uuid) from public, anon;
grant execute on function public.current_instructor_id(p_org_id uuid) to authenticated, service_role;
revoke execute on function public.current_user_id() from public, anon;
grant execute on function public.current_user_id() to authenticated, service_role;
revoke execute on function public.has_agency_role(p_agency_id uuid, p_roles text[]) from public, anon;
grant execute on function public.has_agency_role(p_agency_id uuid, p_roles text[]) to authenticated, service_role;
revoke execute on function public.has_any_role(p_org_id uuid, p_roles text[]) from public, anon;
grant execute on function public.has_any_role(p_org_id uuid, p_roles text[]) to authenticated, service_role;
revoke execute on function public.is_agency_admin(p_agency_id uuid) from public, anon;
grant execute on function public.is_agency_admin(p_agency_id uuid) to authenticated, service_role;
revoke execute on function public.is_agency_admin_of_org(p_org_id uuid) from public, anon;
grant execute on function public.is_agency_admin_of_org(p_org_id uuid) to authenticated, service_role;
revoke execute on function public.is_agency_member(p_agency_id uuid) from public, anon;
grant execute on function public.is_agency_member(p_agency_id uuid) to authenticated, service_role;
revoke execute on function public.is_department_admin(p_department_id uuid) from public, anon;
grant execute on function public.is_department_admin(p_department_id uuid) to authenticated, service_role;
revoke execute on function public.is_instructor(p_org_id uuid) from public, anon;
grant execute on function public.is_instructor(p_org_id uuid) to authenticated, service_role;
revoke execute on function public.is_manager(p_org_id uuid) from public, anon;
grant execute on function public.is_manager(p_org_id uuid) to authenticated, service_role;
revoke execute on function public.is_viewer(p_org_id uuid) from public, anon;
grant execute on function public.is_viewer(p_org_id uuid) to authenticated, service_role;
revoke execute on function public.user_department_ids() from public, anon;
grant execute on function public.user_department_ids() to authenticated, service_role;
revoke execute on function public.user_org_ids() from public, anon;
grant execute on function public.user_org_ids() to authenticated, service_role;
revoke execute on function public.user_role_in_org(p_org_id uuid) from public, anon;
grant execute on function public.user_role_in_org(p_org_id uuid) to authenticated, service_role;

-- Defense-in-depth: agency_signup_attempts is written only by the SECURITY
-- DEFINER signup function (which bypasses RLS), so it intentionally has RLS
-- enabled with no policy (deny-all direct access). Revoke the default grants so
-- no client role can touch it even if RLS were ever relaxed.
revoke all on public.agency_signup_attempts from anon, authenticated;
comment on table public.agency_signup_attempts is
  'Anonymous agency-signup rate limiting. Written only via the SECURITY DEFINER signup RPC; RLS enabled with no policy = deny-all direct access by design.';

-- Document the one intentional SECURITY DEFINER view: it powers the public
-- project-share link and is scoped by a secret share token in its WHERE clause,
-- so it only ever returns the specifically-shared project. It must bypass RLS to
-- serve anonymous viewers, so security_invoker is intentionally not set.
comment on view public.v_public_project_team is
  'Intentional SECURITY DEFINER. Scoped by secret share token (public_share_token = get_pg_share_token()); returns only the specifically-shared project''s team. Must bypass RLS to serve the anonymous public-share page.';
