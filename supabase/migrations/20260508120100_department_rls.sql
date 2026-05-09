-- =============================================================================
-- Departments — Phase 2: RLS isolation
-- =============================================================================
-- Every existing _select and _modify policy on tenant-scoped tables that
-- currently checks `org_id IN user_org_ids()` is updated to also require
-- the row's department to be one the user has access to (via
-- department_memberships) OR for the user to be an org admin (org admins
-- implicitly see every department in their org).
--
-- Public-share policies (`*_public_share_select`), anon-insert policies
-- (`education_requests_insert_public_anon`, `intake_links_select_public_anon`),
-- and the saved_reports / report_runs special-cases are handled separately
-- at the bottom of this file.
-- =============================================================================

create or replace function pg_temp.tighten_dept(
  p_table text,
  p_select_policy text,
  p_modify_policy text
) returns void
language plpgsql as $$
begin
  execute format('drop policy if exists %I on public.%I', p_select_policy, p_table);
  execute format($q$
    create policy %I on public.%I
    for select
    using (
      org_id in (select user_org_ids())
      and (
        is_org_admin(org_id)
        or department_id in (select user_department_ids())
      )
    )
  $q$, p_select_policy, p_table);

  execute format('drop policy if exists %I on public.%I', p_modify_policy, p_table);
  execute format($q$
    create policy %I on public.%I
    for all
    using (
      org_id in (select user_org_ids())
      and (
        is_org_admin(org_id)
        or department_id in (select user_department_ids())
      )
    )
    with check (
      org_id in (select user_org_ids())
      and (
        is_org_admin(org_id)
        or department_id in (select user_department_ids())
      )
    )
  $q$, p_modify_policy, p_table);
end;
$$;

-- Directory
select pg_temp.tighten_dept('instructors',                 'instructors_select',           'instructors_modify');
select pg_temp.tighten_dept('skills',                      'skills_select',                'skills_modify');
select pg_temp.tighten_dept('instructor_skills',           'instructor_skills_select',     'instructor_skills_modify');
select pg_temp.tighten_dept('classes',                     'classes_select',               'classes_modify');
select pg_temp.tighten_dept('class_instructor_assignments','cia_select',                   'cia_modify');
select pg_temp.tighten_dept('class_skill_requirements',    'csr_select',                   'csr_modify');

-- Allocations
select pg_temp.tighten_dept('allocation_buckets',          'alloc_buckets_select',         'alloc_buckets_modify');
select pg_temp.tighten_dept('global_allocations',          'global_alloc_select',          'global_alloc_modify');
select pg_temp.tighten_dept('allocation_groups',           'alloc_groups_select',          'alloc_groups_modify');
select pg_temp.tighten_dept('allocation_group_members',    'alloc_group_members_select',   'alloc_group_members_modify');
select pg_temp.tighten_dept('group_allocations',           'group_alloc_select',           'group_alloc_modify');
select pg_temp.tighten_dept('individual_allocations',      'indiv_alloc_select',           'indiv_alloc_modify');
select pg_temp.tighten_dept('recurring_tasks',             'recurring_tasks_select',       'recurring_tasks_modify');
select pg_temp.tighten_dept('recurring_task_assignments',  'rta_select',                   'rta_modify');
select pg_temp.tighten_dept('ad_hoc_tasks',                'ad_hoc_tasks_select',          'ad_hoc_tasks_modify');

-- TRAs
select pg_temp.tighten_dept('tras',                        'tras_select',                  'tras_modify');
select pg_temp.tighten_dept('tra_deliverables',            'tra_deliverables_select',      'tra_deliverables_modify');

-- Projects
select pg_temp.tighten_dept('projects',                    'projects_select',              'projects_modify');
select pg_temp.tighten_dept('tasks',                       'tasks_select',                 'tasks_modify');
select pg_temp.tighten_dept('milestones',                  'milestones_select',            'milestones_modify');
select pg_temp.tighten_dept('task_dependencies',           'task_dependencies_select',     'task_dependencies_modify');
select pg_temp.tighten_dept('dependencies',                'dependencies_select',          'dependencies_modify');
select pg_temp.tighten_dept('project_team_members',        'project_team_members_select',  'project_team_members_modify');
select pg_temp.tighten_dept('task_assignments',            'task_assignments_select',      'task_assignments_modify');
select pg_temp.tighten_dept('task_action_items',           'task_action_items_select',     'task_action_items_modify');

