-- ── class_modules ───────────────────────────────────────────────────────────
-- A named grouping that holds multiple classes (1 module : N classes). A class
-- optionally belongs to one module (classes.module_id). Org-scoped like classes.

create table public.class_modules (
  id          uuid        not null default gen_random_uuid() primary key,
  org_id      uuid        not null references public.organizations(id) on delete cascade,
  name        text        not null,
  description text,
  color       text,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid        references auth.users(id) on delete set null,
  updated_by  uuid        references auth.users(id) on delete set null
);

create index on public.class_modules (org_id);
-- One active module per name within an org (case-insensitive) so CSV import and
-- inline create can upsert by name without duplicates.
create unique index class_modules_org_name_unique
  on public.class_modules (org_id, lower(name))
  where deleted_at is null;

alter table public.class_modules enable row level security;

create policy "class_modules_select" on public.class_modules
  for select using (org_id in (select public.user_org_ids()));

create policy "class_modules_modify" on public.class_modules
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('class_modules');

create trigger set_actor_audit_fields
  before insert or update on public.class_modules
  for each row execute function public.set_actor_audit_fields();

-- ── classes.module_id ───────────────────────────────────────────────────────
-- Optional link to a module. on delete set null: deleting a module unassigns
-- its classes rather than cascading them away.

alter table public.classes
  add column module_id uuid references public.class_modules(id) on delete set null;

create index on public.classes (org_id, module_id);

-- ── classes_with_hours: re-expose c.* so module_id flows through ─────────────
-- Adding a column mid-list means CREATE OR REPLACE can't reorder; drop + create.
-- Nothing else depends on this view (v_instructor_workload reads base tables).

drop view if exists public.classes_with_hours;

create view public.classes_with_hours as
select
  c.*,
  case
    when c.is_multi_day and c.custom_day_hours is not null
      then (select sum(h) from unnest(c.custom_day_hours) h)
    else coalesce(c.hours_per_day, 0) * c.total_days
  end as instruction_hours_per_offering,
  (
    case
      when c.is_multi_day and c.custom_day_hours is not null
        then (select sum(h) from unnest(c.custom_day_hours) h)
      else coalesce(c.hours_per_day, 0) * c.total_days
    end
    + c.prep_hours_per_offering
    + c.logistics_hours_per_offering
  ) as total_hours_per_offering,
  (
    (
      case
        when c.is_multi_day and c.custom_day_hours is not null
          then (select sum(h) from unnest(c.custom_day_hours) h)
        else coalesce(c.hours_per_day, 0) * c.total_days
      end
      + c.prep_hours_per_offering
      + c.logistics_hours_per_offering
    ) * c.offerings_per_year
  ) as annual_class_hours
from public.classes c
where c.deleted_at is null;

alter view public.classes_with_hours set (security_invoker = true);
