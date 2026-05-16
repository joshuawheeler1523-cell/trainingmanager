-- Super users — power users / SMEs / champions tracked per department.
--
-- A super user is someone (typically a frontline staff member, NOT an
-- instructor) who is the go-to floor resource on a system, device, or
-- procedure. They can be linked to a curriculum class (e.g. "Care Connect
-- EHR super user") OR carry only a free-text topic ("Glucometer", "IV
-- pumps") for ad-hoc tracking. At least one of class_id / topic must be
-- populated.
--
-- Trained yet?  trained_at IS NULL means "not yet trained"; a date means
-- "trained on that day". We don't model proficiency or expiration here —
-- this is a roster, not a competency tracker. If a richer model is needed
-- later, super_users.id stays stable so a sidecar table can hang off it.
--
-- Visibility: department-scoped via the standard RLS pattern (org members
-- see only super users in departments they belong to; org admins see all).

create table public.super_users (
  id              uuid          not null default gen_random_uuid() primary key,
  org_id          uuid          not null references public.organizations(id) on delete cascade,
  department_id   uuid          not null references public.departments(id) on delete restrict,
  full_name       text          not null check (length(trim(full_name)) > 0),
  email           text,
  phone           text,
  unit            text,
  class_id        uuid          references public.classes(id) on delete set null,
  topic           text,
  trained_at      date,
  deleted_at      timestamptz,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  created_by      uuid          references auth.users(id) on delete set null,
  updated_by      uuid          references auth.users(id) on delete set null,
  version         integer       not null default 1,
  check (class_id is not null or coalesce(length(trim(topic)), 0) > 0)
);

create index on public.super_users (org_id, department_id, deleted_at);
create index on public.super_users (org_id, class_id) where deleted_at is null;
create index on public.super_users (org_id, lower(full_name));
create index on public.super_users (org_id, lower(coalesce(topic, ''))) where deleted_at is null;

alter table public.super_users enable row level security;

create policy "super_users_select" on public.super_users
  for select using (
    org_id in (select public.user_org_ids())
    and (
      public.is_manager(org_id)
      or department_id in (select public.user_department_ids())
    )
  );

create policy "super_users_modify" on public.super_users
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

select public.apply_standard_triggers('super_users');

create trigger set_actor_audit_fields
  before insert or update on public.super_users
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.super_users
  for each row execute function public.bump_version();
