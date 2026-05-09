-- =============================================================================
-- Phase 3 (Permissions overhaul) — RLS read tier
-- =============================================================================
-- Tightens write access on every tenant-scoped table from "any accepted org
-- member" to "manager OR (instructor in same department)". Viewer becomes a
-- real role: viewers can SELECT (existing select policies cover them) but
-- cannot INSERT/UPDATE/DELETE anywhere.
--
-- Design:
--   • SELECT policies are LEFT UNCHANGED. They already enforce
--     `org_id IN user_org_ids() AND (is_manager OR dept-in-user-depts)`,
--     which is the desired read tier for every role. Viewer with a
--     department membership can read; viewer without one sees nothing.
--   • The old `<t>_modify` (FOR ALL) policies are dropped and replaced with
--     a `<t>_write` (FOR ALL) policy whose USING + WITH CHECK clauses
--     require role. Postgres ORs policies per operation, so viewer SELECT
--     still passes via the untouched <t>_select policy while INSERT/UPDATE/
--     DELETE only ever consults the new <t>_write policy and fails for
--     viewer.
--   • Phase 4 will tighten the instructor side further (scoped writes per
--     domain). Phase 3 keeps instructor's write power equivalent to today's.
--
-- Special cases handled inline (NOT in the iterated set):
--   • report_runs: only has INSERT + SELECT, no FOR ALL policy.
--     report_runs_insert is replaced with a role-gated version.
--   • education_requests: has both a FOR ALL `education_requests_modify`
--     (replaced) AND an anon insert policy (`education_requests_insert_public_anon`,
--     left intact) — anon path is unaffected.
--
-- Tables NOT touched (already protected appropriately):
--   organizations, org_memberships, org_invitations, feature_flags
--     (already gated by is_org_admin → now is_manager via Phase 2 alias)
--   audit_log, notifications, support_tickets, support_ticket_messages,
--   saved_reports, public_intake_links, education_request_history,
--   departments, department_memberships, deliverable_types
--     (already user/creator/role-scoped or read-only for members)
--
-- DOWN (rollback): for each table in the iteration set, drop <t>_write and
-- recreate the original FOR ALL policy with name <t>_modify. The original
-- USING/WITH CHECK was uniformly:
--   ((org_id IN (SELECT user_org_ids()))
--    AND (is_org_admin(org_id) OR (department_id IN (SELECT user_department_ids()))))
-- =============================================================================

DO $migration$
DECLARE
  v_tables text[] := ARRAY[
    'ad_hoc_tasks',
    'allocation_buckets',
    'allocation_group_members',
    'allocation_groups',
    'class_instructor_assignments',
    'class_skill_requirements',
    'classes',
    'dependencies',
    'education_request_assignments',
    'education_requests',
    'global_allocations',
    'group_allocations',
    'impl_class_prerequisites',
    'impl_class_trainers',
    'impl_classes',
    'impl_modules',
    'impl_rooms',
    'impl_sessions',
    'impl_trainers',
    'implementations',
    'individual_allocations',
    'instructor_skills',
    'instructors',
    'milestones',
    'project_team_members',
    'projects',
    'recurring_task_assignments',
    'recurring_tasks',
    'skills',
    'task_action_items',
    'task_assignments',
    'task_dependencies',
    'tasks',
    'tra_approvals',
    'tra_audience_roles',
    'tra_deliverables',
    'tra_evaluation_plan',
    'tra_kpis',
    'tra_objectives',
    'tra_smes',
    'tra_stakeholders',
    'tra_success_criteria',
    'tras'
  ];
  v_table text;
  v_old_policy text;
BEGIN
  FOREACH v_table IN ARRAY v_tables
  LOOP
    -- Find the existing FOR ALL policy by introspection. Names vary
    -- (instructors_modify, alloc_buckets_modify, cia_modify, rta_modify, ...)
    -- so we can't hardcode them.
    SELECT policyname
      INTO v_old_policy
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = v_table
        AND cmd = 'ALL'
      LIMIT 1;

    IF v_old_policy IS NULL THEN
      RAISE EXCEPTION 'phase3: no FOR ALL policy found on public.%', v_table;
    END IF;

    EXECUTE format('DROP POLICY %I ON public.%I', v_old_policy, v_table);

    -- Manager: full access. Instructor: full access within their department(s).
    -- Viewer: blocked here; SELECT covered by the untouched select policy.
    EXECUTE format(
      $sql$
        CREATE POLICY %I ON public.%I FOR ALL
          USING (
            public.is_manager(org_id)
            OR (
              public.is_instructor(org_id)
              AND department_id IN (SELECT public.user_department_ids())
            )
          )
          WITH CHECK (
            public.is_manager(org_id)
            OR (
              public.is_instructor(org_id)
              AND department_id IN (SELECT public.user_department_ids())
            )
          )
      $sql$,
      v_table || '_write',
      v_table
    );
  END LOOP;
END $migration$;

-- ── Special case: report_runs (INSERT-only, no FOR ALL) ────────────────────

DROP POLICY IF EXISTS report_runs_insert ON public.report_runs;

CREATE POLICY report_runs_insert ON public.report_runs FOR INSERT
  WITH CHECK (
    public.is_manager(org_id)
    OR (
      public.is_instructor(org_id)
      AND department_id IN (SELECT public.user_department_ids())
    )
  );
