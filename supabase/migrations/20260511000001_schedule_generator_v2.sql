-- Phase B of the 2026-05-11 Training Planner overhaul:
-- Replace the schedule generator + conflict trigger with a fair, capacity-
-- aware version. See docs/build-plans/2026-05-11_training-planner-calculate-overhaul.md.
--
-- Changes vs. 20260109000002_schedule_generator.sql:
--   1. Even trainer load — pick least-loaded eligible trainer per session
--      instead of first one in junction-table order.
--   2. Best-fit room — smallest seat_capacity that satisfies, instead of
--      first one in row order (leaves bigger rooms free for bigger classes).
--   3. Pre-seed busy state from published sessions so regenerated drafts
--      avoid them instead of triggering conflicts post-insert.
--   4. Wire up impl_trainers.max_concurrent_sessions — trainer can run up
--      to N concurrent sessions in distinct rooms.
--   5. No more stub gap-sessions at window_start 00:00. Unschedulable
--      sessions appear in the response payload only; the calendar stays
--      clean.
--   6. Quantitative recommendations in the payload when there are gaps.
--   7. JSONB scratch → indexed temp tables (O(log N) lookups, was O(N²)).
--
-- Conflict trigger is updated to also honor max_concurrent_sessions — the
-- old version flagged any trainer overlap as 'partial', even when the
-- trainer's cap allowed it.

-- ── Generator ──────────────────────────────────────────────────────────────

