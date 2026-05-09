-- ── individual_allocations ───────────────────────────────────────────────────
-- Per-instructor overrides (highest precedence).

create table public.individual_allocations (
  id             uuid          not null default gen_random_uuid() primary key,
  org_id         uuid          not null references public.organizations(id) on delete cascade,
  instructor_id  uuid          not null references public.instructors(id) on delete cascade,
  bucket_id      uuid          not null references public.allocation_buckets(id) on delete cascade,
  target_percent numeric(5,2)  not null check (target_percent >= 0 and target_percent <= 100),
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now(),
  created_by     uuid          references auth.users(id) on delete set null,
  updated_by     uuid          references auth.users(id) on delete set null,
  unique (instructor_id, bucket_id)
);

create index on public.individual_allocations (org_id);
create index on public.individual_allocations (instructor_id);
create index on public.individual_allocations (bucket_id);

alter table public.individual_allocations enable row level security;

create policy "indiv_alloc_select" on public.individual_allocations
  for select using (org_id in (select public.user_org_ids()));

create policy "indiv_alloc_modify" on public.individual_allocations
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('individual_allocations');

create trigger set_actor_audit_fields
  before insert or update on public.individual_allocations
  for each row execute function public.set_actor_audit_fields();

-- ── effective_allocation(p_instructor_id) ─────────────────────────────────────
-- Resolves the effective bucket allocation for one instructor.
-- Resolution order: individual > group > global.
-- If multiple groups, the group with the most-recent updated_at wins
-- (documented behavior in data_model.md §7.7).
-- Returns one row per non-archived bucket the instructor's org has, with the
-- source label ('individual' | 'group' | 'global' | 'none').

create or replace function public.effective_allocation(p_instructor_id uuid)
  returns table (
    bucket_id      uuid,
    target_percent numeric,
    source         text
  )
  language sql stable security definer
  set search_path = ''
as $$
  with inst as (
    select id, org_id from public.instructors where id = p_instructor_id
  ),
  -- Pick the winning group for this instructor: the most-recently updated
  -- group they belong to that has at least one group_allocation row.
  winning_group as (
    select g.id as group_id
    from public.allocation_groups g
    join public.allocation_group_members m on m.group_id = g.id
    join inst on inst.id = m.instructor_id
    where exists (select 1 from public.group_allocations ga where ga.group_id = g.id)
    order by g.updated_at desc
    limit 1
  ),
  buckets as (
    select b.id as bucket_id
    from public.allocation_buckets b
    join inst on inst.org_id = b.org_id
    where b.is_archived = false
  )
  select
    b.bucket_id,
    coalesce(ind.target_percent, grp.target_percent, glb.target_percent, 0)::numeric as target_percent,
    case
      when ind.target_percent is not null then 'individual'
      when grp.target_percent is not null then 'group'
      when glb.target_percent is not null then 'global'
      else 'none'
    end as source
  from buckets b
  left join public.individual_allocations ind
    on ind.instructor_id = p_instructor_id and ind.bucket_id = b.bucket_id
  left join public.group_allocations grp
    on grp.group_id = (select group_id from winning_group)
   and grp.bucket_id = b.bucket_id
  left join public.global_allocations glb
    on glb.org_id = (select org_id from inst) and glb.bucket_id = b.bucket_id;
$$;
