-- Returns auth.users.id for a given email (case-insensitive), NULL if none.
-- Used by the invite-acceptance server action to decide between creating
-- a brand-new auth user vs. updating the password on an existing one.
--
-- SECURITY DEFINER + service_role only. Exposes existence of an email
-- in auth.users, which is sensitive — keep public/anon/authenticated
-- locked out so it can't be used as a user-enumeration oracle.

create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email::text) = lower(p_email) limit 1;
$$;

revoke execute on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;
