-- ── Invitation self-service policies ─────────────────────────────────────────
-- Allow unauthenticated users (post sign-in, pre-org) to see their own pending
-- invitations, accept them, and create their resulting org membership.

-- 1. Users can view their own pending invitations
create policy "users can view their own pending invitations"
  on public.org_invitations for select
  using (
    email::text = (select email from auth.users where id = auth.uid())
    and accepted_at is null
    and expires_at > now()
  );

-- 2. Users can accept their own pending invitations (set accepted_at)
create policy "users can accept their own pending invitations"
  on public.org_invitations for update
  using (
    email::text = (select email from auth.users where id = auth.uid())
    and accepted_at is null
    and expires_at > now()
  )
  with check (
    email::text = (select email from auth.users where id = auth.uid())
  );

-- 3. Users can create their own membership when a valid invitation exists
create policy "users can join via valid invitation"
  on public.org_memberships for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.org_invitations inv
      where inv.org_id = org_memberships.org_id
        and inv.email::text = (select email from auth.users where id = auth.uid())
        and inv.accepted_at is null
        and inv.expires_at > now()
    )
  );
