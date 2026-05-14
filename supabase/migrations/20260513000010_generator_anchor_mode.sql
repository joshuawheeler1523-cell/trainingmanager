-- Generator anchor mode: lock one or more other implementations as
-- immovable busy state, regenerate this impl around them, and abort
-- the regen entirely if any session can't be placed cleanly.
--
-- Use case: two impls share consulting trainers and their generated
-- schedules overlap. Planner picks the higher-priority impl as the
-- "anchor" and reruns Generate on the other one — the generator now
-- treats the anchor's sessions (draft + published) as immovable, just
-- like cross-impl published sessions today.
--
-- Atomicity guarantee: when p_anchor_impls is non-empty AND the plan
-- produces ANY capacity gap, the function writes nothing — no draft
-- deletes, no inserts. The existing schedule is preserved and the
-- planner sees the gap list so they can either un-anchor, broaden the
-- window, or add trainers. This matches "don't half-reschedule"
-- expectations: without it, an aborted regen could leave the impl
-- with a partial plan worse than what was there before.
--
-- The non-anchor flow is unchanged (signature is back-compat via
-- default empty array). Dry-run mode still skips writes regardless.
--
-- Implementation notes:
--   * Placements stage into pg_temp.tmp_intended_placements during the
--     loop instead of inserting directly into impl_sessions.
--   * At the end: if we should commit (not dry-run AND either no
--     anchors or no gaps), we DELETE current drafts and INSERT from
--     the staging table in one shot.
--   * Anchor pre-seed uses the same shared-instructor_id pattern as
--     the existing cross-impl pre-seed, but widens status to include
--     drafts and constrains to p_anchor_impls. The two pre-seeds can
--     produce duplicates for the same intervals — harmless, the
--     overlap check only needs to find ONE blocking row.
--
-- Signature change (added p_anchor_impls) → DROP + CREATE.

drop function if exists public.generate_implementation_schedule(uuid, boolean);

create or replace function public.generate_implementation_schedule(
  p_implementation_id uuid,
  p_dry_run           boolean default false,
  p_anchor_impls      uuid[]  default '{}'::uuid[]
)
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
  v_lunch_length_hr                 numeric;
  v_lunch_start_hr                  numeric;
  v_lunch_end_hr                    numeric;
  v_lunch_active                    boolean;
  v_biz_start_hr                    numeric;
  v_biz_end_hr                      numeric;

  rec_class                         record;
  rec_trainer                       record;
  rec_room                          record;
  rec_pub                           record;
  rec_cross                         record;
  rec_anchor                        record;
  rec_pto                           record;
  rec_intended                      record;

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
  v_room_start_hr                   numeric;
  v_day_end_local_hr                numeric;
  v_room_tz                         text;
  v_wall_clock_hr                   numeric;
  v_spans_lunch                     boolean;

  v_total_trainer_hours_needed      numeric := 0;
  v_total_trainer_hours_available   numeric := 0;
  v_trainer_count                   int;
  v_avg_hpw                         numeric;
  v_deficit                         numeric;

  v_anchor_mode                     boolean;
  v_anchor_names                    jsonb := '[]'::jsonb;
  v_should_commit                   boolean;