create or replace function public.generate_implementation_schedule(p_implementation_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org_id                          uuid;
  v_window_start                    date;
  v_window_end                      date;
  v_window_weeks                    int;
  v_session_count                   int := 0;
  v_capacity_gaps                   jsonb := '[]'::jsonb;
  v_recs                            jsonb := '{}'::jsonb;

  rec_class                         record;
  rec_trainer                       record;
  rec_room                          record;
  rec_pub                           record;

  v_sessions_needed                 int;
  v_session_idx                     int;
  v_day                             date;
  v_slot_idx                        int;
  v_slot_start                      timestamptz;
  v_slot_end                        timestamptz;
  v_picked_trainer                  uuid;
  v_picked_room                     uuid;
  v_prereq_min                      timestamptz;

  v_week_key                        text;
  v_week_used                       numeric;
  v_trainer_overlap                 int;
  v_room_overlap                    int;

  v_total_trainer_hours_needed      numeric := 0;
  v_total_trainer_hours_available   numeric := 0;
  v_trainer_count                   int;
  v_avg_hpw                         numeric;
  v_deficit                         numeric;
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

  v_window_weeks := greatest(1, ceil((v_window_end - v_window_start + 1)::numeric / 7)::int);

  -- 2. Wipe drafts (published stay)
  delete from public.impl_sessions
    where implementation_id = p_implementation_id and status = 'draft';

  -- 3. Scratch temp tables (transaction-scoped, indexed)
  drop table if exists pg_temp.tmp_busy_trainer;
  create temp table pg_temp.tmp_busy_trainer (
    trainer_id uuid not null,
    ts_start   timestamptz not null,
    ts_end     timestamptz not null
  );
  create index on pg_temp.tmp_busy_trainer (trainer_id, ts_start, ts_end);

  drop table if exists pg_temp.tmp_busy_room;
  create temp table pg_temp.tmp_busy_room (
    room_id  uuid not null,
    ts_start timestamptz not null,
    ts_end   timestamptz not null
  );
  create index on pg_temp.tmp_busy_room (room_id, ts_start, ts_end);

  drop table if exists pg_temp.tmp_trainer_week;
  create temp table pg_temp.tmp_trainer_week (
    trainer_id uuid not null,
    week_key   text not null,
    hours      numeric not null default 0,
    primary key (trainer_id, week_key)
  );

  drop table if exists pg_temp.tmp_trainer_total;
  create temp table pg_temp.tmp_trainer_total (
    trainer_id uuid not null primary key,
    hours      numeric not null default 0
  );

  -- 4. Seed tmp_trainer_total with one row per trainer (so the join in step
  --    6's trainer pick works even for trainers without any sessions yet).
  insert into pg_temp.tmp_trainer_total (trainer_id, hours)
    select id, 0 from public.impl_trainers
    where implementation_id = p_implementation_id
  on conflict do nothing;

  -- 5. Pre-seed busy state from existing PUBLISHED sessions. Regeneration
  --    leaves them in place, so subsequent drafts must dodge them.
  for rec_pub in
    select * from public.impl_sessions
    where implementation_id = p_implementation_id and status = 'published'
  loop
    if rec_pub.impl_trainer_id is not null then
      insert into pg_temp.tmp_busy_trainer
        values (rec_pub.impl_trainer_id, rec_pub.scheduled_start, rec_pub.scheduled_end);

      update pg_temp.tmp_trainer_total
        set hours = hours
          + extract(epoch from (rec_pub.scheduled_end - rec_pub.scheduled_start)) / 3600.0
        where trainer_id = rec_pub.impl_trainer_id;

      v_week_key := to_char(date_trunc('week', rec_pub.scheduled_start), 'IYYY-IW');
      insert into pg_temp.tmp_trainer_week (trainer_id, week_key, hours)
      values (
        rec_pub.impl_trainer_id, v_week_key,
        extract(epoch from (rec_pub.scheduled_end - rec_pub.scheduled_start)) / 3600.0
      )
      on conflict (trainer_id, week_key) do update
        set hours = pg_temp.tmp_trainer_week.hours + excluded.hours;
    end if;
    if rec_pub.impl_room_id is not null then
      insert into pg_temp.tmp_busy_room
        values (rec_pub.impl_room_id, rec_pub.scheduled_start, rec_pub.scheduled_end);
    end if;
  end loop;

  -- 6. Walk classes in topological order. UNION (not UNION ALL) collapses
  --    re-converging DAG paths — the deepest CTE still picks max(depth).
  for rec_class in
    with recursive ord(id, depth) as (
      select c.id, 0
      from public.impl_classes c
      where c.implementation_id = p_implementation_id
        and not exists (
          select 1 from public.impl_class_prerequisites p
          where p.impl_class_id = c.id
        )
      union
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
    if v_sessions_needed = 0 then continue; end if;
    v_total_trainer_hours_needed :=
      v_total_trainer_hours_needed + v_sessions_needed * rec_class.hours_per_session;

    v_prereq_min := public.impl_class_prereq_earliest(rec_class.id);

    for v_session_idx in 1..v_sessions_needed loop
      v_picked_trainer := null;
      v_picked_room    := null;
      v_slot_start     := null;
      v_slot_end       := null;

      v_day := greatest(v_window_start, coalesce(v_prereq_min::date, v_window_start));

      <<day_loop>>
      while v_day <= v_window_end loop
        -- Best-fit room order: smallest seat_capacity that satisfies (so we
        -- leave larger rooms free for bigger classes), then most hours/day,
        -- then sort_order for determinism.
        for rec_room in
          select r.*
          from public.impl_rooms r
          where r.implementation_id = p_implementation_id
            and r.seat_capacity >= rec_class.expected_learners_per_session
            and (extract(dow from v_day)::int = any(r.available_days_of_week))
          order by r.seat_capacity, r.available_hours_per_day desc, r.sort_order
        loop
          -- Least-loaded trainer order across this class's slate, with
          -- cumulative-hours tie-break by sort_order.
          for rec_trainer in
            select t.*, coalesce(tt.hours, 0) as cum_hours
            from public.impl_class_trainers ct
            join public.impl_trainers t on t.id = ct.impl_trainer_id
            left join pg_temp.tmp_trainer_total tt on tt.trainer_id = t.id
            where ct.impl_class_id = rec_class.id
            order by coalesce(tt.hours, 0), t.sort_order
          loop
            v_slot_idx := 0;
            while (v_slot_idx + 1) * rec_class.hours_per_session <= rec_room.available_hours_per_day loop
              v_slot_start := (
                v_day::timestamp + interval '9 hours' +
                (v_slot_idx * rec_class.hours_per_session) * interval '1 hour'
              ) at time zone 'UTC';
              v_slot_end := v_slot_start + (rec_class.hours_per_session * interval '1 hour');

              -- Prereq earliest-start gate
              if v_prereq_min is not null and v_slot_start < v_prereq_min then
                v_slot_idx := v_slot_idx + 1; continue;
              end if;

              -- Room: only one class at a time (rooms have max_concurrent = 1)
              select count(*) into v_room_overlap
                from pg_temp.tmp_busy_room b
                where b.room_id = rec_room.id
                  and b.ts_start < v_slot_end
                  and b.ts_end   > v_slot_start;
              if v_room_overlap >= 1 then
                v_slot_idx := v_slot_idx + 1; continue;
              end if;

              -- Trainer concurrency: up to max_concurrent_sessions in parallel
              -- (across distinct rooms — the room check above already enforces
              -- distinct-room since rooms are 1-at-a-time).
              select count(*) into v_trainer_overlap
                from pg_temp.tmp_busy_trainer b
                where b.trainer_id = rec_trainer.id
                  and b.ts_start < v_slot_end
                  and b.ts_end   > v_slot_start;
              if v_trainer_overlap >= rec_trainer.max_concurrent_sessions then
                v_slot_idx := v_slot_idx + 1; continue;
              end if;

              -- Trainer weekly hours
              v_week_key := to_char(date_trunc('week', v_day), 'IYYY-IW');
              select coalesce(hours, 0) into v_week_used
                from pg_temp.tmp_trainer_week
                where trainer_id = rec_trainer.id and week_key = v_week_key;
              v_week_used := coalesce(v_week_used, 0);
              if v_week_used + rec_class.hours_per_session > rec_trainer.availability_hours_per_week then
                v_slot_idx := v_slot_idx + 1; continue;
              end if;

              -- Match
              v_picked_trainer := rec_trainer.id;
              v_picked_room    := rec_room.id;

              insert into pg_temp.tmp_busy_trainer values
                (rec_trainer.id, v_slot_start, v_slot_end);
              insert into pg_temp.tmp_busy_room values
                (rec_room.id, v_slot_start, v_slot_end);
              insert into pg_temp.tmp_trainer_week (trainer_id, week_key, hours)
                values (rec_trainer.id, v_week_key, rec_class.hours_per_session)
                on conflict (trainer_id, week_key) do update
                  set hours = pg_temp.tmp_trainer_week.hours + excluded.hours;
              update pg_temp.tmp_trainer_total
                set hours = hours + rec_class.hours_per_session
                where trainer_id = rec_trainer.id;

              exit day_loop;
            end loop;
          end loop;
        end loop;

        v_day := v_day + 1;
      end loop;

      if v_slot_start is null then
        -- Capacity gap: track in payload, do NOT insert a stub session.
        v_capacity_gaps := v_capacity_gaps || jsonb_build_object(
          'class_id',      rec_class.id,
          'class_name',    rec_class.name,
          'session_index', v_session_idx,
          'reason',        'No room/trainer combination fit in the window'
        );
      else
        insert into public.impl_sessions (
          org_id, implementation_id, impl_class_id, impl_trainer_id, impl_room_id,
          scheduled_start, scheduled_end, learners_count, status
        ) values (
          v_org_id, p_implementation_id, rec_class.id, v_picked_trainer, v_picked_room,
          v_slot_start, v_slot_end,
          least(
            rec_class.expected_learners_per_session,
            greatest(
              rec_class.total_people_to_train -
                (v_session_idx - 1) * rec_class.expected_learners_per_session, 0
            )
          ),
          'draft'
        );
        v_session_count := v_session_count + 1;
      end if;
    end loop;
  end loop;

  -- 7. Recommendations (only if gaps exist)
  if jsonb_array_length(v_capacity_gaps) > 0 then
    select coalesce(sum(availability_hours_per_week * v_window_weeks), 0),
           count(*),
           coalesce(avg(availability_hours_per_week), 30)
      into v_total_trainer_hours_available, v_trainer_count, v_avg_hpw
      from public.impl_trainers
      where implementation_id = p_implementation_id;

    v_deficit := v_total_trainer_hours_needed - v_total_trainer_hours_available;
    if v_deficit > 0 and v_avg_hpw > 0 then
      v_recs := jsonb_build_object(
        'trainer_hours_per_week_to_add', ceil(v_deficit / v_window_weeks),
        'trainers_to_add',               ceil((v_deficit / v_window_weeks) / v_avg_hpw),
        'weeks_to_extend',
          ceil(v_deficit / greatest(v_total_trainer_hours_available / v_window_weeks, 1))
      );
    end if;
  end if;

  return jsonb_build_object(
    'sessions',        v_session_count,
    'conflicts',       jsonb_array_length(v_capacity_gaps),
    'capacity_gaps',   v_capacity_gaps,
    'recommendations', v_recs
  );
end;
$$;

revoke execute on function public.generate_implementation_schedule(uuid) from public, anon;
grant execute on function public.generate_implementation_schedule(uuid) to authenticated;

-- ── Conflict-recompute trigger (max_concurrent-aware) ──────────────────────

create or replace function public.recompute_session_conflicts()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_trainer_overlap int := 0;
  v_room_overlap    int := 0;
  v_trainer_max     int := 1;
  v_trainer_busy    boolean;
  v_room_busy       boolean;
begin
  if new.impl_trainer_id is null then
    -- Missing trainer = full trainer conflict.
    v_trainer_busy := true;
  else
    select count(*) into v_trainer_overlap
      from public.impl_sessions s
      where s.impl_trainer_id = new.impl_trainer_id
        and s.id <> new.id
        and s.status <> 'cancelled'
        and s.scheduled_start < new.scheduled_end
        and s.scheduled_end   > new.scheduled_start;
    select coalesce(max_concurrent_sessions, 1) into v_trainer_max
      from public.impl_trainers
      where id = new.impl_trainer_id;
    v_trainer_busy := v_trainer_overlap >= coalesce(v_trainer_max, 1);
  end if;

  if new.impl_room_id is null then
    v_room_busy := true;
  else
    select count(*) into v_room_overlap
      from public.impl_sessions s
      where s.impl_room_id = new.impl_room_id
        and s.id <> new.id
        and s.status <> 'cancelled'
        and s.scheduled_start < new.scheduled_end
        and s.scheduled_end   > new.scheduled_start;
    v_room_busy := v_room_overlap >= 1;
  end if;

  new.conflict_status := case
    when v_trainer_busy and v_room_busy then 'full'
    when v_trainer_busy or  v_room_busy then 'partial'
    else 'none'
  end;
  return new;
end;
$$;
