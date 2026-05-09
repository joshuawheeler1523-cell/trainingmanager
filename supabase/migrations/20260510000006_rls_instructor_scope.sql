-- =============================================================================
-- Phase 4 (Permissions overhaul) — RLS instructor scope
-- =============================================================================
-- Tightens the instructor side of every tenant-scoped table per the
-- permissions matrix in docs/build-plans/2026-05-09_permissions-and-workspace-identity.md §4.2.
--
-- The Phase 3 baseline was: manager OR (instructor AND in-dept) for every
-- write. Phase 4 splits this into:
--   • Manager-only tables: catalogs and shared infrastructure that managers
--     curate. Instructor cannot INSERT/UPDATE/DELETE.
--   • Self-scoped tables: instructor can edit their own row only.
--   • Creator-scoped tables: instructor can edit rows they created (TRAs).
--   • Assignment-scoped tables: instructor can edit rows they're assigned to
--     (tasks, action items, education request assignments).
--
-- Pattern: every table gets two write policies layered with OR:
--   <t>_manager_all     — manager full ALL
--   <t>_instructor_…    — instructor scoped predicate (where applicable)
-- Tables with no instructor write predicate omit the second policy →
-- instructors can SELECT (existing select policies untouched) but every
-- INSERT/UPDATE/DELETE attempt fails through the manager_all USING/WITH CHECK.
--
-- Edge case (orphan instructor user): when an instructor user has no linked
-- instructors row, current_instructor_id(org_id) returns NULL. NULL = NULL is
-- UNKNOWN in SQL, so the predicate fails and the user is effectively
-- read-only. They get the empty personal scope until a manager links them
-- to an instructor row (link logic in Phase 4 follow-up; today managers can
-- set instructors.user_id directly).
--
-- DOWN: drop every new policy listed at the bottom in a comment block.
-- The original Phase 3 _write policies can be recreated with the predicate
--   is_manager(org_id)
--   OR (is_instructor(org_id) AND department_id IN (SELECT user_department_ids()))
-- =============================================================================

-- ── Section 1: Manager-only tables ───────────────────────────────────────
-- Catalogs + shared infra. Instructor cannot write. (They can still SELECT
-- via the untouched select policies — needed to see the catalog they work in.)

DO $manager_only$
DECLARE
  v_tables text[] := ARRAY[
    'classes',
    'class_instructor_assignments',
    'class_skill_requirements',
    'skills',
    'allocation_buckets',
    'allocation_groups',
    'allocation_group_members',
    'global_allocations',
    'group_allocations',
    'milestones',
    'task_dependencies',
    'dependencies',
    'project_team_members',
    'task_assignments',
    'implementations',
    'impl_rooms',
    'impl_modules',
    'impl_classes',
    'impl_class_prerequisites',
    'impl_trainers',
    'impl_sessions',
    'impl_class_trainers',
    'recurring_tasks',
    'recurring_task_assignments',
    'ad_hoc_tasks',
    'education_requests'
  ];
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_write', v_table);
    EXECUTE format(
      $f$
        CREATE POLICY %I ON public.%I FOR ALL
          USING (public.is_manager(org_id))
          WITH CHECK (public.is_manager(org_id))
      $f$,
      v_table || '_manager_all',
      v_table
    );
  END LOOP;
END $manager_only$;

-- ── Section 2: instructors — instructor self-edit (UPDATE only) ──────────

DROP POLICY IF EXISTS instructors_write ON public.instructors;

CREATE POLICY instructors_manager_all ON public.instructors FOR ALL
  USING (public.is_manager(org_id))
  WITH CHECK (public.is_manager(org_id));

-- Instructor can update their own row. Column-level restriction (only
-- contact-info fields editable) is enforced by a BEFORE UPDATE trigger
-- below so the RLS layer stays simple.
CREATE POLICY instructors_self_update ON public.instructors FOR UPDATE
  USING (public.is_instructor(org_id) AND user_id = auth.uid())
  WITH CHECK (public.is_instructor(org_id) AND user_id = auth.uid());

-- ── Section 3: instructor_skills — own skills (ALL on own) ───────────────

DROP POLICY IF EXISTS instructor_skills_write ON public.instructor_skills;

CREATE POLICY instructor_skills_manager_all ON public.instructor_skills FOR ALL
  USING (public.is_manager(org_id))
  WITH CHECK (public.is_manager(org_id));

