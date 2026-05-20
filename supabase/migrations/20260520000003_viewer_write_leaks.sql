-- Close viewer write-leaks across several tables whose policies were
-- written before the Phase 4 role split (manager / instructor / viewer)
-- or were added afterward without picking up the manager-only pattern.
--
-- Pattern: SELECT stays at "any org member" (RLS read tier); writes
-- require is_manager(org_id). Side housekeeping: tighten audit_log
-- reads to managers only (was: any org member).

-- ── deliverable_types ────────────────────────────────────────────────
drop policy if exists "deliverable_types_modify" on public.deliverable_types;
create policy "deliverable_types_modify" on public.deliverable_types
  for all
  using (public.is_manager(org_id))
  with check (public.is_manager(org_id));

-- ── public_intake_links ──────────────────────────────────────────────
-- Created public endpoints for anonymous PHI ingest — managers only.
drop policy if exists intake_links_modify_internal on public.public_intake_links;
create policy intake_links_modify_internal on public.public_intake_links
  for all
  using (public.is_manager(org_id))
  with check (public.is_manager(org_id));

-- ── class_roadmap_steps ──────────────────────────────────────────────
drop policy if exists "crs_modify" on public.class_roadmap_steps;
create policy "crs_modify" on public.class_roadmap_steps
  for all
  using (public.is_manager(org_id))
  with check (public.is_manager(org_id));

-- ── impl_trainer_unavailability ──────────────────────────────────────
-- Trainer PTO / unavailability windows feed the schedule solver.
drop policy if exists "itu_modify" on public.impl_trainer_unavailability;
create policy "itu_modify" on public.impl_trainer_unavailability
  for all
  using (public.is_manager(org_id))
  with check (public.is_manager(org_id));

-- ── super_users ──────────────────────────────────────────────────────
-- Previously allowed dept-membership branch; tighten to manager-only.
drop policy if exists "super_users_modify" on public.super_users;
create policy "super_users_modify" on public.super_users
  for all
  using (public.is_manager(org_id))
  with check (public.is_manager(org_id));

-- ── impl_super_users ─────────────────────────────────────────────────
drop policy if exists "impl_super_users_modify" on public.impl_super_users;
create policy "impl_super_users_modify" on public.impl_super_users
  for all
  using (public.is_manager(org_id))
  with check (public.is_manager(org_id));

-- ── sketchpad_schedules INSERT ───────────────────────────────────────
-- Previously any org member could create a sketchpad schedule. Tighten
-- to manager OR instructor — viewers excluded. (Existing _update /
-- _delete policies already gate by manager OR created_by; once a viewer
-- can't INSERT, the rest of the chain is closed.)
drop policy if exists "sketchpad_schedules_insert" on public.sketchpad_schedules;
create policy "sketchpad_schedules_insert" on public.sketchpad_schedules
  for insert
  with check (
    org_id in (select public.user_org_ids())
    and (public.is_manager(org_id) or public.is_instructor(org_id))
  );

-- ── saved_reports_modify_own ─────────────────────────────────────────
-- Viewers shouldn't be persisting analytics state. Managers only.
drop policy if exists saved_reports_modify_own on public.saved_reports;
create policy saved_reports_modify_own on public.saved_reports
  for all
  using (
    created_by = auth.uid()
    and public.is_manager(org_id)
  )
  with check (
    created_by = auth.uid()
    and public.is_manager(org_id)
  );

-- ── audit_log read ───────────────────────────────────────────────────
-- Org-wide history is sensitive (member status changes, role renames,
-- mandatory-training rollups). Restrict to managers.
drop policy if exists "members can view audit log for their org" on public.audit_log;
create policy "managers can view audit log for their org"
  on public.audit_log for select
  using (public.is_manager(org_id));
