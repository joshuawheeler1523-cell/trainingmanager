-- ── classes ────────────────────────────────────────────────────────────────────

create table public.classes (
  id                            uuid        not null default gen_random_uuid() primary key,
  org_id                        uuid        not null references public.organizations(id) on delete cascade,
  name                          text        not null,
  description                   text,
  -- FK to allocation_buckets added in 20260104000001_allocations_buckets.sql
  allocation_bucket_id          uuid,
  is_multi_day                  boolean     not null default false,
  total_days                    integer     not null default 1,
  hours_per_day                 numeric(5,2),
  custom_day_hours              numeric(5,2)[],
  offerings_per_year            integer     not null default 0,
  prep_hours_per_offering       numeric(5,2) not null default 0,
  logistics_hours_per_offering  numeric(5,2) not null default 0,
  status                        text        not null default 'active'
                                  check (status in ('active', 'archived')),
  deleted_at                    timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  created_by                    uuid        references auth.users(id) on delete set null,
  updated_by                    uuid        references auth.users(id) on delete set null,
  version                       integer     not null default 1
);

create index on public.classes (org_id, status);
create index on public.classes (org_id, deleted_at);
create index on public.classes (org_id, name);

alter table public.classes enable row level security;

create policy "classes_select" on public.classes
  for select using (org_id in (select public.user_org_ids()));

create policy "classes_modify" on public.classes
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('classes');

create trigger set_actor_audit_fields
  before insert or update on public.classes
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.classes
  for each row execute function public.bump_version();

-- ── class_instructor_assignments ───────────────────────────────────────────────

create table public.class_instructor_assignments (
  id                  uuid    not null default gen_random_uuid() primary key,
  org_id              uuid    not null references public.organizations(id) on delete cascade,
  class_id            uuid    not null references public.classes(id) on delete cascade,
  instructor_id       uuid    not null references public.instructors(id) on delete cascade,
  role                text    not null default 'eligible'
                        check (role in ('eligible', 'primary', 'backup')),
  assigned_offerings  integer not null default 0 check (assigned_offerings >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (class_id, instructor_id)
);

create index on public.class_instructor_assignments (class_id);
create index on public.class_instructor_assignments (instructor_id);
create index on public.class_instructor_assignments (org_id);

alter table public.class_instructor_assignments enable row level security;

create policy "cia_select" on public.class_instructor_assignments
  for select using (org_id in (select public.user_org_ids()));

create policy "cia_modify" on public.class_instructor_assignments
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('class_instructor_assignments');

-- ── Offering assignment validation trigger ──────────────────────────────────────

create or replace function public.check_offering_assignments()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_total   integer;
  v_max     integer;
begin
  select coalesce(sum(assigned_offerings), 0)
    into v_total
  from public.class_instructor_assignments
  where class_id = new.class_id;

  select offerings_per_year
    into v_max
  from public.classes
  where id = new.class_id;

  if v_total > v_max then
    raise exception
      'Total assigned offerings (%) exceeds class offerings_per_year (%)',
      v_total, v_max
      using errcode = 'check_violation', hint = 'Reduce assigned_offerings';
  end if;

  return new;
end;
$$;

create trigger check_offering_assignments
  after insert or update on public.class_instructor_assignments
  for each row execute function public.check_offering_assignments();

-- ── classes_with_hours view ─────────────────────────────────────────────────────

create or replace view public.classes_with_hours as
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