CREATE POLICY instructor_skills_self_all ON public.instructor_skills FOR ALL
  USING (
    public.is_instructor(org_id)
    AND instructor_id = public.current_instructor_id(org_id)
  )
  WITH CHECK (
    public.is_instructor(org_id)
    AND instructor_id = public.current_instructor_id(org_id)
  );

-- ── Section 4: individual_allocations — own % adjustments (UPDATE only) ──
-- Manager creates the row, instructor can adjust their own %.

DROP POLICY IF EXISTS individual_allocations_write ON public.individual_allocations;

CREATE POLICY individual_allocations_manager_all ON public.individual_allocations FOR ALL
  USING (public.is_manager(org_id))
  WITH CHECK (public.is_manager(org_id));

CREATE POLICY individual_allocations_self_update ON public.individual_allocations FOR UPDATE
  USING (
    public.is_instructor(org_id)
    AND instructor_id = public.current_instructor_id(org_id)
  )
  WITH CHECK (
    public.is_instructor(org_id)
    AND instructor_id = public.current_instructor_id(org_id)
  );

-- ── Section 5: tras — instructor can create + edit own draft/documented ──

DROP POLICY IF EXISTS tras_write ON public.tras;

CREATE POLICY tras_manager_all ON public.tras FOR ALL
  USING (public.is_manager(org_id))
  WITH CHECK (public.is_manager(org_id));

-- Instructor inserts their own TRA in their dept; created_by must be them.
-- The set_actor_audit_fields trigger writes created_by = auth.uid() before
-- the WITH CHECK fires, so the predicate is naturally satisfied.
CREATE POLICY tras_instructor_insert ON public.tras FOR INSERT
  WITH CHECK (
    public.is_instructor(org_id)
    AND department_id IN (SELECT public.user_department_ids())
    AND created_by = auth.uid()
  );

-- Instructor can edit their own draft/documented TRAs.
CREATE POLICY tras_instructor_update_own ON public.tras FOR UPDATE
  USING (
    public.is_instructor(org_id)
    AND created_by = auth.uid()
    AND status IN ('draft', 'documented')
  )
  WITH CHECK (
    public.is_instructor(org_id)
    AND created_by = auth.uid()
    AND status IN ('draft', 'documented')
  );

-- DELETE: manager only (covered by manager_all)

-- ── Section 6: tra_* children — scoped to parent TRA's creator ───────────

DO $tra_children$
DECLARE
  v_tables text[] := ARRAY[
    'tra_stakeholders',
    'tra_audience_roles',
    'tra_kpis',
    'tra_success_criteria',
    'tra_objectives',
    'tra_smes',
    'tra_evaluation_plan',
    'tra_approvals',
    'tra_deliverables'
  ];
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_write', v_table);

    EXECUTE format(
      $f$
        CREATE POLICY %I ON public.%I FOR ALL
          USING (public.is_manager(org_id))
          WITH CHECK (public.is_manager(org_id))
      $f$,
      v_table || '_manager_all',
      v_table
    );

    EXECUTE format(
      $f$
        CREATE POLICY %I ON public.%I FOR ALL
          USING (
            public.is_instructor(org_id)
            AND tra_id IN (
              SELECT id FROM public.tras
              WHERE created_by = auth.uid()
                AND status IN ('draft', 'documented')
            )
          )
          WITH CHECK (
            public.is_instructor(org_id)
            AND tra_id IN (
              SELECT id FROM public.tras
              WHERE created_by = auth.uid()
                AND status IN ('draft', 'documented')
            )
          )
      $f$,
      v_table || '_instructor_scoped',
      v_table
    );
  END LOOP;
END $tra_children$;

-- ── Section 7: projects — instructor team member can update ──────────────

DROP POLICY IF EXISTS projects_write ON public.projects;

CREATE POLICY projects_manager_all ON public.projects FOR ALL
  USING (public.is_manager(org_id))
  WITH CHECK (public.is_manager(org_id));

