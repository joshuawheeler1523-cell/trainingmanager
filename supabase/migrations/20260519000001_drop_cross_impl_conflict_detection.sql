-- Drop cross-impl conflict detection from the per-session trigger.
--
-- Anchor mode + cross-implementation coordination was removed in PR #82
-- (single-project scheduling). The training planner no longer treats
-- sessions in other implementations as constraints. But the trigger that
-- computes impl_sessions.conflict_status was still flagging
-- "trainer also teaching X in implementation Y" — surfacing as red borders
-- on the schedule view even though those cross-impl bookings are now
-- irrelevant.
--
-- This migration replaces the trigger function so:
--   - Trainer conflicts: only within the same impl (same impl_trainer_id
--     in overlapping time, respecting max_concurrent_sessions).
--   - Room conflicts: same as before (rooms aren't shared cross-impl anyway).
--   - Prereq violations: same as before (in-impl only).
--
-- After installing, every existing impl_sessions row is re-evaluated by a
-- no-op UPDATE that refires the trigger and clears stale cross-impl flags.

create or replace function public.recompute_session_conflicts()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_trainer_overlap   int := 0;
  v_room_overlap      int := 0;
  v_trainer_max       int := 1;
  v_trainer_busy      boolean;
  v_room_busy         boolean;
  v_prereq_violation  boolean := false;
  v_prereq_name       text;
  v_reasons           text[] := '{}';
begin
  -- Trainer conflict: in-impl only. Same impl_trainer_id (or any sibling
  -- trainer row in the SAME implementation) overlapping in time.
  if new.impl_trainer_id is null then
    v_trainer_busy := true;
    v_reasons := array_append(v_reasons, 'No trainer assigned');
  else
    select count(*) into v_trainer_overlap
      from public.impl_sessions s
      where s.id <> new.id
        and s.implementation_id = new.implementation_id
        and s.impl_trainer_id = new.impl_trainer_id
        and s.status <> 'cancelled'
        and s.scheduled_start < new.scheduled_end
        and s.scheduled_end   > new.scheduled_start;

    select coalesce(max_concurrent_sessions, 1) into v_trainer_max
      from public.impl_trainers
      where id = new.impl_trainer_id;

    v_trainer_busy := v_trainer_overlap >= coalesce(v_trainer_max, 1);
    if v_trainer_busy then
      v_reasons := array_append(v_reasons, 'Trainer double-booked');
    end if;
  end if;

  -- Room conflict (in-impl; rooms aren't shared across implementations).
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

  new.conflict_status := case
    when v_prereq_violation then 'full'
    when v_trainer_busy and v_room_busy then 'full'
    when v_trainer_busy or  v_room_busy then 'partial'
    else 'none'
  end;
  new.conflict_reason := case
    when array_length(v_reasons, 1) is null then null
    else array_to_string(v_reasons, ' · ')
  end;
  return new;
end;
$function$;

-- Re-evaluate every existing session so stale cross-impl flags clear.
-- The trigger is on UPDATE (BEFORE) so a no-op SET id = id is enough to
-- refire it. Wrapped in a single transaction; safe even on busy DBs.
update public.impl_sessions set id = id;
