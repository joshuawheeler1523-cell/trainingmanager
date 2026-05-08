-- Phase 9.1 — Invitation accept flow.
--
-- Two SECURITY DEFINER RPCs let the /accept-invite/[token] page work without
-- relaxing the existing "org admins can manage invitations" RLS policy.

-- ── lookup_invitation_by_token ──────────────────────────────────────────────
-- Returns the invitation's metadata (org name, role, expiry, accepted state).
-- Called from the public accept page, so it's grantable to anon + auth.
-- Returns NULL row when the token doesn't exist; never raises.

create or replace function public.lookup_invitation_by_token(p_token text)
returns table (
  invitation_id uuid,
  org_id        uuid,
  org_name      text,
  email         text,
  role          text,
  visibility    text,
  expires_at    timestamptz,
  accepted_at   timestamptz
)
language sql stable
security definer
set search_path = ''
as $$
  select
    i.id,
    i.org_id,
    o.name,
    i.email::text,
    i.role,
    i.visibility,
    i.expires_at,
    i.accepted_at
  from public.org_invitations i
  join public.organizations o on o.id = i.org_id
  where i.token = p_token
  limit 1;
$$;

grant execute on function public.lookup_invitation_by_token(text) to anon, authenticated;

-- ── accept_invitation ───────────────────────────────────────────────────────
-- Creates the org_memberships row + marks the invitation accepted. Runs in
-- a single transaction. Reused by the accept page server action.
--
-- Returns the inserted membership id (or null on a duplicate). Raises on:
--   - missing/invalid token
--   - expired token
--   - email mismatch (invitation.email != auth.users.email)
--   - not authenticated

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id      uuid := auth.uid();
  v_user_email   text;
  v_invite_id    uuid;
  v_invite_org   uuid;
  v_invite_email text;
  v_invite_role  text;
  v_invite_vis   text;
  v_invite_exp   timestamptz;
  v_invite_acc   timestamptz;
  v_invite_at    timestamptz;
  v_member_id    uuid;
begin
  if v_user_id is null then
    raise exception 'must be signed in to accept' using errcode = '28000';
  end if;

  -- Compare emails case-insensitively without depending on the citext type
  -- being on the function's empty search_path.
  select lower(email::text) into v_user_email
  from auth.users where id = v_user_id;
  if v_user_email is null then
    raise exception 'user has no email on file' using errcode = 'P0002';
  end if;

  select id, org_id, lower(email::text), role, visibility, expires_at, accepted_at, created_at
    into v_invite_id, v_invite_org, v_invite_email, v_invite_role,
         v_invite_vis, v_invite_exp, v_invite_acc, v_invite_at
  from public.org_invitations
  where token = p_token;

  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if v_invite_exp < now() then
    raise exception 'invitation expired' using errcode = '23514';
  end if;
  if v_invite_email <> v_user_email then
    raise exception 'invitation is for a different email' using errcode = '23514';
  end if;

  if v_invite_acc is not null then
    select id into v_member_id from public.org_memberships
      where org_id = v_invite_org and user_id = v_user_id;
    return v_member_id;
  end if;

  insert into public.org_memberships (
    org_id, user_id, role, visibility, invited_at, accepted_at
  ) values (
    v_invite_org, v_user_id, v_invite_role, v_invite_vis,
    v_invite_at, now()
  )
  on conflict (org_id, user_id) do update
    set role = excluded.role,
        visibility = excluded.visibility,
        accepted_at = coalesce(public.org_memberships.accepted_at, excluded.accepted_at)
  returning id into v_member_id;

  update public.org_invitations
    set accepted_at = now()
    where id = v_invite_id;

  return v_member_id;
end;
$$;

grant execute on function public.accept_invitation(text) to authenticated;
