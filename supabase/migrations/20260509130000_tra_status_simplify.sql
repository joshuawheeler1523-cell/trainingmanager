-- Simplify TRA status workflow.
--
-- The approve / reject gate didn't fit a single-person workflow. Replaced
-- with documented / completed / cancelled (plus the existing converted),
-- and added archived_at for soft-hide independent of status.
--
-- Migration of existing rows:
--   submitted, approved → documented (the request is captured; the
--                                     "approval" wasn't doing anything)
--   rejected           → cancelled

begin;

alter table public.tras drop constraint tras_status_check;

update public.tras set status = 'documented' where status in ('submitted', 'approved');
update public.tras set status = 'cancelled' where status = 'rejected';

alter table public.tras add constraint tras_status_check
  check (status in ('draft', 'documented', 'converted', 'completed', 'cancelled'));

alter table public.tras add column if not exists archived_at timestamptz;

commit;
