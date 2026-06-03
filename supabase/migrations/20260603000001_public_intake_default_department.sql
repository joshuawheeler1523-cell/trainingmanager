-- Token-gated default-department resolver for public intake submissions.
-- Mirrors public_intake_default_bucket: anon submitters can't read departments
-- directly, and not every org has a 'general'-slug department, so resolve the
-- general department or fall back to the org's oldest one — server-side.

create or replace function public.public_intake_default_department(p_token uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with link as (
    select pil.org_id
    from public.public_intake_links pil
    where pil.token = p_token
      and pil.is_active = true
      and (pil.expires_at is null or pil.expires_at > now())
  )
  select coalesce(
    (select d.id from public.departments d, link
       where d.org_id = link.org_id and d.slug = 'general' limit 1),
    (select d.id from public.departments d, link
       where d.org_id = link.org_id order by d.created_at limit 1)
  );
$$;

revoke execute on function public.public_intake_default_department(uuid) from public;
grant execute on function public.public_intake_default_department(uuid) to anon, authenticated;