-- Implementations
select pg_temp.tighten_dept('implementations',             'implementations_select',       'implementations_modify');
select pg_temp.tighten_dept('impl_modules',                'impl_modules_select',          'impl_modules_modify');
select pg_temp.tighten_dept('impl_classes',                'impl_classes_select',          'impl_classes_modify');
select pg_temp.tighten_dept('impl_rooms',                  'impl_rooms_select',            'impl_rooms_modify');
select pg_temp.tighten_dept('impl_trainers',               'impl_trainers_select',         'impl_trainers_modify');
select pg_temp.tighten_dept('impl_sessions',               'impl_sessions_select',         'impl_sessions_modify');
select pg_temp.tighten_dept('impl_class_prerequisites',    'impl_class_prereqs_select',    'impl_class_prereqs_modify');
select pg_temp.tighten_dept('impl_class_trainers',         'impl_class_trainers_select',   'impl_class_trainers_modify');

-- Education requests
select pg_temp.tighten_dept('education_requests',          'education_requests_select',    'education_requests_modify');
select pg_temp.tighten_dept('education_request_assignments','education_request_assignments_select','education_request_assignments_modify');

-- ── Special cases ───────────────────────────────────────────────────────────

-- education_request_history: select-only
drop policy if exists education_request_history_select on public.education_request_history;
create policy education_request_history_select on public.education_request_history
  for select
  using (
    org_id in (select user_org_ids())
    and (
      is_org_admin(org_id)
      or department_id in (select user_department_ids())
    )
  );

-- saved_reports: select all in dept; modify only your own
drop policy if exists saved_reports_select on public.saved_reports;
create policy saved_reports_select on public.saved_reports
  for select
  using (
    org_id in (select user_org_ids())
    and (
      is_org_admin(org_id)
      or department_id in (select user_department_ids())
    )
  );

drop policy if exists saved_reports_modify_own on public.saved_reports;
create policy saved_reports_modify_own on public.saved_reports
  for all
  using (
    created_by = auth.uid()
    and org_id in (select user_org_ids())
    and (
      is_org_admin(org_id)
      or department_id in (select user_department_ids())
    )
  )
  with check (
    created_by = auth.uid()
    and org_id in (select user_org_ids())
    and (
      is_org_admin(org_id)
      or department_id in (select user_department_ids())
    )
  );

-- report_runs: insert + select only (no _modify)
drop policy if exists report_runs_select on public.report_runs;
create policy report_runs_select on public.report_runs
  for select
  using (
    org_id in (select user_org_ids())
    and (
      is_org_admin(org_id)
      or department_id in (select user_department_ids())
    )
  );

drop policy if exists report_runs_insert on public.report_runs;
create policy report_runs_insert on public.report_runs
  for insert
  with check (
    org_id in (select user_org_ids())
    and (
      is_org_admin(org_id)
      or department_id in (select user_department_ids())
    )
  );

-- public_intake_links: internal select + modify (anon-public-select stays alone)
drop policy if exists intake_links_select_internal on public.public_intake_links;
create policy intake_links_select_internal on public.public_intake_links
  for select
  using (
    org_id in (select user_org_ids())
    and (
      is_org_admin(org_id)
      or department_id in (select user_department_ids())
    )
  );

drop policy if exists intake_links_modify_internal on public.public_intake_links;
create policy intake_links_modify_internal on public.public_intake_links
  for all
  using (
    org_id in (select user_org_ids())
    and (
      is_org_admin(org_id)
      or department_id in (select user_department_ids())
    )
  )
  with check (
    org_id in (select user_org_ids())
    and (
      is_org_admin(org_id)
      or department_id in (select user_department_ids())
    )
  );
