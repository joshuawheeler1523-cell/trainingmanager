-- Fix: org_invitations RLS policies referenced auth.users directly,
-- but the `authenticated` role doesn't have SELECT on auth.users at the
-- table-grant level. Any SELECT on org_invitations would error with
-- "permission denied for table users" — including the implicit SELECT
-- that runs after a manager INSERTs an invitation row (the action
-- chains .insert(...).select() to return the created row).
--
-- Symptom: Manager clicks "Send invite" on /admin/team → red toast
-- "permission denied for table users". Invitation row may or may not
-- have been written depending on transaction state.
--
-- Fix: introduce public.current_user_email() as a SECURITY DEFINER
-- helper that bypasses the auth.users table grant. Rewrite the four
-- policies in 20260101000006_invite_rls_policies.sql to call this
-- helper instead of inlining `select email from auth.users where id =
-- auth.uid()`.
--
-- Same pattern as the existing public.is_manager() / user_org_ids()
-- helpers — wrap auth-schema reads in SECURITY DEFINER so anon/
-- authenticated callers don't need direct auth.users grants.

create or replace function public.current_user_email()
  returns citext
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select email from auth.users where id = auth.uid();
$$;

revoke execute on function public.current_user_email() from public, anon;
grant  execute on function public.current_user_email() to authenticated, service_role;

comment on function public.current_user_email() is
  'Returns the email address of the currently-authenticated user, or NULL if not signed in. SECURITY DEFINER so callers don''t need SELECT on auth.users.';

-- Rewrite the four affected policies. Drop-and-recreate so the new
-- definitions stick atomically.

drop policy if exists "users can view their own pending invitations" on public.org_invitations;
create policy "users can view their own pending invitations"
  on public.org_invitations for select
  using (
    email = public.current_user_email()
    and accepted_at is null
    and expires_at > now()
  );

drop policy if exists "users can accept their own pending invitations" on public.org_invitations;
create policy "users can accept their own pending invitations"
  on public.org_invitations for update
  using (
    email = public.current_user_email()
    and accepted_at is null
    and expires_at > now()
  )
  with check (
    email = public.current_user_email()
  );

drop policy if exists "users can join via valid invitation" on public.org_memberships;
create policy "users can join via valid invitation"
  on public.org_memberships for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.org_invitations inv
      where inv.org_id = org_memberships.org_id
        and inv.email = public.current_user_email()
        and inv.accepted_at is null
        and inv.expires_at > now()
    )
  );
