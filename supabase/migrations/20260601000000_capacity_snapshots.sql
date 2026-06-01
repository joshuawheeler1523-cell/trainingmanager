-- =============================================================================
-- capacity_snapshots — nightly point-in-time org capacity for the Trend report
-- =============================================================================
-- One row per org per day. Powers the Utilization Trend report, which has no
-- historical source to backfill from, so we accumulate it going forward via a
-- pg_cron job. Seeded with today's snapshot on apply so the report isn't empty.
-- =============================================================================

create table if not exists public.capacity_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  snapshot_date        date not null default current_date,
  instructor_count     integer not null default 0,
  total_annual_hours   numeric not null default 0,
  total_assigned_hours numeric not null default 0,
  avg_utilization_pct  numeric,
  created_at           timestamptz not null default now(),
  unique (org_id, snapshot_date)
);

create index if not exists capacity_snapshots_org_date_idx
  on public.capacity_snapshots (org_id, snapshot_date);

alter table public.capacity_snapshots enable row level security;

-- Read-only to org members (user_org_ids also covers agency admins for their
-- client orgs). Writes happen only through snapshot_capacity() below, which is
-- SECURITY DEFINER — so there are deliberately no insert/update/delete policies.
drop policy if exists capacity_snapshots_select on public.capacity_snapshots;
create policy capacity_snapshots_select on public.capacity_snapshots
  for select using (org_id in (select public.user_org_ids()));

grant select on public.capacity_snapshots to authenticated;

-- Aggregate current capacity per org and upsert today's snapshot. SECURITY
-- DEFINER so the nightly cron and the seed below read every org's capacity
-- regardless of RLS. Org-wide utilization = assigned / available (not an
-- average of per-instructor percentages).
create or replace function public.snapshot_capacity()
  returns void
  language sql
  security definer
  set search_path = ''
as $$
  insert into public.capacity_snapshots
    (org_id, snapshot_date, instructor_count, total_annual_hours,
     total_assigned_hours, avg_utilization_pct)
  select
    c.org_id,
    current_date,
    count(*),
    coalesce(sum(c.annual_hours), 0),
    coalesce(sum(c.assigned_hours), 0),
    case
      when coalesce(sum(c.annual_hours), 0) > 0
      then round(sum(c.assigned_hours) / sum(c.annual_hours) * 100, 2)
      else null
    end
  from public.v_instructor_capacity c
  group by c.org_id
  on conflict (org_id, snapshot_date) do update set
    instructor_count     = excluded.instructor_count,
    total_annual_hours   = excluded.total_annual_hours,
    total_assigned_hours = excluded.total_assigned_hours,
    avg_utilization_pct  = excluded.avg_utilization_pct;
$$;

revoke execute on function public.snapshot_capacity() from public, anon, authenticated;
grant execute on function public.snapshot_capacity() to postgres, service_role;

-- Nightly at 06:00 UTC. A named schedule is idempotent — re-running this
-- migration replaces the job rather than duplicating it.
select cron.schedule(
  'nightly-capacity-snapshot',
  '0 6 * * *',
  $$select public.snapshot_capacity();$$
);

-- Seed today's snapshot immediately so the Trend report has a first point.
select public.snapshot_capacity();