begin
  v_anchor_mode := coalesce(array_length(p_anchor_impls, 1), 0) > 0;

  select i.org_id, i.department_id,
         i.window_start_date, i.window_end_date,
         i.go_live_date, i.go_live_buffer_days,
         i.lunch_break_start_minutes, i.lunch_break_length_minutes,
         i.business_hours_start_local, i.business_hours_end_local,
         o.time_zone
    into v_org_id, v_department_id,
         v_window_start, v_window_end,
         v_go_live, v_buffer_days,
         v_lunch_start_min, v_lunch_length_min,
         v_biz_start_hr, v_biz_end_hr,
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

  v_window_weeks    := greatest(1, ceil((v_window_end - v_window_start + 1)::numeric / 7)::int);
  v_lunch_start_hr  := v_lunch_start_min::numeric / 60.0;
  v_lunch_length_hr := v_lunch_length_min::numeric / 60.0;
  v_lunch_end_hr    := v_lunch_start_hr + v_lunch_length_hr;
  v_lunch_active    := v_lunch_length_min > 0;

  -- Capture anchor impl names for the return JSON so the UI can render
  -- "anchored against: <names>" attribution. Restricted to anchors in
  -- the same org as a safety belt.
  if v_anchor_mode then
    select coalesce(
             jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name) order by i.name),
             '[]'::jsonb
           )
      into v_anchor_names
      from public.implementations i
      where i.id = any(p_anchor_impls)
        and i.org_id = v_org_id
        and i.id <> p_implementation_id;
  end if;

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

  -- Staging table for intended placements. Used in anchor / dry-run
  -- modes so we can commit-or-skip atomically at the end.
  drop table if exists pg_temp.tmp_intended_placements;
  create temp table pg_temp.tmp_intended_placements (
    impl_class_id    uuid not null,
    impl_trainer_id  uuid not null,
    impl_room_id     uuid not null,
    scheduled_start  timestamptz not null,
    scheduled_end    timestamptz not null,
    learners_count   int  not null
  );

  insert into pg_temp.tmp_trainer_total (trainer_id, hours)
    select id, 0 from public.impl_trainers
    where implementation_id = p_implementation_id
  on conflict do nothing;

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

  -- Existing cross-impl pre-seed: PUBLISHED sessions in other live
  -- impls, mapped to this impl's trainers via shared instructor_id.
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

  -- NEW: anchor pre-seed. For each anchored impl, seed busy from its
  -- draft + published sessions, mapped via shared instructor_id. The
  -- cross-impl loop above already handles published-only across all
  -- live impls; this widens to drafts but only for the anchors the
  -- planner explicitly chose.
  if v_anchor_mode then
    for rec_anchor in
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
      where s.implementation_id = any(p_anchor_impls)
        and s.implementation_id <> p_implementation_id
        and s.status in ('draft','published')
        and t_other.instructor_id is not null
        and i_other.org_id = v_org_id
        and i_other.deleted_at is null
    loop
      insert into pg_temp.tmp_busy_trainer
        values (rec_anchor.my_trainer_id, rec_anchor.ts_start, rec_anchor.ts_end);
    end loop;
  end if;

  for rec_pto in
    select impl_trainer_id, starts_at, ends_at
    from public.impl_trainer_unavailability u
    where exists (
      select 1 from public.impl_trainers t
      where t.id = u.impl_trainer_id
        and t.implementation_id = p_implementation_id
    )
  loop
    insert into pg_temp.tmp_busy_trainer
      values (rec_pto.impl_trainer_id, rec_pto.starts_at, rec_pto.ends_at);
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

          v_room_start_hr    := greatest(rec_room.start_hour_local, v_biz_start_hr);
          v_day_end_local_hr := rec_room.start_hour_local + rec_room.available_hours_per_day;
          if v_lunch_active
             and v_lunch_start_hr >= rec_room.start_hour_local
             and v_lunch_start_hr < rec_room.start_hour_local + rec_room.available_hours_per_day then
            v_day_end_local_hr := v_day_end_local_hr + v_lunch_length_hr;
          end if;
          v_day_end_local_hr := least(v_day_end_local_hr, v_biz_end_hr);

          if v_day_end_local_hr <= v_room_start_hr then
            continue;
          end if;

          for rec_trainer in
            select t.*, coalesce(tt.hours, 0) as cum_hours
            from public.impl_class_trainers ct
            join public.impl_trainers t on t.id = ct.impl_trainer_id
            left join pg_temp.tmp_trainer_total tt on tt.trainer_id = t.id
            where ct.impl_class_id = rec_class.id
            order by coalesce(tt.hours, 0), t.sort_order
          loop
            v_local_hr := v_room_start_hr;
            while v_local_hr + rec_class.hours_per_session <= v_day_end_local_hr loop
              v_spans_lunch   := false;
              v_wall_clock_hr := rec_class.hours_per_session;

              if v_lunch_active
                 and v_local_hr >= v_lunch_start_hr
                 and v_local_hr <  v_lunch_end_hr then
                v_local_hr := v_lunch_end_hr;
                if v_local_hr + rec_class.hours_per_session > v_day_end_local_hr then
                  exit;
                end if;
              elsif v_lunch_active
                    and v_local_hr <  v_lunch_start_hr
                    and v_local_hr + rec_class.hours_per_session > v_lunch_start_hr then
                v_spans_lunch   := true;
                v_wall_clock_hr := rec_class.hours_per_session + v_lunch_length_hr;
                if v_local_hr + v_wall_clock_hr > v_day_end_local_hr then
                  v_local_hr := v_local_hr + rec_class.hours_per_session;
                  continue;
                end if;
              end if;

              v_slot_start := (v_day::timestamp + (v_local_hr * interval '1 hour')) at time zone v_room_tz;
              v_slot_end   := v_slot_start + (v_wall_clock_hr * interval '1 hour');

              if v_prereq_min is not null and v_slot_start < v_prereq_min then
                v_local_hr := v_local_hr + v_wall_clock_hr; continue;
              end if;

              select count(*) into v_room_overlap
                from pg_temp.tmp_busy_room b
                where b.room_id = rec_room.id
                  and b.ts_start < v_slot_end
                  and b.ts_end   > v_slot_start;
              if v_room_overlap >= 1 then
                v_local_hr := v_local_hr + v_wall_clock_hr; continue;
              end if;

              select count(*) into v_trainer_overlap
                from pg_temp.tmp_busy_trainer b
                where b.trainer_id = rec_trainer.id
                  and b.ts_start < v_slot_end
                  and b.ts_end   > v_slot_start;
              if v_trainer_overlap >= rec_trainer.max_concurrent_sessions then
                v_local_hr := v_local_hr + v_wall_clock_hr; continue;
              end if;

              v_week_key := to_char(date_trunc('week', v_day), 'IYYY-IW');
              select coalesce(hours, 0) into v_week_used
                from pg_temp.tmp_trainer_week
                where trainer_id = rec_trainer.id and week_key = v_week_key;
              v_week_used := coalesce(v_week_used, 0);
              if v_week_used + rec_class.hours_per_session > rec_trainer.availability_hours_per_week then
                v_local_hr := v_local_hr + v_wall_clock_hr; continue;
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
            case
              when v_anchor_mode
                then 'No conflict-free slot when anchored against ' || (
                  select string_agg(name, ', ' order by name)
                  from public.implementations
                  where id = any(p_anchor_impls)
                )
              when v_go_live is not null and v_cutoff_date < v_window_end
                then 'No slot fit before go-live buffer cutoff (' || v_cutoff_date || ')'
              else 'No room/trainer combination fit in the window'
            end
        );
      else
        -- Stage the placement. Actual INSERT happens at the end so
        -- anchor mode can abort cleanly without partial writes.
        insert into pg_temp.tmp_intended_placements (
          impl_class_id, impl_trainer_id, impl_room_id,
          scheduled_start, scheduled_end, learners_count
        ) values (
          rec_class.id, v_picked_trainer, v_picked_room,
          v_slot_start, v_slot_end,
          least(
            rec_class.expected_learners_per_session,
            greatest(
              rec_class.total_people_to_train -
                (v_session_idx - 1) * rec_class.expected_learners_per_session, 0
            )
          )
        );
        v_session_count := v_session_count + 1;
      end if;
    end loop;
  end loop;

  -- Commit decision:
  --   * Dry-run mode: never write.
  --   * Anchor mode with any gaps: never write (atomic abort).
  --   * Otherwise: write — delete existing drafts, insert from staging.
  v_should_commit := not p_dry_run
                  and not (v_anchor_mode and jsonb_array_length(v_capacity_gaps) > 0);

  if v_should_commit then
    delete from public.impl_sessions
      where implementation_id = p_implementation_id and status = 'draft';

    for rec_intended in
      select * from pg_temp.tmp_intended_placements
    loop
      insert into public.impl_sessions (
        org_id, department_id, implementation_id, impl_class_id,
        impl_trainer_id, impl_room_id,
        scheduled_start, scheduled_end, learners_count, status
      ) values (
        v_org_id, v_department_id, p_implementation_id, rec_intended.impl_class_id,
        rec_intended.impl_trainer_id, rec_intended.impl_room_id,
        rec_intended.scheduled_start, rec_intended.scheduled_end,
        rec_intended.learners_count,
        'draft'
      );
    end loop;
  else
    -- Aborted by anchor-mode-with-gaps. Force the counted-but-not-written
    -- session count to zero so the UI doesn't claim sessions were placed.
    if v_anchor_mode and jsonb_array_length(v_capacity_gaps) > 0 then
      v_session_count := 0;
    end if;
  end if;

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
    'cutoff_date',     v_cutoff_date,
    'dry_run',         p_dry_run,
    'anchor_impls',    v_anchor_names,
    'aborted',         v_anchor_mode and jsonb_array_length(v_capacity_gaps) > 0
  );
end;
$$;

revoke execute on function public.generate_implementation_schedule(uuid, boolean, uuid[]) from public, anon;
grant execute on function public.generate_implementation_schedule(uuid, boolean, uuid[]) to authenticated;
