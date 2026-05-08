-- Phase 7.1 — Training Planner: implementations + 7 child tables.
--
-- An "implementation" is one Training Planner instance (e.g., "EMR Q2 2026
-- Provider Training"). It owns its own rooms, trainers, modules, and classes
-- — these are scoped to the implementation, not the org's full roster.
-- Sessions (calendar-placed instances) are computed in Phase 7.2 and live
-- in impl_sessions.

-- ── implementations ─────────────────────────────────────────────────────────

create table public.implementations (
  id                  uuid          not null default gen_random_uuid() primary key,
  org_id              uuid          not null references public.organizations(id) on delete cascade,
  name                text          not null,
  description         text,
  window_start_date   date,
  window_end_date     date,
  go_live_date        date,
  linked_project_id   uuid          references public.projects(id) on delete set null,
  linked_tra_id       uuid          references public.tras(id) on delete set null,
  status              text          not null default 'draft'
                        check (status in ('draft','active','completed','archived','cancelled')),
  current_step        integer       not null default 1
                        check (current_step between 1 and 7),
  deleted_at          timestamptz,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),
  created_by          uuid          references auth.users(id) on delete set null,
  updated_by          uuid          references auth.users(id) on delete set null,
  version             integer       not null default 1
);

create index on public.implementations (org_id, status);
create index on public.implementations (org_id, deleted_at);
create index on public.implementations (linked_project_id);
create index on public.implementations (linked_tra_id);

alter table public.implementations enable row level security;

create policy "implementations_select" on public.implementations
  for select using (org_id in (select public.user_org_ids()));
create policy "implementations_modify" on public.implementations
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('implementations');

create trigger set_actor_audit_fields
  before insert or update on public.implementations
  for each row execute function public.set_actor_audit_fields();

create trigger bump_version
  before update on public.implementations
  for each row execute function public.bump_version();

-- ── impl_rooms ──────────────────────────────────────────────────────────────

create table public.impl_rooms (
  id                       uuid          not null default gen_random_uuid() primary key,
  org_id                   uuid          not null references public.organizations(id) on delete cascade,
  implementation_id        uuid          not null references public.implementations(id) on delete cascade,
  name                     text          not null,
  location                 text,
  seat_capacity            integer       not null check (seat_capacity > 0),
  available_hours_per_day  numeric(4,1)  not null default 8 check (available_hours_per_day > 0 and available_hours_per_day <= 24),
  available_days_of_week   smallint[]    not null default '{1,2,3,4,5}',
  equipment_notes          text,
  sort_order               integer       not null default 0,
  created_at               timestamptz   not null default now(),
  updated_at               timestamptz   not null default now(),
  created_by               uuid          references auth.users(id) on delete set null,
  updated_by               uuid          references auth.users(id) on delete set null
);

create index on public.impl_rooms (implementation_id, sort_order);
create index on public.impl_rooms (org_id);

alter table public.impl_rooms enable row level security;
create policy "impl_rooms_select" on public.impl_rooms
  for select using (org_id in (select public.user_org_ids()));
create policy "impl_rooms_modify" on public.impl_rooms
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('impl_rooms');

create trigger set_actor_audit_fields
  before insert or update on public.impl_rooms
  for each row execute function public.set_actor_audit_fields();

-- ── impl_trainers ───────────────────────────────────────────────────────────

create table public.impl_trainers (
  id                            uuid          not null default gen_random_uuid() primary key,
  org_id                        uuid          not null references public.organizations(id) on delete cascade,
  implementation_id             uuid          not null references public.implementations(id) on delete cascade,
  -- Either reference an existing instructor OR enter an external name (vendor
  -- specialist, contract trainer). Exactly one of the two should be set, but
  -- we don't enforce strictly so the wizard can populate them flexibly.
  instructor_id                 uuid          references public.instructors(id) on delete set null,
  name                          text          not null,
  email                         text,
  availability_hours_per_week   numeric(5,2)  not null check (availability_hours_per_week >= 0),
  max_concurrent_sessions       smallint      not null default 1 check (max_concurrent_sessions >= 1),
  sort_order                    integer       not null default 0,
  created_at                    timestamptz   not null default now(),
  updated_at                    timestamptz   not null default now(),
  created_by                    uuid          references auth.users(id) on delete set null,
  updated_by                    uuid          references auth.users(id) on delete set null
);

