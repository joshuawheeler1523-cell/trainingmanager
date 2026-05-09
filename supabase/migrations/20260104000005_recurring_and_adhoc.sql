-- ── frequency_to_annual helper ───────────────────────────────────────────────
-- Used by the v_instructor_workload view (built later) and as default fallback
-- for recurring_tasks.occurrences_per_year when null.

create or replace function public.frequency_to_annual(p_frequency text)
  returns integer
  language sql immutable
as $$
  select case p_frequency
    when 'daily'     then 250  -- approx working days
    when 'weekly'    then 52
    when 'biweekly'  then 26
    when 'monthly'   then 12
    when 'quarterly' then 4
    when 'annually'  then 1
    else 0
  end
$$;

-- ── recurring_tasks ───────────────────────────────────────────────────────────

create table public.recurring_tasks (
  id                   uuid         not null default gen_random_uuid() primary key,
  org_id               uuid         not null references public.organizations(id) on delete cascade,
  name                 text         not null,
  description          text,
  bucket_id            uuid         references public.allocation_buckets(id) on delete set null,
  hours_per_occurrence numeric(5,2) not null check (hours_per_occurrence >= 0),
  frequency            text         not null
                         check (frequency in ('daily','weekly','biweekly','monthly','quarterly','annually')),
  occurrences_per_year integer      check (occurrences_per_year is null or occurrences_per_year >= 0),
  status               text         not null default 'active'
                         check (status in ('active','paused','archived')),
  deleted_at           timestamptz,
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now(),
  created_by           uuid         references auth.users(id) on delete set null,
  updated_by           uuid         references auth.users(id) on delete set null
);

create index on public.recurring_tasks (org_id, status);
create index on public.recurring_tasks (org_id, deleted_at);
create index on public.recurring_tasks (bucket_id);

alter table public.recurring_tasks enable row level security;

create policy "recurring_tasks_select" on public.recurring_tasks
  for select using (org_id in (select public.user_org_ids()));

create policy "recurring_tasks_modify" on public.recurring_tasks
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('recurring_tasks');

create trigger set_actor_audit_fields
  before insert or update on public.recurring_tasks
  for each row execute function public.set_actor_audit_fields();

-- ── recurring_task_assignments ───────────────────────────────────────────────

create table public.recurring_task_assignments (
  recurring_task_id uuid          not null references public.recurring_tasks(id) on delete cascade,
  instructor_id     uuid          not null references public.instructors(id) on delete cascade,
  org_id            uuid          not null references public.organizations(id) on delete cascade,
  share_percent     numeric(5,2)  not null default 100.00 check (share_percent >= 0 and share_percent <= 100),
  created_at        timestamptz   not null default now(),
  primary key (recurring_task_id, instructor_id)
);

create index on public.recurring_task_assignments (instructor_id);
create index on public.recurring_task_assignments (org_id);

alter table public.recurring_task_assignments enable row level security;

create policy "rta_select" on public.recurring_task_assignments
  for select using (org_id in (select public.user_org_ids()));

create policy "rta_modify" on public.recurring_task_assignments
  for all using (org_id in (select public.user_org_ids()));

create trigger write_audit_log
  after insert or update or delete on public.recurring_task_assignments
  for each row execute function public.write_audit_log();

-- ── ad_hoc_tasks ──────────────────────────────────────────────────────────────

create table public.ad_hoc_tasks (
  id            uuid         not null default gen_random_uuid() primary key,
  org_id        uuid         not null references public.organizations(id) on delete cascade,
  name          text         not null,
  description   text,
  bucket_id     uuid         references public.allocation_buckets(id) on delete set null,
  instructor_id uuid         references public.instructors(id) on delete set null,
  hours         numeric(5,2) not null check (hours >= 0),
  due_date      date,
  status        text         not null default 'open'
                  check (status in ('open','in_progress','done','cancelled')),
  completed_at  timestamptz,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),
  created_by    uuid         references auth.users(id) on delete set null,
  updated_by    uuid         references auth.users(id) on delete set null
);

create index on public.ad_hoc_tasks (org_id, status);
create index on public.ad_hoc_tasks (instructor_id);
create index on public.ad_hoc_tasks (org_id, due_date);
create index on public.ad_hoc_tasks (bucket_id);

alter table public.ad_hoc_tasks enable row level security;

create policy "ad_hoc_tasks_select" on public.ad_hoc_tasks
  for select using (org_id in (select public.user_org_ids()));

create policy "ad_hoc_tasks_modify" on public.ad_hoc_tasks
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('ad_hoc_tasks');

create trigger set_actor_audit_fields
  before insert or update on public.ad_hoc_tasks
  for each row execute function public.set_actor_audit_fields();
