-- Fix `write_request_history` to populate department_id.
--
-- The 20260508120000_add_departments migration added `department_id NOT NULL`
-- to education_request_history and back-filled existing rows. But the trigger
-- that inserts NEW history rows — defined originally in 20260107000003 — was
-- never updated. So every INSERT or status-change UPDATE on education_requests
-- fires the trigger, tries to insert a history row without department_id, and
-- fails with:
--   null value in column "department_id" of relation
--   "education_request_history" violates not-null constraint
--
-- This regression has been latent since the department migration shipped.
-- Both creation paths (the in-app request-queue action and the public-intake
-- form) write department_id onto education_requests, so the trigger just
-- needs to forward `new.department_id` into the history insert.

create or replace function public.write_request_history()
  returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_from  text;
  v_to    text;
begin
  if tg_op = 'INSERT' then
    v_from := null;
    v_to   := new.status;
  elsif tg_op = 'UPDATE' then
    if old.status is not distinct from new.status then
      return null;
    end if;
    v_from := old.status;
    v_to   := new.status;
  else
    return null;
  end if;

  insert into public.education_request_history
    (org_id, department_id, request_id, from_status, to_status, comment, actor_id)
  values (new.org_id, new.department_id, new.id, v_from, v_to, new.review_notes, v_actor);
  return null;
end;
$$;
