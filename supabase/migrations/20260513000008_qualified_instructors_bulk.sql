-- Bulk variant of qualified_instructors_for_class.
--
-- The single-class function is fine for one-off "who can teach this?"
-- lookups, but page loaders for /classes and /skills walk every class
-- in the org and call it per-class — an N+1 that costs ~10ms per call
-- on a warm function, multiplied by 40-100 classes per org.
--
-- This bulk version returns (class_id, instructor_id) for every
-- qualified pair in the org in one round-trip. Same proficiency logic
-- as the single-class version, just cross-joined.
--
-- The existing qualified_instructors_for_class is kept intact — other
-- callers (the impl_class_prereq_earliest helper, etc.) still need it.

create or replace function public.qualified_instructors_for_org(p_org_id uuid)
returns table(class_id uuid, instructor_id uuid)
language sql
stable
security definer
set search_path to ''
as $function$
  with required as (
    -- One row per (class_id, skill_id, min_rank). Only "required" rows
    -- gate qualification; "preferred" doesn't.
    select
      r.class_id,
      r.skill_id,
      public.proficiency_rank(r.min_proficiency) as min_rank
    from public.class_skill_requirements r
    where r.org_id = p_org_id
      and r.requirement = 'required'
  ),
  classes_with_reqs as (
    select distinct class_id from required
  ),
  active_instructors as (
    select id
    from public.instructors
    where org_id = p_org_id
      and deleted_at is null
      and status = 'active'
  )
  select
    c.class_id,
    i.id as instructor_id
  from classes_with_reqs c
  cross join active_instructors i
  where not exists (
    -- For this (class, instructor) pair: is there any required skill
    -- the instructor lacks (or has below min proficiency)? If yes,
    -- not qualified.
    select 1
    from required r
    where r.class_id = c.class_id
      and not exists (
        select 1 from public.instructor_skills isk
        where isk.instructor_id = i.id
          and isk.skill_id = r.skill_id
          and public.proficiency_rank(isk.proficiency) >= r.min_rank
      )
  );
$function$;

revoke execute on function public.qualified_instructors_for_org(uuid) from public, anon;
grant  execute on function public.qualified_instructors_for_org(uuid) to authenticated;
