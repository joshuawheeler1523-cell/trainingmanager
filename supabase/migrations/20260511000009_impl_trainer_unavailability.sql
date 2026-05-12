-- ── impl_trainer_unavailability ────────────────────────────────────────────
--
-- Per-trainer time-off windows. The schedule generator and the Calculate
-- simulator treat each row as a "busy" interval for the trainer, the same
-- way published sessions in OTHER implementations are treated — overlapping
-- placements get pushed past the interval rather than failing outright.
--
-- Department-scoped because impl_trainers are department-scoped. Reason is
-- optional free text (e.g. "PTO", "Conference", "On-call coverage").
--
-- Phase 1.4 of the realistic-scheduler build plan
-- (docs/build-plans/2026-05-11_realistic-scheduler.md).

create table public.impl_trainer_unavailability (
  id                  uuid        not null default gen_random_uuid() primary key,
  org_id              uuid        not null references public.organizations(id) on delete cascade,
  department_id       uuid        not null references public.departments(id) on delete cascade,
  impl_trainer_id     uuid        not null references public.impl_trainers(id) on delete cascade,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  reason              text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (ends_at > starts_at),
  check (reason is null or char_length(reason) <= 200)
);

create index on public.impl_trainer_unavailability (impl_trainer_id, starts_at, ends_at);
create index on public.impl_trainer_unavailability (org_id);
create index on public.impl_trainer_unavailability (department_id);

alter table public.impl_trainer_unavailability enable row level security;

create policy "itu_select" on public.impl_trainer_unavailability
  for select using (org_id in (select public.user_org_ids()));

create policy "itu_modify" on public.impl_trainer_unavailability
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('impl_trainer_unavailability');