create index on public.impl_trainers (implementation_id, sort_order);
create index on public.impl_trainers (instructor_id);
create index on public.impl_trainers (org_id);

alter table public.impl_trainers enable row level security;
create policy "impl_trainers_select" on public.impl_trainers
  for select using (org_id in (select public.user_org_ids()));
create policy "impl_trainers_modify" on public.impl_trainers
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('impl_trainers');

create trigger set_actor_audit_fields
  before insert or update on public.impl_trainers
  for each row execute function public.set_actor_audit_fields();

-- ── impl_modules ────────────────────────────────────────────────────────────

create table public.impl_modules (
  id                  uuid          not null default gen_random_uuid() primary key,
  org_id              uuid          not null references public.organizations(id) on delete cascade,
  implementation_id   uuid          not null references public.implementations(id) on delete cascade,
  name                text          not null,
  description         text,
  sort_order          integer       not null default 0,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),
  created_by          uuid          references auth.users(id) on delete set null,
  updated_by          uuid          references auth.users(id) on delete set null
);

create index on public.impl_modules (implementation_id, sort_order);
create index on public.impl_modules (org_id);

alter table public.impl_modules enable row level security;
create policy "impl_modules_select" on public.impl_modules
  for select using (org_id in (select public.user_org_ids()));
create policy "impl_modules_modify" on public.impl_modules
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('impl_modules');

create trigger set_actor_audit_fields
  before insert or update on public.impl_modules
  for each row execute function public.set_actor_audit_fields();

-- ── impl_classes ────────────────────────────────────────────────────────────

create table public.impl_classes (
  id                              uuid          not null default gen_random_uuid() primary key,
  org_id                          uuid          not null references public.organizations(id) on delete cascade,
  implementation_id               uuid          not null references public.implementations(id) on delete cascade,
  module_id                       uuid          references public.impl_modules(id) on delete set null,
  name                            text          not null,
  description                     text,
  hours_per_session               numeric(4,2)  not null check (hours_per_session > 0),
  expected_learners_per_session   integer       not null check (expected_learners_per_session > 0),
  total_people_to_train           integer       not null default 0 check (total_people_to_train >= 0),
  required_equipment_notes        text,
  sort_order                      integer       not null default 0,
  created_at                      timestamptz   not null default now(),
  updated_at                      timestamptz   not null default now(),
  created_by                      uuid          references auth.users(id) on delete set null,
  updated_by                      uuid          references auth.users(id) on delete set null
);

create index on public.impl_classes (implementation_id, sort_order);
create index on public.impl_classes (module_id);
create index on public.impl_classes (org_id);

alter table public.impl_classes enable row level security;
create policy "impl_classes_select" on public.impl_classes
  for select using (org_id in (select public.user_org_ids()));
create policy "impl_classes_modify" on public.impl_classes
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('impl_classes');

create trigger set_actor_audit_fields
  before insert or update on public.impl_classes
  for each row execute function public.set_actor_audit_fields();

-- ── impl_class_trainers (junction) ──────────────────────────────────────────

create table public.impl_class_trainers (
  id                  uuid          not null default gen_random_uuid() primary key,
  org_id              uuid          not null references public.organizations(id) on delete cascade,
  impl_class_id       uuid          not null references public.impl_classes(id) on delete cascade,
  impl_trainer_id     uuid          not null references public.impl_trainers(id) on delete cascade,
  created_at          timestamptz   not null default now(),
  created_by          uuid          references auth.users(id) on delete set null,
  unique (impl_class_id, impl_trainer_id)
);

create index on public.impl_class_trainers (impl_class_id);
create index on public.impl_class_trainers (impl_trainer_id);
create index on public.impl_class_trainers (org_id);

alter table public.impl_class_trainers enable row level security;
create policy "impl_class_trainers_select" on public.impl_class_trainers
  for select using (org_id in (select public.user_org_ids()));
