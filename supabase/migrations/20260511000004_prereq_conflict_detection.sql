-- Phase E of the 2026-05-11 Training Planner overhaul:
-- The conflict trigger now also flags class-prerequisite violations.
--
-- Per User Guide §11.3, RED = "both resources busy OR prereq not scheduled
-- to complete first." Today the trigger only checks trainer/room overlap,
-- so dragging class B's session before class A's last session via drag-
-- and-drop produces no conflict. This fixes that.
--
-- Also adds impl_sessions.conflict_reason for human-readable detail in the
-- session drawer.
--
-- (Module-level prerequisites are explicitly out of scope per the build plan
-- decision on 2026-05-11.)

alter table public.impl_sessions
  add column if not exists conflict_reason text;

create or replace function public.recompute_session_conflicts()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
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
  -- Trainer conflict (NULL trainer or overlap >= max_concurrent)
  if new.impl_trainer_id is null then
    v_trainer_busy := true;
    v_reasons := array_append(v_reasons, 'No trainer assigned');
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
    if v_trainer_busy then
      v_reasons := array_append(v_reasons, 'Trainer double-booked');
    end if;
  end if;

  -- Room conflict (NULL room or any overlap)
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

  -- Prerequisite violation: for each prereq class, every active session of
  -- that prereq must end by the time NEW starts. We surface the FIRST
  -- offending prereq's name (deterministic via ORDER BY) so the drawer
  -- has something specific to show.
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

  -- Status: prereq violation is a hard block (treated like both-busy). A
  -- single trainer-or-room conflict without prereq violation is 'partial'.
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
$$;

-- Trigger needs to fire on insert/update of the columns we now also read.
-- The class is part of the immutable identity (impl_class_id never updates),
-- so adding it here is belt-and-suspenders. Recreate the trigger to include
-- conflict_reason in the column list so future status-only writes don't
-- bypass the recompute.

drop trigger if exists recompute_session_conflicts on public.impl_sessions;
create trigger recompute_session_conflicts
  before insert or update of
    scheduled_start, scheduled_end,
    impl_trainer_id, impl_room_id,
    impl_class_id, status
  on public.impl_sessions
  for each row execute function public.recompute_session_conflicts();

-- Backfill conflict_reason for existing rows by triggering a no-op update
-- (only on rows where conflict_reason is null and status is not cancelled —
-- cancelled rows don't need a reason).
update public.impl_sessions
  set conflict_status = conflict_status
  where conflict_reason is null and status <> 'cancelled';
