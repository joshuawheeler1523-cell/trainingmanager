-- Cross-implementation trainer conflict detection.
--
-- Scenario: an org runs two simultaneous training implementations (e.g. two
-- hospitals going live on the same EMR). Rooms and students are per-site, but
-- some trainers float between sites. The schedule generator and the conflict
-- trigger must treat a single PERSON (linked via impl_trainers.instructor_id)
-- as one resource across all implementations in the org, so that two
-- overlapping sessions taught by the same human get flagged even when they
-- live in different impl_trainers rows in different implementations.
--
-- Decisions locked with the user on 2026-05-11:
--   • Both implementations live in the same Arbor org_id.
--   • Cross-impl trainer conflict = 'full' severity (red, blocks Publish).
--   • Linkage is via impl_trainers.instructor_id. External trainers
--     (instructor_id NULL) are NOT cross-checked — UI must enforce linking
--     for any trainer that will work multi-site.
--
-- Pieces:
--   1. recompute_session_conflicts (BEFORE) — extended to detect
--      cross-impl overlaps and produce a specific conflict_reason.
--   2. recompute_sibling_session_conflicts (AFTER) — recomputes the
--      conflict_status of every OTHER session for the affected trainer/
--      instructor when one session changes, so flagging is bilateral
--      rather than only-the-latest-inserted.
--   3. generate_implementation_schedule — pre-seeds tmp_busy_trainer
--      from published sessions in OTHER implementations whose trainers
--      link to the same instructor, so the greedy generator stops
--      auto-creating cross-impl conflicts.
--
-- Sessions in implementations with deleted_at IS NOT NULL or status in
-- ('cancelled', 'archived') are EXCLUDED from cross-impl checks — those
-- impls aren't "live" obligations.

-- ── 1. BEFORE trigger: cross-impl-aware conflict detection ─────────────────

create or replace function public.recompute_session_conflicts()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_my_instructor_id  uuid;
  v_trainer_overlap   int := 0;
  v_room_overlap      int := 0;
  v_trainer_max       int := 1;
  v_trainer_busy      boolean;
  v_room_busy         boolean;
  v_prereq_violation  boolean := false;
  v_prereq_name       text;
  v_conflict_detail   text;
  v_other_impl_name   text;
  v_other_class_name  text;
  v_other_start       timestamptz;
  v_other_end         timestamptz;
  v_other_is_cross    boolean;
  v_reasons           text[] := '{}';
