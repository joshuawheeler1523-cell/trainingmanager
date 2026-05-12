-- Schedule Sketchpad — standalone mockup tool.
--
-- An ad-hoc, free-text scheduling surface. Trainer/class names are plain
-- strings, NOT joined to public.instructors / public.impl_classes. The
-- whole point: "I want to quickly mock up a course schedule" without
-- spinning up an implementation, populating a roster, or touching capacity
-- planning. Conflict detection is presentational only — a sketchpad row
-- never feeds the workload or scheduler RPC.
--
-- Visibility: any org member can create + edit their own sketches. Managers
-- see every sketch in the org. Soft-delete via deleted_at. Standard audit
-- triggers attached.
--
-- See docs/build-plans/ for the surrounding plan.

-- ── sketchpad_schedules ────────────────────────────────────────────────────

create table public.sketchpad_schedules (
  id                  uuid          not null default gen_random_uuid() primary key,
  org_id              uuid          not null references public.organizations(id) on delete cascade,
  department_id       uuid          not null references public.departments(id) on delete cascade,
  name                text          not null check (length(trim(name)) > 0),
  notes               text,
  start_date          date          not null default current_date,
  day_count           int           not null default 5 check (day_count between 1 and 14),
  hours_start         int           not null default 7 check (hours_start between 0 and 23),
  hours_end           int           not null default 19 check (hours_end between 1 and 24),
  slot_minutes        int           not null default 30 check (slot_minutes in (15, 30, 60)),
  deleted_at          timestamptz,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),
  created_by          uuid          references auth.users(id) on delete set null,
  updated_by          uuid          references auth.users(id) on delete set null,
  version             integer       not null default 1,
  check (hours_end > hours_start)
);

create index on public.sketchpad_schedules (org_id, deleted_at);
create index on public.sketchpad_schedules (org_id, created_by);
create index on public.sketchpad_schedules (org_id, updated_at desc);

alter table public.sketchpad_schedules enable row level security;

-- Anyone in the org can read their own sketches. Managers see all in-org.
create policy "sketchpad_schedules_select" on public.sketchpad_schedules
  for select using (
    org_id in (select public.user_org_ids())
    and (
      public.is_manager(org_id)
      or created_by = (select auth.uid())
    )
  );

-- Anyone in the org can create. Managers can edit any; others their own.
create policy "sketchpad_schedules_insert" on public.sketchpad_schedules
  for insert with check (
    org_id in (select public.user_org_ids())
  );

create policy "sketchpad_schedules_update" on public.sketchpad_schedules
  for update using (
    org_id in (select public.user_org_ids())
    and (
      public.is_manager(org_id)
      or created_by = (select auth.uid())
    )
  ) with check (
    org_id in (select public.user_org_ids())
  );

create policy "sketchpad_schedules_delete" on public.sketchpad_schedules
  for delete using (
    org_id in (select public.user_org_ids())
    and (
      public.is_manager(org_id)
      or created_by = (select auth.uid())
    )
  );

select public.apply_standard_triggers('sketchpad_schedules');

create trigger set_actor_audit_fields
  before insert or update on public.sketchpad_schedules
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.sketchpad_schedules
  for each row execute function public.bump_version();

-- ── sketchpad_rooms ────────────────────────────────────────────────────────

create table public.sketchpad_rooms (
  id            uuid          not null default gen_random_uuid() primary key,
  schedule_id   uuid          not null references public.sketchpad_schedules(id) on delete cascade,
  org_id        uuid          not null references public.organizations(id) on delete cascade,
  name          text          not null check (length(trim(name)) > 0),
  capacity      int,
  position      int           not null default 0,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create index on public.sketchpad_rooms (schedule_id, position);

alter table public.sketchpad_rooms enable row level security;

-- Rooms inherit visibility from their parent schedule.
create policy "sketchpad_rooms_all" on public.sketchpad_rooms
  for all using (
    org_id in (select public.user_org_ids())
    and exists (
      select 1 from public.sketchpad_schedules s
      where s.id = sketchpad_rooms.schedule_id
        and (public.is_manager(s.org_id) or s.created_by = (select auth.uid()))
    )
  ) with check (
    org_id in (select public.user_org_ids())
  );

create trigger set_updated_at_sketchpad_rooms
  before update on public.sketchpad_rooms
  for each row execute function public.set_updated_at();

-- ── sketchpad_sessions ─────────────────────────────────────────────────────

create table public.sketchpad_sessions (
  id              uuid          not null default gen_random_uuid() primary key,
  schedule_id     uuid          not null references public.sketchpad_schedules(id) on delete cascade,
  room_id         uuid          references public.sketchpad_rooms(id) on delete set null,
  org_id          uuid          not null references public.organizations(id) on delete cascade,
  trainer_name    text          not null check (length(trim(trainer_name)) > 0),
  class_name      text          not null check (length(trim(class_name)) > 0),
  starts_at       timestamptz   not null,
  ends_at         timestamptz   not null,
  learner_count   int,
  notes           text,
  color           text,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  check (ends_at > starts_at)
);

create index on public.sketchpad_sessions (schedule_id, starts_at);
create index on public.sketchpad_sessions (schedule_id, room_id);
create index on public.sketchpad_sessions (schedule_id, lower(trainer_name));

alter table public.sketchpad_sessions enable row level security;

create policy "sketchpad_sessions_all" on public.sketchpad_sessions
  for all using (
    org_id in (select public.user_org_ids())
    and exists (
      select 1 from public.sketchpad_schedules s
      where s.id = sketchpad_sessions.schedule_id
        and (public.is_manager(s.org_id) or s.created_by = (select auth.uid()))
    )
  ) with check (
    org_id in (select public.user_org_ids())
  );

create trigger set_updated_at_sketchpad_sessions
  before update on public.sketchpad_sessions
  for each row execute function public.set_updated_at();