-- Instructor on the team can update project metadata. Cannot create/delete.
CREATE POLICY projects_instructor_team_update ON public.projects FOR UPDATE
  USING (
    public.is_instructor(projects.org_id)
    AND EXISTS (
      SELECT 1 FROM public.project_team_members ptm
      WHERE ptm.project_id = projects.id
        AND ptm.instructor_id = public.current_instructor_id(projects.org_id)
    )
  )
  WITH CHECK (
    public.is_instructor(projects.org_id)
    AND EXISTS (
      SELECT 1 FROM public.project_team_members ptm
      WHERE ptm.project_id = projects.id
        AND ptm.instructor_id = public.current_instructor_id(projects.org_id)
    )
  );

-- ── Section 8: tasks — instructor can update assigned tasks ──────────────

DROP POLICY IF EXISTS tasks_write ON public.tasks;

CREATE POLICY tasks_manager_all ON public.tasks FOR ALL
  USING (public.is_manager(org_id))
  WITH CHECK (public.is_manager(org_id));

-- Instructor can update tasks assigned to them via task_assignments → ptm.
-- Column-level restriction (status/notes/percent_complete only) is enforced
-- by a BEFORE UPDATE trigger below.
CREATE POLICY tasks_instructor_assigned_update ON public.tasks FOR UPDATE
  USING (
    public.is_instructor(tasks.org_id)
    AND EXISTS (
      SELECT 1 FROM public.task_assignments ta
      JOIN public.project_team_members ptm ON ptm.id = ta.project_team_member_id
      WHERE ta.task_id = tasks.id
        AND ptm.instructor_id = public.current_instructor_id(tasks.org_id)
    )
  )
  WITH CHECK (
    public.is_instructor(tasks.org_id)
    AND EXISTS (
      SELECT 1 FROM public.task_assignments ta
      JOIN public.project_team_members ptm ON ptm.id = ta.project_team_member_id
      WHERE ta.task_id = tasks.id
        AND ptm.instructor_id = public.current_instructor_id(tasks.org_id)
    )
  );

-- ── Section 9: task_action_items — instructor manages items on assigned tasks

DROP POLICY IF EXISTS task_action_items_write ON public.task_action_items;

CREATE POLICY task_action_items_manager_all ON public.task_action_items FOR ALL
  USING (public.is_manager(org_id))
  WITH CHECK (public.is_manager(org_id));

CREATE POLICY task_action_items_instructor_assigned ON public.task_action_items FOR ALL
  USING (
    public.is_instructor(task_action_items.org_id)
    AND EXISTS (
      SELECT 1 FROM public.task_assignments ta
      JOIN public.project_team_members ptm ON ptm.id = ta.project_team_member_id
      WHERE ta.task_id = task_action_items.task_id
        AND ptm.instructor_id = public.current_instructor_id(task_action_items.org_id)
    )
  )
  WITH CHECK (
    public.is_instructor(task_action_items.org_id)
    AND EXISTS (
      SELECT 1 FROM public.task_assignments ta
      JOIN public.project_team_members ptm ON ptm.id = ta.project_team_member_id
      WHERE ta.task_id = task_action_items.task_id
        AND ptm.instructor_id = public.current_instructor_id(task_action_items.org_id)
    )
  );

-- ── Section 10: education_request_assignments — instructor on own assignment

DROP POLICY IF EXISTS education_request_assignments_write ON public.education_request_assignments;

CREATE POLICY edu_req_assignments_manager_all ON public.education_request_assignments FOR ALL
  USING (public.is_manager(org_id))
  WITH CHECK (public.is_manager(org_id));

CREATE POLICY edu_req_assignments_instructor_self ON public.education_request_assignments FOR ALL
  USING (
    public.is_instructor(org_id)
    AND instructor_id = public.current_instructor_id(org_id)
  )
  WITH CHECK (
    public.is_instructor(org_id)
    AND instructor_id = public.current_instructor_id(org_id)
  );

-- ── Section 11: report_runs — managers + instructors can log a run ───────
-- Phase 3 set this to manager + (instructor in dept). Phase 4 keeps that —
-- instructors should be able to run reports they're allowed to view.

DROP POLICY IF EXISTS report_runs_insert ON public.report_runs;

CREATE POLICY report_runs_insert ON public.report_runs FOR INSERT
  WITH CHECK (
    public.is_manager(org_id)
    OR public.is_instructor(org_id)
  );

-- ── Section 12: Column-level ACL triggers ────────────────────────────────
-- RLS doesn't gate by column. These BEFORE UPDATE triggers reject changes to
-- non-allowed columns when the caller is an instructor (not a manager).
-- Managers bypass the check and can edit any column.