begin
  -- Look up this session's trainer's underlying instructor link. Null if the
  -- trainer is external (no instructor record). Cross-impl check disables
  -- itself for null linkage by design.
  if new.impl_trainer_id is not null then
    select instructor_id into v_my_instructor_id
      from public.impl_trainers
      where id = new.impl_trainer_id;
  end if;

  -- Trainer conflict: in-impl (same impl_trainer_id) OR cross-impl (different
  -- impl_trainer_id row but same instructor_id, within the same org, in a
  -- live implementation).
  if new.impl_trainer_id is null then
    v_trainer_busy := true;
    v_reasons := array_append(v_reasons, 'No trainer assigned');
  else
    select count(*) into v_trainer_overlap
      from public.impl_sessions s
      join public.impl_trainers t on t.id = s.impl_trainer_id
      join public.implementations i on i.id = s.implementation_id
      where s.id <> new.id
        and s.status <> 'cancelled'
        and i.deleted_at is null
        and i.status not in ('cancelled', 'archived')
        and s.scheduled_start < new.scheduled_end
        and s.scheduled_end   > new.scheduled_start
        and (
          s.impl_trainer_id = new.impl_trainer_id
          or (
            v_my_instructor_id is not null
            and t.instructor_id = v_my_instructor_id
            and t.id <> new.impl_trainer_id
          )
        );

    select coalesce(max_concurrent_sessions, 1) into v_trainer_max
      from public.impl_trainers
      where id = new.impl_trainer_id;

    -- max_concurrent applies per-PERSON. Cross-impl branch already enforces
    -- "different impl_trainer_id" so a max_concurrent > 1 trainer in the
    -- same impl_trainers row is honored, but the same person can't be in
    -- two places at once across impls regardless of cap.
    v_trainer_busy := v_trainer_overlap >= coalesce(v_trainer_max, 1);

    -- If busy, fetch a representative offending session's details for the
    -- reason text. Prefer a cross-impl match for the detail (more useful
    -- to the planner than the generic "double-booked").
    if v_trainer_busy then
      select i.name, c.name, s.scheduled_start, s.scheduled_end,
             s.implementation_id <> new.implementation_id
        into v_other_impl_name, v_other_class_name,
             v_other_start, v_other_end, v_other_is_cross
        from public.impl_sessions s
        join public.impl_trainers t on t.id = s.impl_trainer_id
        join public.implementations i on i.id = s.implementation_id
        join public.impl_classes c on c.id = s.impl_class_id
        where s.id <> new.id
          and s.status <> 'cancelled'
          and i.deleted_at is null
          and i.status not in ('cancelled', 'archived')
          and s.scheduled_start < new.scheduled_end
          and s.scheduled_end   > new.scheduled_start
          and (
            s.impl_trainer_id = new.impl_trainer_id
            or (
              v_my_instructor_id is not null
              and t.instructor_id = v_my_instructor_id
              and t.id <> new.impl_trainer_id
            )
          )
        order by
          case when s.implementation_id <> new.implementation_id then 0 else 1 end,
          s.scheduled_start
        limit 1;

      if v_other_is_cross then
        v_conflict_detail :=
          'Trainer is also teaching "' || coalesce(v_other_class_name, '?')
          || '" in implementation "' || coalesce(v_other_impl_name, '?')
          || '" at ' || to_char(v_other_start, 'YYYY-MM-DD HH24:MI')
          || '–' || to_char(v_other_end, 'HH24:MI');
      else
        v_conflict_detail := 'Trainer double-booked';
      end if;
      v_reasons := array_append(v_reasons, v_conflict_detail);
    end if;
  end if;

  -- Room conflict (in-impl only; rooms aren't shared across implementations).
  if new.impl_room_id is null then
    v_room_busy := true;
    v_reasons := array_append(v_reasons, 'No room assigned');
  else
    select count(*) into v_room_overlap
      from public.impl_sessions s
      where s.impl_room_id = new.impl_room_id
        and s.id <> new.id
        and s.status <> 'cancelled'
        and s.scheduled_start < new.scheduled_end
        and s.scheduled_end   > new.scheduled_start;
    v_room_busy := v_room_overlap >= 1;
    if v_room_busy then
      v_reasons := array_append(v_reasons, 'Room double-booked');
    end if;
  end if;

  -- Prerequisite violation (in-impl class prereqs).
  if new.status <> 'cancelled' then
    select c.name into v_prereq_name
    from public.impl_class_prerequisites p
    join public.impl_classes c on c.id = p.prerequisite_id
    where p.impl_class_id = new.impl_class_id
      and exists (
        select 1 from public.impl_sessions ps
        where ps.impl_class_id = p.prerequisite_id
          and ps.id <> new.id
          and ps.status <> 'cancelled'
          and ps.scheduled_end > new.scheduled_start
      )
    order by c.sort_order, c.name
    limit 1;
    if v_prereq_name is not null then
      v_prereq_violation := true;
      v_reasons := array_append(
        v_reasons,
        'Prerequisite "' || v_prereq_name || '" has sessions after this one starts'
      );
    end if;
  end if;

  -- Status:
  --   • prereq violation OR both-resource busy → 'full' (hard block)
  --   • cross-impl trainer conflict alone → 'full' (hard block — a human
  --     can't be in two places at once; can't be resolved by moving the
  --     room here, only by reassigning the trainer)
  --   • single-resource (trainer OR room) conflict → 'partial'
  --   • neither → 'none'
  new.conflict_status := case
    when v_prereq_violation then 'full'
    when v_trainer_busy and v_room_busy then 'full'
    when v_trainer_busy and v_other_is_cross then 'full'
    when v_trainer_busy or  v_room_busy then 'partial'
    else 'none'
  end;
  new.conflict_reason := case
    when array_length(v_reasons, 1) is null then null
    else array_to_string(v_reasons, ' · ')
  end;
  return new;
end;
$$;

-- ── 2. AFTER trigger: recompute siblings for bilateral flagging ────────────
--
-- The BEFORE trigger only stamps the row being written; previously the
-- "sibling" session keeps a stale conflict_status. This AFTER trigger
-- restamps every session that shares the same trainer (or same instructor
-- via cross-impl linkage) by issuing a no-op UPDATE that re-fires the
-- BEFORE trigger. pg_trigger_depth() check prevents the AFTER trigger
-- from re-entering when WE caused the sibling update.

create or replace function public.recompute_sibling_session_conflicts()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_my_instructor_id  uuid;
  v_old_instructor_id uuid;
  v_sibling_id        uuid;
begin
  -- Skip when called recursively from our own UPDATE.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  -- Pull instructor links for both NEW and OLD (UPDATE may have changed the
  -- trainer). For DELETE we'd need OLD; we don't currently install this
  -- trigger for DELETE since cascade-deletes shouldn't trigger sibling
  -- recompute fanout.
  if new.impl_trainer_id is not null then
    select instructor_id into v_my_instructor_id
      from public.impl_trainers where id = new.impl_trainer_id;
  end if;
  if tg_op = 'UPDATE' and old.impl_trainer_id is not null
     and old.impl_trainer_id <> new.impl_trainer_id then
    select instructor_id into v_old_instructor_id
      from public.impl_trainers where id = old.impl_trainer_id;
  end if;

  -- Recompute every sibling that overlaps NEW's window OR OLD's window
  -- (UPDATE may have moved a session, so the previously-overlapping rows
  -- may now be free; they need a recompute too).
  for v_sibling_id in
    select s.id
    from public.impl_sessions s
    join public.impl_trainers t on t.id = s.impl_trainer_id
    join public.implementations i on i.id = s.implementation_id
    where s.id <> new.id
      and s.status <> 'cancelled'
      and i.deleted_at is null
      and i.status not in ('cancelled', 'archived')
      and (
        -- Overlap with NEW
        (s.scheduled_start < new.scheduled_end and s.scheduled_end > new.scheduled_start
         and (
           (new.impl_trainer_id is not null and s.impl_trainer_id = new.impl_trainer_id)
           or s.impl_room_id = new.impl_room_id
           or (
             v_my_instructor_id is not null
             and t.instructor_id = v_my_instructor_id
             and t.id <> new.impl_trainer_id
           )
         )
        )
        or
        -- Overlap with OLD (only on UPDATE, only when trainer/time/room changed)
        (tg_op = 'UPDATE' and (
            (s.scheduled_start < old.scheduled_end and s.scheduled_end > old.scheduled_start
             and (
               (old.impl_trainer_id is not null and s.impl_trainer_id = old.impl_trainer_id)
               or s.impl_room_id = old.impl_room_id
               or (
                 v_old_instructor_id is not null
                 and t.instructor_id = v_old_instructor_id
                 and t.id <> old.impl_trainer_id
               )
             )
            )
          )
        )
      )
  loop
    -- No-op write that targets a column the BEFORE trigger watches. This
    -- forces recompute_session_conflicts to re-evaluate the sibling's
    -- conflict_status against the new world state.
    update public.impl_sessions
      set scheduled_start = scheduled_start
      where id = v_sibling_id;
  end loop;

  return null;
end;
$$;

drop trigger if exists recompute_sibling_session_conflicts on public.impl_sessions;
create trigger recompute_sibling_session_conflicts
  after insert or update of
    scheduled_start, scheduled_end,
    impl_trainer_id, impl_room_id,
    impl_class_id, status
  on public.impl_sessions
  for each row execute function public.recompute_sibling_session_conflicts();

-- ── 3. Generator: pre-seed cross-impl published sessions ───────────────────
--
-- Replaces the Phase D generator (20260511000003_go_live_buffer.sql) +
-- department_id fix (20260511000005). All prior generator behavior preserved;
-- only addition is the cross-impl pre-seed block immediately after the
-- in-impl published-session pre-seed.

create or replace function public.generate_implementation_schedule(p_implementation_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org_id                          uuid;
  v_department_id                   uuid;
  v_org_tz                          text;
  v_window_start                    date;
  v_window_end                      date;
  v_go_live                         date;
  v_buffer_days                     int;
  v_cutoff_date                     date;
  v_window_weeks                    int;
  v_session_count                   int := 0;
  v_capacity_gaps                   jsonb := '[]'::jsonb;
  v_recs                            jsonb := '{}'::jsonb;
  v_lunch_start_min                 int;
  v_lunch_length_min                int;
  v_lunch_start_hr                  numeric;
  v_lunch_end_hr                    numeric;
  v_lunch_active                    boolean;

  rec_class                         record;
  rec_trainer                       record;
  rec_room                          record;
  rec_pub                           record;
  rec_cross                         record;

  v_sessions_needed                 int;
  v_session_idx                     int;
  v_day                             date;
  v_slot_start                      timestamptz;
  v_slot_end                        timestamptz;
  v_picked_trainer                  uuid;
  v_picked_room                     uuid;
  v_prereq_min                      timestamptz;

  v_week_key                        text;
  v_week_used                       numeric;
  v_trainer_overlap                 int;
  v_room_overlap                    int;

  v_local_hr                        numeric;
  v_day_end_local_hr                numeric;
  v_room_tz                         text;

  v_total_trainer_hours_needed      numeric := 0;
  v_total_trainer_hours_available   numeric := 0;
  v_trainer_count                   int;
  v_avg_hpw                         numeric;
  v_deficit                         numeric;
begin
  select i.org_id, i.department_id,
         i.window_start_date, i.window_end_date,
         i.go_live_date, i.go_live_buffer_days,
         i.lunch_break_start_minutes, i.lunch_break_length_minutes,
         o.time_zone
    into v_org_id, v_department_id,
         v_window_start, v_window_end,
         v_go_live, v_buffer_days,
         v_lunch_start_min, v_lunch_length_min,
         v_org_tz
    from public.implementations i
    join public.organizations o on o.id = i.org_id
    where i.id = p_implementation_id;
  if v_org_id is null then
    raise exception 'implementation not found';
  end if;
  if v_department_id is null then
    raise exception 'implementation is missing department_id (data integrity bug)';
  end if;
  if v_window_start is null or v_window_end is null then
    raise exception 'implementation window dates are required';
  end if;

  if v_go_live is null then
    v_cutoff_date := v_window_end;
  else
    v_cutoff_date := least(v_window_end, v_go_live - v_buffer_days);
  end if;
  if v_cutoff_date < v_window_start then
    v_cutoff_date := v_window_start - 1;
  end if;

  v_window_weeks := greatest(1, ceil((v_window_end - v_window_start + 1)::numeric / 7)::int);
  v_lunch_start_hr  := v_lunch_start_min::numeric / 60.0;
  v_lunch_end_hr    := (v_lunch_start_min + v_lunch_length_min)::numeric / 60.0;
  v_lunch_active    := v_lunch_length_min > 0;

  delete from public.impl_sessions
    where implementation_id = p_implementation_id and status = 'draft';

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

  insert into pg_temp.tmp_trainer_total (trainer_id, hours)
    select id, 0 from public.impl_trainers
    where implementation_id = p_implementation_id
  on conflict do nothing;

  -- Pre-seed busy from PUBLISHED sessions in this implementation.
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

  -- CROSS-IMPL pre-seed: published sessions in OTHER live implementations
  -- where the trainer's underlying instructor matches a trainer in THIS
  -- implementation. The busy interval is recorded under OUR trainer_id so
  -- the generator's overlap checks treat the cross-impl session as if it
  -- were our own trainer's commitment. Weekly hours and total assigned are
  -- NOT incremented — those track this impl's load only.
  for rec_cross in
    select
      t_mine.id          as my_trainer_id,
      s.scheduled_start  as ts_start,
      s.scheduled_end    as ts_end
    from public.impl_sessions s
    join public.impl_trainers t_other on t_other.id = s.impl_trainer_id
    join public.impl_trainers t_mine
      on t_mine.implementation_id = p_implementation_id
     and t_mine.instructor_id = t_other.instructor_id
    join public.implementations i_other on i_other.id = s.implementation_id
    where s.implementation_id <> p_implementation_id
      and s.status = 'published'
      and t_other.instructor_id is not null
      and i_other.org_id = v_org_id
      and i_other.deleted_at is null
      and i_other.status not in ('cancelled', 'archived')
  loop
    insert into pg_temp.tmp_busy_trainer
      values (rec_cross.my_trainer_id, rec_cross.ts_start, rec_cross.ts_end);
  end loop;

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
      while v_day <= v_cutoff_date loop
        for rec_room in
          select r.*
          from public.impl_rooms r
          where r.implementation_id = p_implementation_id
            and r.seat_capacity >= rec_class.expected_learners_per_session
            and (extract(dow from v_day)::int = any(r.available_days_of_week))
            and (rec_class.required_equipment_tags <@ r.equipment_tags)
          order by r.seat_capacity, r.available_hours_per_day desc, r.sort_order
        loop
          v_room_tz := coalesce(rec_room.timezone, v_org_tz, 'America/New_York');
          v_day_end_local_hr := rec_room.start_hour_local + rec_room.available_hours_per_day;
          if v_lunch_active
             and v_lunch_start_hr >= rec_room.start_hour_local
             and v_lunch_start_hr < rec_room.start_hour_local + rec_room.available_hours_per_day then
            v_day_end_local_hr := v_day_end_local_hr + v_lunch_length_min::numeric / 60.0;
          end if;

          for rec_trainer in
            select t.*, coalesce(tt.hours, 0) as cum_hours
            from public.impl_class_trainers ct
            join public.impl_trainers t on t.id = ct.impl_trainer_id
            left join pg_temp.tmp_trainer_total tt on tt.trainer_id = t.id
            where ct.impl_class_id = rec_class.id
            order by coalesce(tt.hours, 0), t.sort_order
          loop
            v_local_hr := rec_room.start_hour_local;
            while v_local_hr + rec_class.hours_per_session <= v_day_end_local_hr loop
              if v_lunch_active
                 and v_local_hr < v_lunch_end_hr
                 and v_local_hr + rec_class.hours_per_session > v_lunch_start_hr then
                v_local_hr := v_lunch_end_hr;
                if v_local_hr + rec_class.hours_per_session > v_day_end_local_hr then
                  exit;
                end if;
              end if;

              v_slot_start := (v_day::timestamp + (v_local_hr * interval '1 hour')) at time zone v_room_tz;
              v_slot_end   := v_slot_start + (rec_class.hours_per_session * interval '1 hour');

              if v_prereq_min is not null and v_slot_start < v_prereq_min then
                v_local_hr := v_local_hr + rec_class.hours_per_session; continue;
              end if;

              select count(*) into v_room_overlap
                from pg_temp.tmp_busy_room b
                where b.room_id = rec_room.id
                  and b.ts_start < v_slot_end
                  and b.ts_end   > v_slot_start;
              if v_room_overlap >= 1 then
                v_local_hr := v_local_hr + rec_class.hours_per_session; continue;
              end if;

              select count(*) into v_trainer_overlap
                from pg_temp.tmp_busy_trainer b
                where b.trainer_id = rec_trainer.id
                  and b.ts_start < v_slot_end
                  and b.ts_end   > v_slot_start;
              if v_trainer_overlap >= rec_trainer.max_concurrent_sessions then
                v_local_hr := v_local_hr + rec_class.hours_per_session; continue;
              end if;

              v_week_key := to_char(date_trunc('week', v_day), 'IYYY-IW');
              select coalesce(hours, 0) into v_week_used
                from pg_temp.tmp_trainer_week
                where trainer_id = rec_trainer.id and week_key = v_week_key;
              v_week_used := coalesce(v_week_used, 0);
              if v_week_used + rec_class.hours_per_session > rec_trainer.availability_hours_per_week then
                v_local_hr := v_local_hr + rec_class.hours_per_session; continue;
              end if;

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
        v_capacity_gaps := v_capacity_gaps || jsonb_build_object(
          'class_id',      rec_class.id,
          'class_name',    rec_class.name,
          'session_index', v_session_idx,
          'reason',
            case when v_go_live is not null and v_cutoff_date < v_window_end
                 then 'No slot fit before go-live buffer cutoff (' || v_cutoff_date || ')'
                 else 'No room/trainer combination fit in the window' end
        );
      else
        insert into public.impl_sessions (
          org_id, department_id, implementation_id, impl_class_id,
          impl_trainer_id, impl_room_id,
          scheduled_start, scheduled_end, learners_count, status
        ) values (
          v_org_id, v_department_id, p_implementation_id, rec_class.id,
          v_picked_trainer, v_picked_room,
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
    'recommendations', v_recs,
    'cutoff_date',     v_cutoff_date
  );
end;
$$;

revoke execute on function public.generate_implementation_schedule(uuid) from public, anon;
grant execute on function public.generate_implementation_schedule(uuid) to authenticated;
