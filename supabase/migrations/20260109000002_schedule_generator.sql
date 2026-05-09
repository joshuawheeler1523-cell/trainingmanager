-- Phase 7.2 — Schedule generator + conflict-detection trigger.
--
-- The generator is a greedy scheduler:
--   1. Walk classes in topological order (prereqs first).
--   2. For each class, compute sessions_needed = ceil(total_people / per_session).
--   3. For each session: starting from the earliest valid day, scan day-by-day,
--      hour-by-hour, until we find a slot where:
--        (a) at least one trainer in the class's slate is free + has weekly
--            availability remaining
--        (b) at least one room with capacity >= per_session is free
--        (c) all prerequisite classes have at least one session scheduled by
--            then (per User Guide Module 11.2 v1 rule)
--   4. If no slot fits in the implementation window, insert a placeholder row
--      with NULL trainer/room and conflict_status = 'full'.
--   5. After every row is inserted, the recompute_session_conflicts trigger
--      double-checks the (trainer × time) and (room × time) overlap sets and
--      stamps conflict_status accordingly. The greedy walk shouldn't produce
--      conflicts; this is a safety net for hand-edits.

-- ── Helper: find prereq earliest start ──────────────────────────────────────

create or replace function public.impl_class_prereq_earliest(p_class_id uuid)
returns timestamptz
language sql stable
set search_path = ''
as $$
  -- For each prereq of this class, the EARLIEST scheduled_start across the
  -- prereq's existing sessions. The class can start once every prereq has at
  -- least one session placed; the gating start is the MAX of these earliest
  -- starts (i.e., the latest prereq's first session). NULL when this class
  -- has no prereqs.
  with prereq_first as (
    select min(s.scheduled_start) as first_start
    from public.impl_class_prerequisites p
    join public.impl_sessions s on s.impl_class_id = p.prerequisite_id
    where p.impl_class_id = p_class_id
    group by p.prerequisite_id
  )
  select max(first_start) from prereq_first;
$$;

-- ── Conflict-recompute trigger ──────────────────────────────────────────────

create or replace function public.recompute_session_conflicts()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_trainer_busy boolean := false;
  v_room_busy boolean := false;
begin
  if new.impl_trainer_id is null then
    -- Greedy generator couldn't find a trainer — full conflict.
    v_trainer_busy := true;
  else
    select exists (
      select 1 from public.impl_sessions s
      where s.impl_trainer_id = new.impl_trainer_id
        and s.id <> new.id
        and s.status <> 'cancelled'
        and s.scheduled_start < new.scheduled_end
        and s.scheduled_end   > new.scheduled_start
    ) into v_trainer_busy;
  end if;

  if new.impl_room_id is null then
    v_room_busy := true;
  else
    select exists (
      select 1 from public.impl_sessions s
      where s.impl_room_id = new.impl_room_id
        and s.id <> new.id
        and s.status <> 'cancelled'
        and s.scheduled_start < new.scheduled_end
        and s.scheduled_end   > new.scheduled_start
    ) into v_room_busy;
  end if;

  new.conflict_status := case
    when v_trainer_busy and v_room_busy then 'full'
    when v_trainer_busy or v_room_busy then 'partial'
    else 'none'
  end;
  return new;
end;
$$;

create trigger recompute_session_conflicts
  before insert or update of scheduled_start, scheduled_end, impl_trainer_id, impl_room_id, status
  on public.impl_sessions
  for each row execute function public.recompute_session_conflicts();

-- ── The generator itself ────────────────────────────────────────────────────

create or replace function public.generate_implementation_schedule(p_implementation_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org_id          uuid;
  v_window_start    date;
  v_window_end      date;
  v_session_count   int := 0;
  v_conflict_count  int := 0;
  v_capacity_gaps   jsonb := '[]'::jsonb;

  rec_class         record;
  rec_trainer       record;
  rec_room          record;

  v_sessions_needed int;
  v_session_idx     int;
  v_day             date;
  v_slot_idx        int;
  v_slot_start      timestamptz;
  v_slot_end        timestamptz;
  v_picked_trainer  uuid;
  v_picked_room     uuid;
  v_prereq_min      timestamptz;
  v_max_concurrent  smallint;

  -- Per-trainer remaining hours, keyed by week_start. Reset weekly.
  v_trainer_used jsonb := '{}'::jsonb;
  -- Per-room and per-trainer "busy intervals" we've already booked in this
  -- run (the trigger sees them only after insert; this scratch state lets
  -- the inner loops avoid them in a single pass).
  v_busy_trainer jsonb := '{}'::jsonb; -- trainer_id → array of {start, end}
  v_busy_room    jsonb := '{}'::jsonb; -- room_id    → array of {start, end}

begin
  -- 1. Load implementation window
  select org_id, window_start_date, window_end_date
    into v_org_id, v_window_start, v_window_end
    from public.implementations
    where id = p_implementation_id;
  if v_org_id is null then
    raise exception 'implementation not found';
  end if;
  if v_window_start is null or v_window_end is null then
    raise exception 'implementation window dates are required';
  end if;

  -- 2. Wipe existing draft sessions (published sessions stay — they've been
  --    committed to trainers via notification, so we don't yank them).
  delete from public.impl_sessions
    where implementation_id = p_implementation_id and status = 'draft';

  -- 3. Walk classes in topological order. We use a simple recursive CTE that
  --    assigns a depth = max(prereq.depth) + 1, then orders by depth then
  --    sort_order. Cycles can't reach here (the prereq trigger blocks them).
  for rec_class in
    with recursive ord(id, depth) as (
      select c.id, 0
      from public.impl_classes c
      where c.implementation_id = p_implementation_id
        and not exists (
          select 1 from public.impl_class_prerequisites p
          where p.impl_class_id = c.id
        )
      union all
      select c.id, ord.depth + 1
      from public.impl_classes c
      join public.impl_class_prerequisites p on p.impl_class_id = c.id
      join ord on ord.id = p.prerequisite_id
      where c.implementation_id = p_implementation_id
    ),
    deepest as (
      select id, max(depth) as depth from ord group by id
    )
    select c.*, coalesce(d.depth, 0) as depth
    from public.impl_classes c
    left join deepest d on d.id = c.id
    where c.implementation_id = p_implementation_id
    order by coalesce(d.depth, 0), c.sort_order, c.created_at
  loop
    v_sessions_needed := ceil(
      rec_class.total_people_to_train::numeric /
      greatest(rec_class.expected_learners_per_session, 1)::numeric
    )::int;
    if v_sessions_needed = 0 then
      continue;
    end if;

    v_prereq_min := public.impl_class_prereq_earliest(rec_class.id);

    for v_session_idx in 1..v_sessions_needed loop
      v_picked_trainer := null;
      v_picked_room    := null;
      v_slot_start     := null;
      v_slot_end       := null;

      -- Walk days from window_start (or prereq_min, whichever is later) until
      -- window_end. For each day, scan hour slots. Pick the first day+slot
      -- where we can find an eligible trainer + room.
      v_day := greatest(
        v_window_start,
        coalesce(v_prereq_min::date, v_window_start)
      );

      <<day_loop>>
      while v_day <= v_window_end loop
        -- Iterate trainers in the class's slate
        for rec_trainer in
          select t.*
          from public.impl_class_trainers ct
          join public.impl_trainers t on t.id = ct.impl_trainer_id
          where ct.impl_class_id = rec_class.id
        loop
          -- Iterate rooms with sufficient capacity, available on this day
          for rec_room in
            select r.*
            from public.impl_rooms r
            where r.implementation_id = p_implementation_id
              and r.seat_capacity >= rec_class.expected_learners_per_session
              and (extract(dow from v_day)::int = any(r.available_days_of_week))
          loop
            -- For each candidate slot of this length on this day...
            v_slot_idx := 0;
            while
              (v_slot_idx + 1) * rec_class.hours_per_session <= rec_room.available_hours_per_day
            loop
              v_slot_start := (v_day::timestamp + interval '9 hours' +
                               (v_slot_idx * rec_class.hours_per_session) * interval '1 hour')
                              at time zone 'UTC';
              v_slot_end   := v_slot_start +
                              (rec_class.hours_per_session * interval '1 hour');

              -- Prereq gate
              if v_prereq_min is not null and v_slot_start < v_prereq_min then
                v_slot_idx := v_slot_idx + 1;
                continue;
              end if;

              -- Trainer not busy in scratch state?
              if exists (
                select 1
                from jsonb_array_elements(coalesce(v_busy_trainer->rec_trainer.id::text, '[]'::jsonb)) e
                where (e->>'start')::timestamptz < v_slot_end
                  and (e->>'end')::timestamptz   > v_slot_start
              ) then
                v_slot_idx := v_slot_idx + 1;
                continue;
              end if;
              -- Room not busy?
              if exists (
                select 1
                from jsonb_array_elements(coalesce(v_busy_room->rec_room.id::text, '[]'::jsonb)) e
                where (e->>'start')::timestamptz < v_slot_end
                  and (e->>'end')::timestamptz   > v_slot_start
              ) then
                v_slot_idx := v_slot_idx + 1;
                continue;
              end if;

              -- Trainer max_concurrent: greedy treats it as 1 (the busy-list
              -- check above already enforces non-overlap). For values > 1 we
              -- could relax that, but v1 keeps it simple.

              -- Trainer weekly hours remaining?
              declare
                v_week_key text := to_char(date_trunc('week', v_day), 'IYYY-IW');
                v_used numeric := coalesce(
                  ((v_trainer_used->rec_trainer.id::text)->>v_week_key)::numeric,
                  0
                );
              begin
                if v_used + rec_class.hours_per_session
                   > rec_trainer.availability_hours_per_week then
                  v_slot_idx := v_slot_idx + 1;
                  continue;
                end if;

                -- Found it!
                v_picked_trainer := rec_trainer.id;
                v_picked_room    := rec_room.id;

                -- Update scratch state
                v_busy_trainer := jsonb_set(
                  v_busy_trainer,
                  array[rec_trainer.id::text],
                  coalesce(v_busy_trainer->rec_trainer.id::text, '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object('start', v_slot_start, 'end', v_slot_end)),
                  true
                );
                v_busy_room := jsonb_set(
                  v_busy_room,
                  array[rec_room.id::text],
                  coalesce(v_busy_room->rec_room.id::text, '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object('start', v_slot_start, 'end', v_slot_end)),
                  true
                );
                v_trainer_used := jsonb_set(
                  v_trainer_used,
                  array[rec_trainer.id::text, v_week_key],
                  to_jsonb(v_used + rec_class.hours_per_session),
                  true
                );
                exit day_loop;
              end;
            end loop;
          end loop;
        end loop;

        v_day := v_day + 1;
      end loop;

      -- Insert the session row (or a conflict placeholder if no slot fit).
      if v_slot_start is null then
        v_slot_start := v_window_start::timestamp at time zone 'UTC';
        v_slot_end   := v_slot_start + (rec_class.hours_per_session * interval '1 hour');
        v_capacity_gaps := v_capacity_gaps || jsonb_build_object(
          'class_id', rec_class.id,
          'class_name', rec_class.name,
          'session_index', v_session_idx,
          'reason', 'No room/trainer combination fit in the window'
        );
        v_conflict_count := v_conflict_count + 1;
      end if;

      insert into public.impl_sessions (
        org_id, implementation_id, impl_class_id, impl_trainer_id, impl_room_id,
        scheduled_start, scheduled_end, learners_count, status
      ) values (
        v_org_id, p_implementation_id, rec_class.id, v_picked_trainer, v_picked_room,
        v_slot_start, v_slot_end,
        least(rec_class.expected_learners_per_session,
              greatest(rec_class.total_people_to_train -
                       (v_session_idx - 1) * rec_class.expected_learners_per_session, 0)),
        'draft'
      );
      v_session_count := v_session_count + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'sessions',       v_session_count,
    'conflicts',      v_conflict_count,
    'capacity_gaps',  v_capacity_gaps
  );
end;
$$;

grant execute on function public.generate_implementation_schedule(uuid) to authenticated;

-- ── Workload contribution: published sessions surface as project_task ───────
-- Per User Guide §11.4: published sessions roll up to v_instructor_workload.
-- We don't add a 6th source enum (project_task is taken); instead, add a
-- branch in the same view that reads impl_sessions joined to impl_trainers.
-- Draft / cancelled sessions are excluded so capacity reflects only commits.

create or replace view public.v_instructor_workload as
-- Source 1: Classes
select
  c.org_id                as org_id,
  cia.instructor_id       as instructor_id,
  'class'                 as source,
  c.id                    as source_id,
  c.name                  as source_label,
  cia.assigned_offerings  as quantity,
  ((case when c.is_multi_day and c.custom_day_hours is not null
      then (select sum(h) from unnest(c.custom_day_hours) h)
      else coalesce(c.hours_per_day, 0) * c.total_days end)
   + c.prep_hours_per_offering + c.logistics_hours_per_offering
  ) * cia.assigned_offerings as annual_hours,
  c.allocation_bucket_id  as bucket_id
from public.class_instructor_assignments cia
join public.classes c on c.id = cia.class_id and c.deleted_at is null
where cia.assigned_offerings > 0

union all
select
  rt.org_id, rta.instructor_id, 'recurring_task', rt.id, rt.name, null::integer,
  rt.hours_per_occurrence
    * coalesce(rt.occurrences_per_year, public.frequency_to_annual(rt.frequency))
    * (rta.share_percent / 100.0),
  rt.bucket_id
from public.recurring_task_assignments rta
join public.recurring_tasks rt on rt.id = rta.recurring_task_id and rt.deleted_at is null
where rt.status = 'active'

union all
select
  aht.org_id, aht.instructor_id, 'ad_hoc_task', aht.id, aht.name, null::integer,
  aht.hours, aht.bucket_id
from public.ad_hoc_tasks aht
where aht.instructor_id is not null and aht.status in ('open','in_progress')

union all
select
  era.org_id, era.instructor_id, 'education_request', er.id, er.title, null::integer,
  era.estimated_hours, null::uuid
from public.education_request_assignments era
join public.education_requests er on er.id = era.request_id and er.deleted_at is null
where er.status in ('approved','assigned','in_progress')

union all
select
  ta.org_id, ptm.instructor_id, 'project_task', t.id,
  p.name || ' · ' || t.name, null::integer, ta.allocated_hours, p.bucket_id
from public.task_assignments ta
join public.project_team_members ptm on ptm.id = ta.project_team_member_id
join public.tasks t on t.id = ta.task_id
join public.projects p on p.id = t.project_id and p.deleted_at is null
where p.status in ('planning','active') and t.status in ('not_started','in_progress')

union all
-- Source 7 extension: Training Planner published sessions. Surface with
-- source = 'project_task' so existing UI lights up; the source_label
-- carries the implementation context.
select
  s.org_id,
  it.instructor_id,
  'project_task'                                         as source,
  s.id                                                    as source_id,
  i.name || ' · ' || c.name                              as source_label,
  null::integer                                           as quantity,
  extract(epoch from (s.scheduled_end - s.scheduled_start)) / 3600.0 as annual_hours,
  null::uuid                                              as bucket_id
from public.impl_sessions s
join public.impl_classes c on c.id = s.impl_class_id
join public.impl_trainers it on it.id = s.impl_trainer_id
join public.implementations i on i.id = s.implementation_id
where s.status = 'published'
  and it.instructor_id is not null
  and s.impl_trainer_id is not null;
