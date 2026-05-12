-- ── class_roadmap_steps ────────────────────────────────────────────────────────
--
-- Per-class curriculum/roadmap: an ordered list of steps that document what
-- competencies are taught, in what modality (ILT, eLearning, video, …), and
-- for how long. Summed step durations are compared against the class's
-- instruction_hours_per_offering at the UI layer; mismatch surfaces as a
-- warning but never blocks save (drafts can sit out of sync).
--
-- The `position` field is a sparse integer used purely for display ordering.
-- Reorder is implemented by swapping positions between adjacent rows in the
-- application layer; there's no uniqueness constraint so we don't have to
-- shuffle every row on insert.

create table public.class_roadmap_steps (
  id                uuid        not null default gen_random_uuid() primary key,
  org_id            uuid        not null references public.organizations(id) on delete cascade,
  department_id     uuid        not null references public.departments(id) on delete cascade,
  class_id          uuid        not null references public.classes(id) on delete cascade,
  position          integer     not null default 0,
  competency        text        not null check (char_length(competency) between 1 and 500),
  modality          text        not null check (modality in (
                                  'ilt', 'vilt', 'elearning', 'video',
                                  'reading', 'simulation', 'ojt',
                                  'assessment', 'blended'
                                )),
  duration_minutes  integer     not null check (duration_minutes > 0 and duration_minutes <= 100000),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on public.class_roadmap_steps (class_id, position);
create index on public.class_roadmap_steps (org_id);
create index on public.class_roadmap_steps (department_id);

alter table public.class_roadmap_steps enable row level security;

create policy "crs_select" on public.class_roadmap_steps
  for select using (org_id in (select public.user_org_ids()));

create policy "crs_modify" on public.class_roadmap_steps
  for all using (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('class_roadmap_steps');
