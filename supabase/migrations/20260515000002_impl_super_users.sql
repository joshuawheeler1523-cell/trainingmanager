-- Implementation-scoped super users — separate list per training plan.
--
-- Distinct from the org-wide public.super_users roster. Each training-planner
-- project (implementation) carries its own list of people who emerged as
-- super users from THAT rollout. By design, this table doesn't link to
-- public.super_users — the workflow we observed is: planners want to track
-- "who got trained as a Care Connect SU during the Q2 rollout" without that
-- bleeding into or being constrained by the standing org-wide list. Two lists
-- serve two different mental models.
--
-- Linkage:
--   - impl_class_id (nullable) FK to public.impl_classes — "which class in
--     this plan did they train on"
--   - topic (free text) — ad-hoc fallback when there's no impl_class
--   - Constraint: at least one of impl_class_id / topic must be populated
--
-- Visibility: department-scoped via the implementation's department_id.

create table public.impl_super_users (
  id                  uuid          not null default gen_random_uuid() primary key,
  org_id              uuid          not null references public.organizations(id) on delete cascade,
  department_id       uuid          not null references public.departments(id) on delete restrict,
  implementation_id   uuid          not null references public.implementations(id) on delete cascade,
  impl_class_id       uuid          references public.impl_classes(id) on delete set null,
  full_name           text          not null check (length(trim(full_name)) > 0),
  email               text,
  phone               text,
  unit                text,
  topic               text,
  trained_at          date,
  deleted_at          timestamptz,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),
  created_by          uuid          references auth.users(id) on delete set null,
  updated_by          uuid          references auth.users(id) on delete set null,
  version             integer       not null default 1,
  check (impl_class_id is not null or coalesce(length(trim(topic)), 0) > 0)
);

create index on public.impl_super_users (implementation_id, deleted_at);
create index on public.impl_super_users (implementation_id, impl_class_id) where deleted_at is null;
create index on public.impl_super_users (org_id, department_id);

alter table public.impl_super_users enable row level security;

create policy "impl_super_users_select" on public.impl_super_users
  for select using (
    org_id in (select public.user_org_ids())
    and (
      public.is_manager(org_id)
      or department_id in (select public.user_department_ids())
    )
  );

create policy "impl_super_users_modify" on public.impl_super_users
  for all using (
    org_id in (select public.user_org_ids())
    and (
      public.is_manager(org_id)
      or department_id in (select public.user_department_ids())
    )
  ) with check (
    org_id in (select public.user_org_ids())
    and (
      public.is_manager(org_id)
      or department_id in (select public.user_department_ids())
    )
  );

select public.apply_standard_triggers('impl_super_users');

create trigger set_actor_audit_fields
  before insert or update on public.impl_super_users
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.impl_super_users
  for each row execute function public.bump_version();