create policy "impl_class_trainers_modify" on public.impl_class_trainers
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

-- No standard triggers on this junction (no updated_at, no version).

-- ── impl_class_prerequisites (class-→class) ─────────────────────────────────

create table public.impl_class_prerequisites (
  id                  uuid          not null default gen_random_uuid() primary key,
  org_id              uuid          not null references public.organizations(id) on delete cascade,
  impl_class_id       uuid          not null references public.impl_classes(id) on delete cascade,
  prerequisite_id     uuid          not null references public.impl_classes(id) on delete cascade,
  created_at          timestamptz   not null default now(),
  created_by          uuid          references auth.users(id) on delete set null,
  unique (impl_class_id, prerequisite_id),
  check (impl_class_id <> prerequisite_id)
);

create index on public.impl_class_prerequisites (impl_class_id);
create index on public.impl_class_prerequisites (prerequisite_id);
create index on public.impl_class_prerequisites (org_id);

alter table public.impl_class_prerequisites enable row level security;
create policy "impl_class_prereqs_select" on public.impl_class_prerequisites
  for select using (org_id in (select public.user_org_ids()));
create policy "impl_class_prereqs_modify" on public.impl_class_prerequisites
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

-- Cycle prevention (BFS forward; if reaching impl_class_id from prerequisite_id
-- → cycle). Mirrors the task_dependencies trigger from Phase 6.2.
create or replace function public.impl_class_prereq_no_cycle()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_cycle boolean;
begin
  with recursive reachable as (
    select new.prerequisite_id as node
    union
    select p.prerequisite_id
    from public.impl_class_prerequisites p
    join reachable r on p.impl_class_id = r.node
  )
  select exists (select 1 from reachable where node = new.impl_class_id)
  into v_cycle;
  if v_cycle then
    raise exception 'class prerequisite would create a cycle' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger impl_class_prereq_no_cycle
  before insert or update on public.impl_class_prerequisites
  for each row execute function public.impl_class_prereq_no_cycle();

-- ── impl_sessions ───────────────────────────────────────────────────────────
-- Calendar-placed sessions. The Phase 7.2 RPC fills these in. Status 'draft'
-- sessions don't roll up to v_instructor_workload; 'published' ones do (when
-- linked to instructor_id via impl_trainers — wired up in Phase 7.2).

create table public.impl_sessions (
  id                  uuid          not null default gen_random_uuid() primary key,
  org_id              uuid          not null references public.organizations(id) on delete cascade,
  implementation_id   uuid          not null references public.implementations(id) on delete cascade,
  impl_class_id       uuid          not null references public.impl_classes(id) on delete cascade,
  impl_trainer_id     uuid          references public.impl_trainers(id) on delete set null,
  impl_room_id        uuid          references public.impl_rooms(id) on delete set null,
  scheduled_start     timestamptz   not null,
  scheduled_end       timestamptz   not null,
  learners_count      integer       not null default 0 check (learners_count >= 0),
  status              text          not null default 'draft'
                        check (status in ('draft','published','cancelled')),
  conflict_status     text          not null default 'none'
                        check (conflict_status in ('none','partial','full')),
  notes               text,
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now(),
  created_by          uuid          references auth.users(id) on delete set null,
  updated_by          uuid          references auth.users(id) on delete set null,
  check (scheduled_end > scheduled_start)
);

create index on public.impl_sessions (implementation_id, scheduled_start);
create index on public.impl_sessions (impl_class_id);
create index on public.impl_sessions (impl_trainer_id, scheduled_start);
create index on public.impl_sessions (impl_room_id, scheduled_start);
create index on public.impl_sessions (org_id);

alter table public.impl_sessions enable row level security;
create policy "impl_sessions_select" on public.impl_sessions
  for select using (org_id in (select public.user_org_ids()));
create policy "impl_sessions_modify" on public.impl_sessions
  for all using (org_id in (select public.user_org_ids()))
  with check (org_id in (select public.user_org_ids()));

select public.apply_standard_triggers('impl_sessions');

create trigger set_actor_audit_fields
  before insert or update on public.impl_sessions
  for each row execute function public.set_actor_audit_fields();