create or replace function public.enforce_instructor_column_acl_instructors()
  returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_is_instructor boolean;
  v_is_manager boolean;
begin
  v_is_manager := public.is_manager(new.org_id);
  if v_is_manager then
    return new;  -- managers can edit any column
  end if;

  v_is_instructor := public.is_instructor(new.org_id);
  if not v_is_instructor then
    return new;  -- viewer wouldn't have passed RLS; just defer to RLS
  end if;

  -- Instructor: only phone + notes are writable on their own row.
  -- Compare every other non-audit column; if it changed, raise.
  if  new.full_name        is distinct from old.full_name        then raise exception 'instructor cannot change full_name';        end if;
  if  new.email            is distinct from old.email            then raise exception 'instructor cannot change email';            end if;
  if  new.department       is distinct from old.department       then raise exception 'instructor cannot change department';       end if;
  if  new.department_id    is distinct from old.department_id    then raise exception 'instructor cannot change department_id';    end if;
  if  new.location         is distinct from old.location         then raise exception 'instructor cannot change location';         end if;
  if  new.job_title        is distinct from old.job_title        then raise exception 'instructor cannot change job_title';        end if;
  if  new.start_date       is distinct from old.start_date       then raise exception 'instructor cannot change start_date';       end if;
  if  new.status           is distinct from old.status           then raise exception 'instructor cannot change status';           end if;
  if  new.annual_hours     is distinct from old.annual_hours     then raise exception 'instructor cannot change annual_hours';     end if;
  if  new.user_id          is distinct from old.user_id          then raise exception 'instructor cannot change user_id';          end if;
  if  new.deleted_at       is distinct from old.deleted_at       then raise exception 'instructor cannot change deleted_at';       end if;
  -- phone, notes, plus audit fields (updated_at, updated_by, version) are allowed
  return new;
end;
$$;

drop trigger if exists enforce_instructor_column_acl on public.instructors;
create trigger enforce_instructor_column_acl
  before update on public.instructors
  for each row
  execute function public.enforce_instructor_column_acl_instructors();

create or replace function public.enforce_instructor_column_acl_tasks()
  returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
declare
  v_is_instructor boolean;
  v_is_manager boolean;
begin
  v_is_manager := public.is_manager(new.org_id);
  if v_is_manager then
    return new;
  end if;

  v_is_instructor := public.is_instructor(new.org_id);
  if not v_is_instructor then
    return new;
  end if;

  -- Instructor on assigned task: only status, description, percent_complete,
  -- actual_hours writable. (No `notes` column on tasks — description is the
  -- text field where assignees record commentary.)
  if  new.name             is distinct from old.name             then raise exception 'instructor cannot change name';             end if;
  if  new.project_id       is distinct from old.project_id       then raise exception 'instructor cannot change project_id';       end if;
  if  new.department_id    is distinct from old.department_id    then raise exception 'instructor cannot change department_id';    end if;
  if  new.start_date       is distinct from old.start_date       then raise exception 'instructor cannot change start_date';       end if;
  if  new.end_date         is distinct from old.end_date         then raise exception 'instructor cannot change end_date';         end if;
  if  new.estimated_hours  is distinct from old.estimated_hours  then raise exception 'instructor cannot change estimated_hours';  end if;
  if  new.priority         is distinct from old.priority         then raise exception 'instructor cannot change priority';         end if;
  if  new.sort_order       is distinct from old.sort_order       then raise exception 'instructor cannot change sort_order';       end if;
  if  new.milestone_id     is distinct from old.milestone_id     then raise exception 'instructor cannot change milestone_id';     end if;
  -- status, description, percent_complete, actual_hours, plus audit fields are allowed
  return new;
end;
$$;

drop trigger if exists enforce_instructor_column_acl on public.tasks;
create trigger enforce_instructor_column_acl
  before update on public.tasks
  for each row
  execute function public.enforce_instructor_column_acl_tasks();

comment on function public.enforce_instructor_column_acl_instructors() is
  'Phase 4 column ACL: when caller is instructor (not manager), only phone + notes are editable on instructors rows.';
comment on function public.enforce_instructor_column_acl_tasks() is
  'Phase 4 column ACL: when caller is instructor (not manager), only status, notes, percent_complete are editable on tasks rows.';
