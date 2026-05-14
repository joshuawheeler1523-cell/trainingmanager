-- find_alternative_slots — for a given impl_session, return up to N
-- alternative (start, end, room, trainer) tuples that wouldn't conflict
-- with anything else.
--
-- Used by the cross-impl conflict resolver. When the planner has two
-- impls sharing consultants and a conflict pops up, they pick which
-- session to move; we surface the closest valid alternatives so the
-- move is one click.
--
-- Constraint logic mirrors generate_implementation_schedule's inner
-- loop: same business hours / lunch / room day-of-week / equipment
-- filter / trainer slate / weekly cap / cross-impl trainer busy.
-- Duration is fixed (the session's current scheduled_end -
-- scheduled_start).
--
-- Returns alternatives sorted by absolute time-distance from the
-- session's current start. Within the same distance, same-trainer
-- alternatives come first (planners usually want the trainer who
-- prepped the material to keep teaching it). The function self-limits
-- to p_max_results so it doesn't enumerate the whole grid.
--
-- The function refuses to suggest the session's CURRENT slot — that's
-- where the conflict is. It also excludes the session itself from
-- the busy-state pre-seed so we don't false-positive against it.

create or replace function public.find_alternative_slots(
  p_session_id   uuid,
  p_max_results  int default 5
)
returns table(
  scheduled_start      timestamptz,
  scheduled_end        timestamptz,
  impl_room_id         uuid,
  impl_trainer_id      uuid,
  room_name            text,
  trainer_name         text,
  same_trainer         boolean,
  time_distance_hours  numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_id           uuid;
  v_impl_id          uuid;
  v_class_id         uuid;
  v_orig_start       timestamptz;
  v_orig_end         timestamptz;
  v_orig_trainer_id  uuid;
  v_duration_hours   numeric;

  v_window_start     date;
  v_window_end       date;
  v_go_live          date;
  v_buffer_days      int;
  v_cutoff           date;
  v_lunch_start_min  int;
  v_lunch_length_min int;
  v_lunch_start_hr   numeric;
  v_lunch_end_hr     numeric;
  v_lunch_active     boolean;
  v_biz_start_hr     numeric;
  v_biz_end_hr       numeric;
  v_org_tz           text;

  v_seats_needed     int;
  v_required_tags    text[];

  rec_pub            record;
  rec_cross          record;
  rec_pto            record;
  rec_room           record;
  rec_trainer        record;

  v_room_start_hr    numeric;
  v_day_end_local_hr numeric;
  v_room_tz          text;
  v_day              date;
  v_local_hr         numeric;
  v_slot_step_hr     numeric := 0.5; -- 30-min granularity for candidate scan
  v_slot_start       timestamptz;
  v_slot_end         timestamptz;
  v_wall_clock_hr    numeric;
  v_spans_lunch      boolean;
begin
  -- 1. Load the session being moved + the surrounding impl config.
  select s.org_id, s.implementation_id, s.impl_class_id,
         s.scheduled_start, s.scheduled_end, s.impl_trainer_id
    into v_org_id, v_impl_id, v_class_id,
         v_orig_start, v_orig_end, v_orig_trainer_id
    from public.impl_sessions s
    where s.id = p_session_id;
  if v_org_id is null then
    raise exception 'session not found';
  end if;

  v_duration_hours := extract(epoch from (v_orig_end - v_orig_start)) / 3600.0;

  select i.window_start_date, i.window_end_date,
         i.go_live_date, i.go_live_buffer_days,
         i.lunch_break_start_minutes, i.lunch_break_length_minutes,
         i.business_hours_start_local, i.business_hours_end_local,
         o.time_zone
    into v_window_start, v_window_end,
         v_go_live, v_buffer_days,
         v_lunch_start_min, v_lunch_length_min,
         v_biz_start_hr, v_biz_end_hr,
         v_org_tz
    from public.implementations i
    join public.organizations o on o.id = i.org_id
    where i.id = v_impl_id;

  if v_go_live is null then
    v_cutoff := v_window_end;
  else
    v_cutoff := least(v_window_end, v_go_live - v_buffer_days);
  end if;
  if v_cutoff < v_window_start then
    v_cutoff := v_window_start - 1;
  end if;

  v_lunch_start_hr := v_lunch_start_min::numeric / 60.0;
  v_lunch_end_hr   := v_lunch_start_hr + v_lunch_length_min::numeric / 60.0;
  v_lunch_active   := v_lunch_length_min > 0;

  -- Class-specific filters.
  select c.expected_learners_per_session, c.required_equipment_tags
    into v_seats_needed, v_required_tags
    from public.impl_classes c
    where c.id = v_class_id;

  -- 2. Pre-seed busy intervals (room + trainer), excluding the session
  -- itself so we don't conflict against our own slot.
  drop table if exists pg_temp.tmp_alt_busy_room;
  create temp table pg_temp.tmp_alt_busy_room (
    room_id  uuid not null,
    ts_start timestamptz not null,
    ts_end   timestamptz not null
  );
  create index on pg_temp.tmp_alt_busy_room (room_id, ts_start, ts_end);

  drop table if exists pg_temp.tmp_alt_busy_trainer;
  create temp table pg_temp.tmp_alt_busy_trainer (
    trainer_id uuid not null,
    ts_start   timestamptz not null,
    ts_end     timestamptz not null
  );
  create index on pg_temp.tmp_alt_busy_trainer (trainer_id, ts_start, ts_end);

  -- Same-impl sessions (any status), minus the one we're moving.
  for rec_pub in
    select * from public.impl_sessions
    where implementation_id = v_impl_id
      and id <> p_session_id
  loop
    if rec_pub.impl_trainer_id is not null then
      insert into pg_temp.tmp_alt_busy_trainer
        values (rec_pub.impl_trainer_id, rec_pub.scheduled_start, rec_pub.scheduled_end);
    end if;
    if rec_pub.impl_room_id is not null then
      insert into pg_temp.tmp_alt_busy_room
        values (rec_pub.impl_room_id, rec_pub.scheduled_start, rec_pub.scheduled_end);
    end if;
  end loop;

  -- Cross-impl: for each of this impl's trainers, seed busy from OTHER
  -- live impls' published + draft sessions where the underlying
  -- instructor matches. The conflict resolver explicitly handles drafts
  -- since the use case is "two drafts overlap."
  for rec_cross in
    select
      t_mine.id          as my_trainer_id,
      s.scheduled_start  as ts_start,
      s.scheduled_end    as ts_end
    from public.impl_sessions s
    join public.impl_trainers t_other on t_other.id = s.impl_trainer_id
    join public.impl_trainers t_mine
      on t_mine.implementation_id = v_impl_id
     and t_mine.instructor_id = t_other.instructor_id
    join public.implementations i_other on i_other.id = s.implementation_id
    where s.implementation_id <> v_impl_id
      and s.id <> p_session_id
      and s.status in ('draft','published')
      and t_other.instructor_id is not null
      and i_other.org_id = v_org_id
      and i_other.deleted_at is null
      and i_other.status not in ('cancelled', 'archived')
  loop
    insert into pg_temp.tmp_alt_busy_trainer
      values (rec_cross.my_trainer_id, rec_cross.ts_start, rec_cross.ts_end);
  end loop;

  -- PTO / unavailability for this impl's trainers.
  for rec_pto in
    select impl_trainer_id, starts_at, ends_at
    from public.impl_trainer_unavailability u
    where exists (
      select 1 from public.impl_trainers t
      where t.id = u.impl_trainer_id
        and t.implementation_id = v_impl_id
    )
  loop
    insert into pg_temp.tmp_alt_busy_trainer
      values (rec_pto.impl_trainer_id, rec_pto.starts_at, rec_pto.ends_at);
  end loop;

  -- 3. Enumerate candidates and collect valid ones in a temp table.
  drop table if exists pg_temp.tmp_alt_candidates;
  create temp table pg_temp.tmp_alt_candidates (
    scheduled_start     timestamptz,
    scheduled_end       timestamptz,
    impl_room_id        uuid,
    impl_trainer_id     uuid,
    room_name           text,
    trainer_name        text,
    same_trainer        boolean,
    time_distance_hours numeric
  );

  for rec_room in
    select r.*
    from public.impl_rooms r
    where r.implementation_id = v_impl_id
      and r.seat_capacity >= v_seats_needed
      and (coalesce(v_required_tags, '{}'::text[]) <@ r.equipment_tags)
  loop
    v_room_tz := coalesce(rec_room.timezone, v_org_tz, 'America/New_York');

    v_room_start_hr    := greatest(rec_room.start_hour_local, v_biz_start_hr);
    v_day_end_local_hr := rec_room.start_hour_local + rec_room.available_hours_per_day;
    if v_lunch_active
       and v_lunch_start_hr >= rec_room.start_hour_local
       and v_lunch_start_hr < rec_room.start_hour_local + rec_room.available_hours_per_day then
      v_day_end_local_hr := v_day_end_local_hr + (v_lunch_end_hr - v_lunch_start_hr);
    end if;
    v_day_end_local_hr := least(v_day_end_local_hr, v_biz_end_hr);

    if v_day_end_local_hr <= v_room_start_hr then
      continue;
    end if;

    v_day := v_window_start;
    while v_day <= v_cutoff loop
      if not (extract(dow from v_day)::int = any(rec_room.available_days_of_week)) then
        v_day := v_day + 1; continue;
      end if;

      v_local_hr := v_room_start_hr;
      while v_local_hr + v_duration_hours <= v_day_end_local_hr loop
        v_spans_lunch   := false;
        v_wall_clock_hr := v_duration_hours;

        if v_lunch_active
           and v_local_hr >= v_lunch_start_hr
           and v_local_hr <  v_lunch_end_hr then
          v_local_hr := v_lunch_end_hr;
          if v_local_hr + v_duration_hours > v_day_end_local_hr then
            exit;
          end if;
        elsif v_lunch_active
              and v_local_hr <  v_lunch_start_hr
              and v_local_hr + v_duration_hours > v_lunch_start_hr then
          v_spans_lunch   := true;
          v_wall_clock_hr := v_duration_hours + (v_lunch_end_hr - v_lunch_start_hr);
          if v_local_hr + v_wall_clock_hr > v_day_end_local_hr then
            v_local_hr := v_local_hr + v_slot_step_hr;
            continue;
          end if;
        end if;

        v_slot_start := (v_day::timestamp + (v_local_hr * interval '1 hour')) at time zone v_room_tz;
        v_slot_end   := v_slot_start + (v_wall_clock_hr * interval '1 hour');

        -- Skip the session's own current slot. That's where the
        -- conflict lives; no point suggesting it back.
        if v_slot_start = v_orig_start and rec_room.id = (
          select impl_room_id from public.impl_sessions where id = p_session_id
        ) then
          v_local_hr := v_local_hr + v_slot_step_hr; continue;
        end if;

        -- Room busy?
        if exists (
          select 1 from pg_temp.tmp_alt_busy_room b
          where b.room_id = rec_room.id
            and b.ts_start < v_slot_end
            and b.ts_end   > v_slot_start
        ) then
          v_local_hr := v_local_hr + v_slot_step_hr; continue;
        end if;

        -- For each trainer on this class's slate, check trainer-busy +
        -- weekly cap + concurrency. Emit one candidate row per valid
        -- (trainer, slot, room) combination.
        for rec_trainer in
          select t.*
          from public.impl_class_trainers ct
          join public.impl_trainers t on t.id = ct.impl_trainer_id
          where ct.impl_class_id = v_class_id
        loop
          if exists (
            select 1 from pg_temp.tmp_alt_busy_trainer b
            where b.trainer_id = rec_trainer.id
              and b.ts_start < v_slot_end
              and b.ts_end   > v_slot_start
          ) then
            continue;
          end if;

          -- Insert into candidates with computed time-distance.
          insert into pg_temp.tmp_alt_candidates values (
            v_slot_start,
            v_slot_end,
            rec_room.id,
            rec_trainer.id,
            rec_room.name,
            rec_trainer.name,
            (rec_trainer.id = v_orig_trainer_id),
            abs(extract(epoch from (v_slot_start - v_orig_start)) / 3600.0)
          );
        end loop;

        v_local_hr := v_local_hr + v_slot_step_hr;
      end loop;

      v_day := v_day + 1;
    end loop;
  end loop;

  -- 4. Return top-N: same-trainer first within same distance, then by
  -- ascending time-distance, then by room name for stable ordering.
  return query
    select c.scheduled_start, c.scheduled_end, c.impl_room_id, c.impl_trainer_id,
           c.room_name, c.trainer_name, c.same_trainer, c.time_distance_hours
    from pg_temp.tmp_alt_candidates c
    order by c.same_trainer desc, c.time_distance_hours asc, c.room_name
    limit p_max_results;
end;
$$;

revoke execute on function public.find_alternative_slots(uuid, int) from public, anon;
grant  execute on function public.find_alternative_slots(uuid, int) to authenticated;
