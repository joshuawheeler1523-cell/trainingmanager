-- Distinguish internal-employee instructors from external/consultant trainers.
--
-- Externals live in the same instructors table (one RLS surface, one cross-impl
-- conflict trigger) but get filtered out of every "internal capacity" view —
-- Instructors page, Work Allocations, reports, dashboards, project staffing,
-- classes' qualified-instructors picker. Only the Training Planner's Trainers
-- step shows them, alongside the internal roster.
--
-- The cross-impl trainer-conflict trigger added in 20260511000006 already does
-- the right thing once externals carry a non-null instructor_id (they join the
-- same way roster trainers do). No trigger change needed.

alter table public.instructors
  add column if not exists is_external boolean not null default false;

create index if not exists instructors_org_internal_idx
  on public.instructors (org_id, is_external)
  where deleted_at is null;
