-- =============================================================================
-- Collapse duplicate permissive SELECT policies.
-- =============================================================================
-- The performance advisor flagged 637 instances of multiple_permissive_policies
-- across 61 tables. Every tenant table carried both a FOR ALL manager policy and
-- a FOR SELECT policy, so each read evaluated both — and each calls SECURITY
-- DEFINER helpers (is_manager, user_org_ids, user_department_ids).
--
-- Rather than infer that one predicate implies the other and drop it, this
-- MERGES them: permissive policies are OR'd by Postgres, so replacing
-- {A, B} with a single policy USING (A or B) is identical by construction.
-- Each FOR ALL policy is re-created as explicit INSERT/UPDATE/DELETE policies
-- preserving its USING/WITH CHECK exactly (WITH CHECK defaults to USING on a
-- FOR ALL policy, which is why it is materialised here).
--
-- anon-targeted public-share policies are deliberately left alone. They live on
-- dependencies, milestones, project_team_members, projects, public_intake_links
-- and tasks; folding them into a PUBLIC policy would expose the internal
-- predicate to anonymous visitors.
--
-- Net effect: one policy evaluation per row on the authenticated read path
-- instead of two or three. No change to who can see or write what.
-- =============================================================================

-- ── ad_hoc_tasks ────────────────────────────────────────────────────────
drop policy if exists "ad_hoc_tasks_manager_all" on public."ad_hoc_tasks";
drop policy if exists "ad_hoc_tasks_select" on public."ad_hoc_tasks";
create policy "ad_hoc_tasks_select" on public."ad_hoc_tasks"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "ad_hoc_tasks_manager_insert" on public."ad_hoc_tasks"
  for insert with check (is_manager(org_id));
create policy "ad_hoc_tasks_manager_update" on public."ad_hoc_tasks"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "ad_hoc_tasks_manager_delete" on public."ad_hoc_tasks"
  for delete using (is_manager(org_id));

-- ── agencies ────────────────────────────────────────────────────────────
drop policy if exists "agencies_modify_admin" on public."agencies";
drop policy if exists "agencies_select_member" on public."agencies";
create policy "agencies_select_member" on public."agencies"
  for select using (
    (is_agency_admin(id))
     or (is_agency_member(id))
  );
create policy "agencies_insert" on public."agencies"
  for insert with check (is_agency_admin(id));
create policy "agencies_update" on public."agencies"
  for update using (is_agency_admin(id)) with check (is_agency_admin(id));
create policy "agencies_delete" on public."agencies"
  for delete using (is_agency_admin(id));

-- ── allocation_buckets ──────────────────────────────────────────────────
drop policy if exists "alloc_buckets_select" on public."allocation_buckets";
drop policy if exists "allocation_buckets_manager_all" on public."allocation_buckets";
create policy "alloc_buckets_select" on public."allocation_buckets"
  for select using (
    (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
     or (is_manager(org_id))
  );
create policy "allocation_buckets_manager_insert" on public."allocation_buckets"
  for insert with check (is_manager(org_id));
create policy "allocation_buckets_manager_update" on public."allocation_buckets"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "allocation_buckets_manager_delete" on public."allocation_buckets"
  for delete using (is_manager(org_id));

-- ── allocation_group_members ────────────────────────────────────────────
drop policy if exists "alloc_group_members_select" on public."allocation_group_members";
drop policy if exists "allocation_group_members_manager_all" on public."allocation_group_members";
create policy "alloc_group_members_select" on public."allocation_group_members"
  for select using (
    (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
     or (is_manager(org_id))
  );
create policy "allocation_group_members_manager_insert" on public."allocation_group_members"
  for insert with check (is_manager(org_id));
create policy "allocation_group_members_manager_update" on public."allocation_group_members"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "allocation_group_members_manager_delete" on public."allocation_group_members"
  for delete using (is_manager(org_id));

-- ── allocation_groups ───────────────────────────────────────────────────
drop policy if exists "alloc_groups_select" on public."allocation_groups";
drop policy if exists "allocation_groups_manager_all" on public."allocation_groups";
create policy "alloc_groups_select" on public."allocation_groups"
  for select using (
    (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
     or (is_manager(org_id))
  );
create policy "allocation_groups_manager_insert" on public."allocation_groups"
  for insert with check (is_manager(org_id));
create policy "allocation_groups_manager_update" on public."allocation_groups"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "allocation_groups_manager_delete" on public."allocation_groups"
  for delete using (is_manager(org_id));

-- ── class_instructor_assignments ────────────────────────────────────────
drop policy if exists "cia_select" on public."class_instructor_assignments";
drop policy if exists "class_instructor_assignments_manager_all" on public."class_instructor_assignments";
create policy "cia_select" on public."class_instructor_assignments"
  for select using (
    (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
     or (is_manager(org_id))
  );
create policy "class_instructor_assignments_manager_insert" on public."class_instructor_assignments"
  for insert with check (is_manager(org_id));
create policy "class_instructor_assignments_manager_update" on public."class_instructor_assignments"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "class_instructor_assignments_manager_delete" on public."class_instructor_assignments"
  for delete using (is_manager(org_id));

-- ── class_modules ───────────────────────────────────────────────────────
drop policy if exists "class_modules_modify" on public."class_modules";
drop policy if exists "class_modules_select" on public."class_modules";
create policy "class_modules_select" on public."class_modules"
  for select using (
    ((org_id IN ( SELECT user_org_ids() AS user_org_ids)))
     or ((org_id IN ( SELECT user_org_ids() AS user_org_ids)))
  );
create policy "class_modules_insert" on public."class_modules"
  for insert with check ((org_id IN ( SELECT user_org_ids() AS user_org_ids)));
create policy "class_modules_update" on public."class_modules"
  for update using ((org_id IN ( SELECT user_org_ids() AS user_org_ids))) with check ((org_id IN ( SELECT user_org_ids() AS user_org_ids)));
create policy "class_modules_delete" on public."class_modules"
  for delete using ((org_id IN ( SELECT user_org_ids() AS user_org_ids)));

-- ── class_roadmap_steps ─────────────────────────────────────────────────
drop policy if exists "crs_modify" on public."class_roadmap_steps";
drop policy if exists "crs_select" on public."class_roadmap_steps";
create policy "crs_select" on public."class_roadmap_steps"
  for select using (
    (is_manager(org_id))
     or ((org_id IN ( SELECT user_org_ids() AS user_org_ids)))
  );
create policy "crs_insert" on public."class_roadmap_steps"
  for insert with check (is_manager(org_id));
create policy "crs_update" on public."class_roadmap_steps"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "crs_delete" on public."class_roadmap_steps"
  for delete using (is_manager(org_id));

-- ── class_skill_requirements ────────────────────────────────────────────
drop policy if exists "class_skill_requirements_manager_all" on public."class_skill_requirements";
drop policy if exists "csr_select" on public."class_skill_requirements";
create policy "csr_select" on public."class_skill_requirements"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "class_skill_requirements_manager_insert" on public."class_skill_requirements"
  for insert with check (is_manager(org_id));
create policy "class_skill_requirements_manager_update" on public."class_skill_requirements"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "class_skill_requirements_manager_delete" on public."class_skill_requirements"
  for delete using (is_manager(org_id));

-- ── classes ─────────────────────────────────────────────────────────────
drop policy if exists "classes_manager_all" on public."classes";
drop policy if exists "classes_select" on public."classes";
create policy "classes_select" on public."classes"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "classes_manager_insert" on public."classes"
  for insert with check (is_manager(org_id));
create policy "classes_manager_update" on public."classes"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "classes_manager_delete" on public."classes"
  for delete using (is_manager(org_id));

-- ── deliverable_types ───────────────────────────────────────────────────
drop policy if exists "deliverable_types_modify" on public."deliverable_types";
drop policy if exists "deliverable_types_select" on public."deliverable_types";
create policy "deliverable_types_select" on public."deliverable_types"
  for select using (
    (is_manager(org_id))
     or (((org_id IS NULL) OR (org_id IN ( SELECT user_org_ids() AS user_org_ids))))
  );
create policy "deliverable_types_insert" on public."deliverable_types"
  for insert with check (is_manager(org_id));
create policy "deliverable_types_update" on public."deliverable_types"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "deliverable_types_delete" on public."deliverable_types"
  for delete using (is_manager(org_id));

-- ── department_memberships ──────────────────────────────────────────────
drop policy if exists "admins manage department memberships" on public."department_memberships";
drop policy if exists "users see relevant department memberships" on public."department_memberships";
create policy "users see relevant department memberships" on public."department_memberships"
  for select using (
    ((department_id IN ( SELECT d.id
   FROM departments d
  WHERE (is_manager(d.org_id) OR is_department_admin(d.id)))))
     or (((user_id = ( SELECT auth.uid() AS uid)) OR (department_id IN ( SELECT d.id
   FROM departments d
  WHERE is_manager(d.org_id)))))
  );
create policy "admins manage department memberships_insert" on public."department_memberships"
  for insert with check ((department_id IN ( SELECT d.id
   FROM departments d
  WHERE (is_manager(d.org_id) OR is_department_admin(d.id)))));
create policy "admins manage department memberships_update" on public."department_memberships"
  for update using ((department_id IN ( SELECT d.id
   FROM departments d
  WHERE (is_manager(d.org_id) OR is_department_admin(d.id))))) with check ((department_id IN ( SELECT d.id
   FROM departments d
  WHERE (is_manager(d.org_id) OR is_department_admin(d.id)))));
create policy "admins manage department memberships_delete" on public."department_memberships"
  for delete using ((department_id IN ( SELECT d.id
   FROM departments d
  WHERE (is_manager(d.org_id) OR is_department_admin(d.id)))));

-- ── departments ─────────────────────────────────────────────────────────
drop policy if exists "members can see departments in their orgs" on public."departments";
drop policy if exists "org admins manage departments" on public."departments";
create policy "members can see departments in their orgs" on public."departments"
  for select using (
    ((org_id IN ( SELECT org_memberships.org_id
   FROM org_memberships
  WHERE ((org_memberships.user_id = ( SELECT auth.uid() AS uid)) AND (org_memberships.accepted_at IS NOT NULL)))))
     or (is_manager(org_id))
  );
create policy "org admins manage departments_insert" on public."departments"
  for insert with check (is_manager(org_id));
create policy "org admins manage departments_update" on public."departments"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "org admins manage departments_delete" on public."departments"
  for delete using (is_manager(org_id));

-- ── dependencies ────────────────────────────────────────────────────────
drop policy if exists "dependencies_manager_all" on public."dependencies";
drop policy if exists "dependencies_select" on public."dependencies";
create policy "dependencies_select" on public."dependencies"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "dependencies_manager_insert" on public."dependencies"
  for insert with check (is_manager(org_id));
create policy "dependencies_manager_update" on public."dependencies"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "dependencies_manager_delete" on public."dependencies"
  for delete using (is_manager(org_id));

-- ── education_request_assignments ───────────────────────────────────────
drop policy if exists "edu_req_assignments_instructor_self" on public."education_request_assignments";
drop policy if exists "edu_req_assignments_manager_all" on public."education_request_assignments";
drop policy if exists "education_request_assignments_select" on public."education_request_assignments";
create policy "education_request_assignments_select" on public."education_request_assignments"
  for select using (
    ((is_instructor(org_id) AND (instructor_id = current_instructor_id(org_id))))
     or (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "edu_req_assignments_instructor_self_insert" on public."education_request_assignments"
  for insert with check ((is_instructor(org_id) AND (instructor_id = current_instructor_id(org_id))));
create policy "edu_req_assignments_instructor_self_update" on public."education_request_assignments"
  for update using ((is_instructor(org_id) AND (instructor_id = current_instructor_id(org_id)))) with check ((is_instructor(org_id) AND (instructor_id = current_instructor_id(org_id))));
create policy "edu_req_assignments_instructor_self_delete" on public."education_request_assignments"
  for delete using ((is_instructor(org_id) AND (instructor_id = current_instructor_id(org_id))));
create policy "edu_req_assignments_manager_insert" on public."education_request_assignments"
  for insert with check (is_manager(org_id));
create policy "edu_req_assignments_manager_update" on public."education_request_assignments"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "edu_req_assignments_manager_delete" on public."education_request_assignments"
  for delete using (is_manager(org_id));

-- ── education_requests ──────────────────────────────────────────────────
drop policy if exists "education_requests_manager_all" on public."education_requests";
drop policy if exists "education_requests_select" on public."education_requests";
create policy "education_requests_select" on public."education_requests"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "education_requests_manager_insert" on public."education_requests"
  for insert with check (is_manager(org_id));
create policy "education_requests_manager_update" on public."education_requests"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "education_requests_manager_delete" on public."education_requests"
  for delete using (is_manager(org_id));

-- ── feature_flags ───────────────────────────────────────────────────────
drop policy if exists "authenticated users can read global flags" on public."feature_flags";
drop policy if exists "org admins can manage org flags" on public."feature_flags";
create policy "authenticated users can read global flags" on public."feature_flags"
  for select using (
    (((org_id IS NULL) OR (org_id IN ( SELECT user_org_ids() AS user_org_ids))))
     or (is_manager(org_id))
  );
create policy "org admins can manage org flags_insert" on public."feature_flags"
  for insert with check (is_manager(org_id));
create policy "org admins can manage org flags_update" on public."feature_flags"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "org admins can manage org flags_delete" on public."feature_flags"
  for delete using (is_manager(org_id));

-- ── global_allocations ──────────────────────────────────────────────────
drop policy if exists "global_alloc_select" on public."global_allocations";
drop policy if exists "global_allocations_manager_all" on public."global_allocations";
create policy "global_alloc_select" on public."global_allocations"
  for select using (
    (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
     or (is_manager(org_id))
  );
create policy "global_allocations_manager_insert" on public."global_allocations"
  for insert with check (is_manager(org_id));
create policy "global_allocations_manager_update" on public."global_allocations"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "global_allocations_manager_delete" on public."global_allocations"
  for delete using (is_manager(org_id));

-- ── group_allocations ───────────────────────────────────────────────────
drop policy if exists "group_alloc_select" on public."group_allocations";
drop policy if exists "group_allocations_manager_all" on public."group_allocations";
create policy "group_alloc_select" on public."group_allocations"
  for select using (
    (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
     or (is_manager(org_id))
  );
create policy "group_allocations_manager_insert" on public."group_allocations"
  for insert with check (is_manager(org_id));
create policy "group_allocations_manager_update" on public."group_allocations"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "group_allocations_manager_delete" on public."group_allocations"
  for delete using (is_manager(org_id));

-- ── impl_class_prerequisites ────────────────────────────────────────────
drop policy if exists "impl_class_prereqs_select" on public."impl_class_prerequisites";
drop policy if exists "impl_class_prerequisites_manager_all" on public."impl_class_prerequisites";
create policy "impl_class_prereqs_select" on public."impl_class_prerequisites"
  for select using (
    (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
     or (is_manager(org_id))
  );
create policy "impl_class_prerequisites_manager_insert" on public."impl_class_prerequisites"
  for insert with check (is_manager(org_id));
create policy "impl_class_prerequisites_manager_update" on public."impl_class_prerequisites"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "impl_class_prerequisites_manager_delete" on public."impl_class_prerequisites"
  for delete using (is_manager(org_id));

-- ── impl_class_trainers ─────────────────────────────────────────────────
drop policy if exists "impl_class_trainers_manager_all" on public."impl_class_trainers";
drop policy if exists "impl_class_trainers_select" on public."impl_class_trainers";
create policy "impl_class_trainers_select" on public."impl_class_trainers"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "impl_class_trainers_manager_insert" on public."impl_class_trainers"
  for insert with check (is_manager(org_id));
create policy "impl_class_trainers_manager_update" on public."impl_class_trainers"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "impl_class_trainers_manager_delete" on public."impl_class_trainers"
  for delete using (is_manager(org_id));

-- ── impl_classes ────────────────────────────────────────────────────────
drop policy if exists "impl_classes_manager_all" on public."impl_classes";
drop policy if exists "impl_classes_select" on public."impl_classes";
create policy "impl_classes_select" on public."impl_classes"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "impl_classes_manager_insert" on public."impl_classes"
  for insert with check (is_manager(org_id));
create policy "impl_classes_manager_update" on public."impl_classes"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "impl_classes_manager_delete" on public."impl_classes"
  for delete using (is_manager(org_id));

-- ── impl_modules ────────────────────────────────────────────────────────
drop policy if exists "impl_modules_manager_all" on public."impl_modules";
drop policy if exists "impl_modules_select" on public."impl_modules";
create policy "impl_modules_select" on public."impl_modules"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "impl_modules_manager_insert" on public."impl_modules"
  for insert with check (is_manager(org_id));
create policy "impl_modules_manager_update" on public."impl_modules"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "impl_modules_manager_delete" on public."impl_modules"
  for delete using (is_manager(org_id));

-- ── impl_rooms ──────────────────────────────────────────────────────────
drop policy if exists "impl_rooms_manager_all" on public."impl_rooms";
drop policy if exists "impl_rooms_select" on public."impl_rooms";
create policy "impl_rooms_select" on public."impl_rooms"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "impl_rooms_manager_insert" on public."impl_rooms"
  for insert with check (is_manager(org_id));
create policy "impl_rooms_manager_update" on public."impl_rooms"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "impl_rooms_manager_delete" on public."impl_rooms"
  for delete using (is_manager(org_id));

-- ── impl_sessions ───────────────────────────────────────────────────────
drop policy if exists "impl_sessions_manager_all" on public."impl_sessions";
drop policy if exists "impl_sessions_select" on public."impl_sessions";
create policy "impl_sessions_select" on public."impl_sessions"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "impl_sessions_manager_insert" on public."impl_sessions"
  for insert with check (is_manager(org_id));
create policy "impl_sessions_manager_update" on public."impl_sessions"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "impl_sessions_manager_delete" on public."impl_sessions"
  for delete using (is_manager(org_id));

-- ── impl_super_users ────────────────────────────────────────────────────
drop policy if exists "impl_super_users_modify" on public."impl_super_users";
drop policy if exists "impl_super_users_select" on public."impl_super_users";
create policy "impl_super_users_select" on public."impl_super_users"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "impl_super_users_insert" on public."impl_super_users"
  for insert with check (is_manager(org_id));
create policy "impl_super_users_update" on public."impl_super_users"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "impl_super_users_delete" on public."impl_super_users"
  for delete using (is_manager(org_id));

-- ── impl_trainer_unavailability ─────────────────────────────────────────
drop policy if exists "itu_modify" on public."impl_trainer_unavailability";
drop policy if exists "itu_select" on public."impl_trainer_unavailability";
create policy "itu_select" on public."impl_trainer_unavailability"
  for select using (
    (is_manager(org_id))
     or ((org_id IN ( SELECT user_org_ids() AS user_org_ids)))
  );
create policy "itu_insert" on public."impl_trainer_unavailability"
  for insert with check (is_manager(org_id));
create policy "itu_update" on public."impl_trainer_unavailability"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "itu_delete" on public."impl_trainer_unavailability"
  for delete using (is_manager(org_id));

-- ── impl_trainers ───────────────────────────────────────────────────────
drop policy if exists "impl_trainers_manager_all" on public."impl_trainers";
drop policy if exists "impl_trainers_select" on public."impl_trainers";
create policy "impl_trainers_select" on public."impl_trainers"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "impl_trainers_manager_insert" on public."impl_trainers"
  for insert with check (is_manager(org_id));
create policy "impl_trainers_manager_update" on public."impl_trainers"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "impl_trainers_manager_delete" on public."impl_trainers"
  for delete using (is_manager(org_id));

-- ── implementations ─────────────────────────────────────────────────────
drop policy if exists "implementations_manager_all" on public."implementations";
drop policy if exists "implementations_select" on public."implementations";
create policy "implementations_select" on public."implementations"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "implementations_manager_insert" on public."implementations"
  for insert with check (is_manager(org_id));
create policy "implementations_manager_update" on public."implementations"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "implementations_manager_delete" on public."implementations"
  for delete using (is_manager(org_id));

-- ── individual_allocations ──────────────────────────────────────────────
drop policy if exists "indiv_alloc_select" on public."individual_allocations";
drop policy if exists "individual_allocations_manager_all" on public."individual_allocations";
create policy "indiv_alloc_select" on public."individual_allocations"
  for select using (
    (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
     or (is_manager(org_id))
  );
create policy "individual_allocations_manager_insert" on public."individual_allocations"
  for insert with check (is_manager(org_id));
create policy "individual_allocations_manager_update" on public."individual_allocations"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "individual_allocations_manager_delete" on public."individual_allocations"
  for delete using (is_manager(org_id));

-- ── instructor_feedback_links ───────────────────────────────────────────
drop policy if exists "ifl_modify_manager" on public."instructor_feedback_links";
drop policy if exists "ifl_select_internal" on public."instructor_feedback_links";
create policy "ifl_select_internal" on public."instructor_feedback_links"
  for select using (
    (is_manager(org_id))
     or ((org_id IN ( SELECT user_org_ids() AS user_org_ids)))
  );
create policy "ifl_insert" on public."instructor_feedback_links"
  for insert with check (is_manager(org_id));
create policy "ifl_update" on public."instructor_feedback_links"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "ifl_delete" on public."instructor_feedback_links"
  for delete using (is_manager(org_id));

-- ── instructor_skills ───────────────────────────────────────────────────
drop policy if exists "instructor_skills_manager_all" on public."instructor_skills";
drop policy if exists "instructor_skills_select" on public."instructor_skills";
drop policy if exists "instructor_skills_self_all" on public."instructor_skills";
create policy "instructor_skills_select" on public."instructor_skills"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
     or ((is_instructor(org_id) AND (instructor_id = current_instructor_id(org_id))))
  );
create policy "instructor_skills_manager_insert" on public."instructor_skills"
  for insert with check (is_manager(org_id));
create policy "instructor_skills_manager_update" on public."instructor_skills"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "instructor_skills_manager_delete" on public."instructor_skills"
  for delete using (is_manager(org_id));
create policy "instructor_skills_self_insert" on public."instructor_skills"
  for insert with check ((is_instructor(org_id) AND (instructor_id = current_instructor_id(org_id))));
create policy "instructor_skills_self_update" on public."instructor_skills"
  for update using ((is_instructor(org_id) AND (instructor_id = current_instructor_id(org_id)))) with check ((is_instructor(org_id) AND (instructor_id = current_instructor_id(org_id))));
create policy "instructor_skills_self_delete" on public."instructor_skills"
  for delete using ((is_instructor(org_id) AND (instructor_id = current_instructor_id(org_id))));

-- ── instructors ─────────────────────────────────────────────────────────
drop policy if exists "instructors_manager_all" on public."instructors";
drop policy if exists "instructors_select" on public."instructors";
create policy "instructors_select" on public."instructors"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "instructors_manager_insert" on public."instructors"
  for insert with check (is_manager(org_id));
create policy "instructors_manager_update" on public."instructors"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "instructors_manager_delete" on public."instructors"
  for delete using (is_manager(org_id));

-- ── milestones ──────────────────────────────────────────────────────────
drop policy if exists "milestones_manager_all" on public."milestones";
drop policy if exists "milestones_select" on public."milestones";
create policy "milestones_select" on public."milestones"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "milestones_manager_insert" on public."milestones"
  for insert with check (is_manager(org_id));
create policy "milestones_manager_update" on public."milestones"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "milestones_manager_delete" on public."milestones"
  for delete using (is_manager(org_id));

-- ── onboarding_progress ─────────────────────────────────────────────────
drop policy if exists "onboarding_progress_modify" on public."onboarding_progress";
drop policy if exists "onboarding_progress_select" on public."onboarding_progress";
create policy "onboarding_progress_select" on public."onboarding_progress"
  for select using (
    (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id)))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id)))
  );
create policy "onboarding_progress_insert" on public."onboarding_progress"
  for insert with check (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id)));
create policy "onboarding_progress_update" on public."onboarding_progress"
  for update using (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id))) with check (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id)));
create policy "onboarding_progress_delete" on public."onboarding_progress"
  for delete using (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id)));

-- ── onboarding_tasks ────────────────────────────────────────────────────
drop policy if exists "onboarding_tasks_modify" on public."onboarding_tasks";
drop policy if exists "onboarding_tasks_select" on public."onboarding_tasks";
create policy "onboarding_tasks_select" on public."onboarding_tasks"
  for select using (
    (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id)))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id)))
  );
create policy "onboarding_tasks_insert" on public."onboarding_tasks"
  for insert with check (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id)));
create policy "onboarding_tasks_update" on public."onboarding_tasks"
  for update using (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id))) with check (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id)));
create policy "onboarding_tasks_delete" on public."onboarding_tasks"
  for delete using (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id)));

-- ── one_on_ones ─────────────────────────────────────────────────────────
drop policy if exists "one_on_ones_modify" on public."one_on_ones";
drop policy if exists "one_on_ones_select" on public."one_on_ones";
create policy "one_on_ones_select" on public."one_on_ones"
  for select using (
    (is_manager(org_id))
     or (is_manager(org_id))
  );
create policy "one_on_ones_insert" on public."one_on_ones"
  for insert with check (is_manager(org_id));
create policy "one_on_ones_update" on public."one_on_ones"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "one_on_ones_delete" on public."one_on_ones"
  for delete using (is_manager(org_id));

-- ── org_invitations ─────────────────────────────────────────────────────
drop policy if exists "org admins can manage invitations" on public."org_invitations";
drop policy if exists "users can view their own pending invitations" on public."org_invitations";
create policy "users can view their own pending invitations" on public."org_invitations"
  for select using (
    (is_manager(org_id))
     or (((email = current_user_email()) AND (accepted_at IS NULL) AND (expires_at > now())))
  );
create policy "org admins can manage invitations_insert" on public."org_invitations"
  for insert with check (is_manager(org_id));
create policy "org admins can manage invitations_update" on public."org_invitations"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "org admins can manage invitations_delete" on public."org_invitations"
  for delete using (is_manager(org_id));

-- ── organizations ───────────────────────────────────────────────────────
drop policy if exists "members can view their org" on public."organizations";
drop policy if exists "organizations_select_agency_admin" on public."organizations";
create policy "members can view their org" on public."organizations"
  for select using (
    ((id IN ( SELECT user_org_ids() AS user_org_ids)))
     or (((agency_id IS NOT NULL) AND is_agency_admin(agency_id)))
  );

-- ── project_team_members ────────────────────────────────────────────────
drop policy if exists "project_team_members_manager_all" on public."project_team_members";
drop policy if exists "project_team_members_select" on public."project_team_members";
create policy "project_team_members_select" on public."project_team_members"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "project_team_members_manager_insert" on public."project_team_members"
  for insert with check (is_manager(org_id));
create policy "project_team_members_manager_update" on public."project_team_members"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "project_team_members_manager_delete" on public."project_team_members"
  for delete using (is_manager(org_id));

-- ── projects ────────────────────────────────────────────────────────────
drop policy if exists "projects_manager_all" on public."projects";
drop policy if exists "projects_select" on public."projects";
create policy "projects_select" on public."projects"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "projects_manager_insert" on public."projects"
  for insert with check (is_manager(org_id));
create policy "projects_manager_update" on public."projects"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "projects_manager_delete" on public."projects"
  for delete using (is_manager(org_id));

-- ── public_intake_links ─────────────────────────────────────────────────
drop policy if exists "intake_links_modify_internal" on public."public_intake_links";
drop policy if exists "intake_links_select_internal" on public."public_intake_links";
create policy "intake_links_select_internal" on public."public_intake_links"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "intake_links_insert" on public."public_intake_links"
  for insert with check (is_manager(org_id));
create policy "intake_links_update" on public."public_intake_links"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "intake_links_delete" on public."public_intake_links"
  for delete using (is_manager(org_id));

-- ── recurring_task_assignments ──────────────────────────────────────────
drop policy if exists "recurring_task_assignments_manager_all" on public."recurring_task_assignments";
drop policy if exists "rta_select" on public."recurring_task_assignments";
create policy "rta_select" on public."recurring_task_assignments"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "recurring_task_assignments_manager_insert" on public."recurring_task_assignments"
  for insert with check (is_manager(org_id));
create policy "recurring_task_assignments_manager_update" on public."recurring_task_assignments"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "recurring_task_assignments_manager_delete" on public."recurring_task_assignments"
  for delete using (is_manager(org_id));

-- ── recurring_tasks ─────────────────────────────────────────────────────
drop policy if exists "recurring_tasks_manager_all" on public."recurring_tasks";
drop policy if exists "recurring_tasks_select" on public."recurring_tasks";
create policy "recurring_tasks_select" on public."recurring_tasks"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "recurring_tasks_manager_insert" on public."recurring_tasks"
  for insert with check (is_manager(org_id));
create policy "recurring_tasks_manager_update" on public."recurring_tasks"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "recurring_tasks_manager_delete" on public."recurring_tasks"
  for delete using (is_manager(org_id));

-- ── saved_reports ───────────────────────────────────────────────────────
drop policy if exists "saved_reports_modify_own" on public."saved_reports";
drop policy if exists "saved_reports_select" on public."saved_reports";
create policy "saved_reports_select" on public."saved_reports"
  for select using (
    (((created_by = ( SELECT auth.uid() AS uid)) AND is_manager(org_id)))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "saved_reports_insert" on public."saved_reports"
  for insert with check (((created_by = ( SELECT auth.uid() AS uid)) AND is_manager(org_id)));
create policy "saved_reports_update" on public."saved_reports"
  for update using (((created_by = ( SELECT auth.uid() AS uid)) AND is_manager(org_id))) with check (((created_by = ( SELECT auth.uid() AS uid)) AND is_manager(org_id)));
create policy "saved_reports_delete" on public."saved_reports"
  for delete using (((created_by = ( SELECT auth.uid() AS uid)) AND is_manager(org_id)));

-- ── skills ──────────────────────────────────────────────────────────────
drop policy if exists "skills_manager_all" on public."skills";
drop policy if exists "skills_select" on public."skills";
create policy "skills_select" on public."skills"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "skills_manager_insert" on public."skills"
  for insert with check (is_manager(org_id));
create policy "skills_manager_update" on public."skills"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "skills_manager_delete" on public."skills"
  for delete using (is_manager(org_id));

-- ── super_users ─────────────────────────────────────────────────────────
drop policy if exists "super_users_modify" on public."super_users";
drop policy if exists "super_users_select" on public."super_users";
create policy "super_users_select" on public."super_users"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "super_users_insert" on public."super_users"
  for insert with check (is_manager(org_id));
create policy "super_users_update" on public."super_users"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "super_users_delete" on public."super_users"
  for delete using (is_manager(org_id));

-- ── task_action_items ───────────────────────────────────────────────────
drop policy if exists "task_action_items_instructor_assigned" on public."task_action_items";
drop policy if exists "task_action_items_manager_all" on public."task_action_items";
drop policy if exists "task_action_items_select" on public."task_action_items";
create policy "task_action_items_select" on public."task_action_items"
  for select using (
    ((is_instructor(org_id) AND (EXISTS ( SELECT 1
   FROM (task_assignments ta
     JOIN project_team_members ptm ON ((ptm.id = ta.project_team_member_id)))
  WHERE ((ta.task_id = task_action_items.task_id) AND (ptm.instructor_id = current_instructor_id(task_action_items.org_id)))))))
     or (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "task_action_items_instructor_assigned_insert" on public."task_action_items"
  for insert with check ((is_instructor(org_id) AND (EXISTS ( SELECT 1
   FROM (task_assignments ta
     JOIN project_team_members ptm ON ((ptm.id = ta.project_team_member_id)))
  WHERE ((ta.task_id = task_action_items.task_id) AND (ptm.instructor_id = current_instructor_id(task_action_items.org_id)))))));
create policy "task_action_items_instructor_assigned_update" on public."task_action_items"
  for update using ((is_instructor(org_id) AND (EXISTS ( SELECT 1
   FROM (task_assignments ta
     JOIN project_team_members ptm ON ((ptm.id = ta.project_team_member_id)))
  WHERE ((ta.task_id = task_action_items.task_id) AND (ptm.instructor_id = current_instructor_id(task_action_items.org_id))))))) with check ((is_instructor(org_id) AND (EXISTS ( SELECT 1
   FROM (task_assignments ta
     JOIN project_team_members ptm ON ((ptm.id = ta.project_team_member_id)))
  WHERE ((ta.task_id = task_action_items.task_id) AND (ptm.instructor_id = current_instructor_id(task_action_items.org_id)))))));
create policy "task_action_items_instructor_assigned_delete" on public."task_action_items"
  for delete using ((is_instructor(org_id) AND (EXISTS ( SELECT 1
   FROM (task_assignments ta
     JOIN project_team_members ptm ON ((ptm.id = ta.project_team_member_id)))
  WHERE ((ta.task_id = task_action_items.task_id) AND (ptm.instructor_id = current_instructor_id(task_action_items.org_id)))))));
create policy "task_action_items_manager_insert" on public."task_action_items"
  for insert with check (is_manager(org_id));
create policy "task_action_items_manager_update" on public."task_action_items"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "task_action_items_manager_delete" on public."task_action_items"
  for delete using (is_manager(org_id));

-- ── task_assignments ────────────────────────────────────────────────────
drop policy if exists "task_assignments_manager_all" on public."task_assignments";
drop policy if exists "task_assignments_select" on public."task_assignments";
create policy "task_assignments_select" on public."task_assignments"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "task_assignments_manager_insert" on public."task_assignments"
  for insert with check (is_manager(org_id));
create policy "task_assignments_manager_update" on public."task_assignments"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "task_assignments_manager_delete" on public."task_assignments"
  for delete using (is_manager(org_id));

-- ── task_dependencies ───────────────────────────────────────────────────
drop policy if exists "task_dependencies_manager_all" on public."task_dependencies";
drop policy if exists "task_dependencies_select" on public."task_dependencies";
create policy "task_dependencies_select" on public."task_dependencies"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "task_dependencies_manager_insert" on public."task_dependencies"
  for insert with check (is_manager(org_id));
create policy "task_dependencies_manager_update" on public."task_dependencies"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "task_dependencies_manager_delete" on public."task_dependencies"
  for delete using (is_manager(org_id));

-- ── tasks ───────────────────────────────────────────────────────────────
drop policy if exists "tasks_manager_all" on public."tasks";
drop policy if exists "tasks_select" on public."tasks";
create policy "tasks_select" on public."tasks"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "tasks_manager_insert" on public."tasks"
  for insert with check (is_manager(org_id));
create policy "tasks_manager_update" on public."tasks"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "tasks_manager_delete" on public."tasks"
  for delete using (is_manager(org_id));

-- ── tra_approvals ───────────────────────────────────────────────────────
drop policy if exists "tra_approvals_instructor_scoped" on public."tra_approvals";
drop policy if exists "tra_approvals_manager_all" on public."tra_approvals";
drop policy if exists "tra_approvals_select" on public."tra_approvals";
create policy "tra_approvals_select" on public."tra_approvals"
  for select using (
    ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))))
     or (is_manager(org_id))
     or ((org_id IN ( SELECT user_org_ids() AS user_org_ids)))
  );
create policy "tra_approvals_instructor_scoped_insert" on public."tra_approvals"
  for insert with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_approvals_instructor_scoped_update" on public."tra_approvals"
  for update using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text]))))))) with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_approvals_instructor_scoped_delete" on public."tra_approvals"
  for delete using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_approvals_manager_insert" on public."tra_approvals"
  for insert with check (is_manager(org_id));
create policy "tra_approvals_manager_update" on public."tra_approvals"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "tra_approvals_manager_delete" on public."tra_approvals"
  for delete using (is_manager(org_id));

-- ── tra_audience_roles ──────────────────────────────────────────────────
drop policy if exists "tra_audience_roles_instructor_scoped" on public."tra_audience_roles";
drop policy if exists "tra_audience_roles_manager_all" on public."tra_audience_roles";
drop policy if exists "tra_audience_roles_select" on public."tra_audience_roles";
create policy "tra_audience_roles_select" on public."tra_audience_roles"
  for select using (
    ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))))
     or (is_manager(org_id))
     or ((org_id IN ( SELECT user_org_ids() AS user_org_ids)))
  );
create policy "tra_audience_roles_instructor_scoped_insert" on public."tra_audience_roles"
  for insert with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_audience_roles_instructor_scoped_update" on public."tra_audience_roles"
  for update using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text]))))))) with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_audience_roles_instructor_scoped_delete" on public."tra_audience_roles"
  for delete using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_audience_roles_manager_insert" on public."tra_audience_roles"
  for insert with check (is_manager(org_id));
create policy "tra_audience_roles_manager_update" on public."tra_audience_roles"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "tra_audience_roles_manager_delete" on public."tra_audience_roles"
  for delete using (is_manager(org_id));

-- ── tra_deliverables ────────────────────────────────────────────────────
drop policy if exists "tra_deliverables_instructor_scoped" on public."tra_deliverables";
drop policy if exists "tra_deliverables_manager_all" on public."tra_deliverables";
drop policy if exists "tra_deliverables_select" on public."tra_deliverables";
create policy "tra_deliverables_select" on public."tra_deliverables"
  for select using (
    ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))))
     or (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "tra_deliverables_instructor_scoped_insert" on public."tra_deliverables"
  for insert with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_deliverables_instructor_scoped_update" on public."tra_deliverables"
  for update using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text]))))))) with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_deliverables_instructor_scoped_delete" on public."tra_deliverables"
  for delete using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_deliverables_manager_insert" on public."tra_deliverables"
  for insert with check (is_manager(org_id));
create policy "tra_deliverables_manager_update" on public."tra_deliverables"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "tra_deliverables_manager_delete" on public."tra_deliverables"
  for delete using (is_manager(org_id));

-- ── tra_evaluation_plan ─────────────────────────────────────────────────
drop policy if exists "tra_evaluation_plan_instructor_scoped" on public."tra_evaluation_plan";
drop policy if exists "tra_evaluation_plan_manager_all" on public."tra_evaluation_plan";
drop policy if exists "tra_evaluation_plan_select" on public."tra_evaluation_plan";
create policy "tra_evaluation_plan_select" on public."tra_evaluation_plan"
  for select using (
    ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))))
     or (is_manager(org_id))
     or ((org_id IN ( SELECT user_org_ids() AS user_org_ids)))
  );
create policy "tra_evaluation_plan_instructor_scoped_insert" on public."tra_evaluation_plan"
  for insert with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_evaluation_plan_instructor_scoped_update" on public."tra_evaluation_plan"
  for update using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text]))))))) with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_evaluation_plan_instructor_scoped_delete" on public."tra_evaluation_plan"
  for delete using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_evaluation_plan_manager_insert" on public."tra_evaluation_plan"
  for insert with check (is_manager(org_id));
create policy "tra_evaluation_plan_manager_update" on public."tra_evaluation_plan"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "tra_evaluation_plan_manager_delete" on public."tra_evaluation_plan"
  for delete using (is_manager(org_id));

-- ── tra_kpis ────────────────────────────────────────────────────────────
drop policy if exists "tra_kpis_instructor_scoped" on public."tra_kpis";
drop policy if exists "tra_kpis_manager_all" on public."tra_kpis";
drop policy if exists "tra_kpis_select" on public."tra_kpis";
create policy "tra_kpis_select" on public."tra_kpis"
  for select using (
    ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))))
     or (is_manager(org_id))
     or ((org_id IN ( SELECT user_org_ids() AS user_org_ids)))
  );
create policy "tra_kpis_instructor_scoped_insert" on public."tra_kpis"
  for insert with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_kpis_instructor_scoped_update" on public."tra_kpis"
  for update using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text]))))))) with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_kpis_instructor_scoped_delete" on public."tra_kpis"
  for delete using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_kpis_manager_insert" on public."tra_kpis"
  for insert with check (is_manager(org_id));
create policy "tra_kpis_manager_update" on public."tra_kpis"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "tra_kpis_manager_delete" on public."tra_kpis"
  for delete using (is_manager(org_id));

-- ── tra_objectives ──────────────────────────────────────────────────────
drop policy if exists "tra_objectives_instructor_scoped" on public."tra_objectives";
drop policy if exists "tra_objectives_manager_all" on public."tra_objectives";
drop policy if exists "tra_objectives_select" on public."tra_objectives";
create policy "tra_objectives_select" on public."tra_objectives"
  for select using (
    ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))))
     or (is_manager(org_id))
     or ((org_id IN ( SELECT user_org_ids() AS user_org_ids)))
  );
create policy "tra_objectives_instructor_scoped_insert" on public."tra_objectives"
  for insert with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_objectives_instructor_scoped_update" on public."tra_objectives"
  for update using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text]))))))) with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_objectives_instructor_scoped_delete" on public."tra_objectives"
  for delete using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_objectives_manager_insert" on public."tra_objectives"
  for insert with check (is_manager(org_id));
create policy "tra_objectives_manager_update" on public."tra_objectives"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "tra_objectives_manager_delete" on public."tra_objectives"
  for delete using (is_manager(org_id));

-- ── tra_smes ────────────────────────────────────────────────────────────
drop policy if exists "tra_smes_instructor_scoped" on public."tra_smes";
drop policy if exists "tra_smes_manager_all" on public."tra_smes";
drop policy if exists "tra_smes_select" on public."tra_smes";
create policy "tra_smes_select" on public."tra_smes"
  for select using (
    ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))))
     or (is_manager(org_id))
     or ((org_id IN ( SELECT user_org_ids() AS user_org_ids)))
  );
create policy "tra_smes_instructor_scoped_insert" on public."tra_smes"
  for insert with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_smes_instructor_scoped_update" on public."tra_smes"
  for update using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text]))))))) with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_smes_instructor_scoped_delete" on public."tra_smes"
  for delete using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_smes_manager_insert" on public."tra_smes"
  for insert with check (is_manager(org_id));
create policy "tra_smes_manager_update" on public."tra_smes"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "tra_smes_manager_delete" on public."tra_smes"
  for delete using (is_manager(org_id));

-- ── tra_stakeholders ────────────────────────────────────────────────────
drop policy if exists "tra_stakeholders_instructor_scoped" on public."tra_stakeholders";
drop policy if exists "tra_stakeholders_manager_all" on public."tra_stakeholders";
drop policy if exists "tra_stakeholders_select" on public."tra_stakeholders";
create policy "tra_stakeholders_select" on public."tra_stakeholders"
  for select using (
    ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))))
     or (is_manager(org_id))
     or ((org_id IN ( SELECT user_org_ids() AS user_org_ids)))
  );
create policy "tra_stakeholders_instructor_scoped_insert" on public."tra_stakeholders"
  for insert with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_stakeholders_instructor_scoped_update" on public."tra_stakeholders"
  for update using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text]))))))) with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_stakeholders_instructor_scoped_delete" on public."tra_stakeholders"
  for delete using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_stakeholders_manager_insert" on public."tra_stakeholders"
  for insert with check (is_manager(org_id));
create policy "tra_stakeholders_manager_update" on public."tra_stakeholders"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "tra_stakeholders_manager_delete" on public."tra_stakeholders"
  for delete using (is_manager(org_id));

-- ── tra_success_criteria ────────────────────────────────────────────────
drop policy if exists "tra_success_criteria_instructor_scoped" on public."tra_success_criteria";
drop policy if exists "tra_success_criteria_manager_all" on public."tra_success_criteria";
drop policy if exists "tra_success_criteria_select" on public."tra_success_criteria";
create policy "tra_success_criteria_select" on public."tra_success_criteria"
  for select using (
    ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))))
     or (is_manager(org_id))
     or ((org_id IN ( SELECT user_org_ids() AS user_org_ids)))
  );
create policy "tra_success_criteria_instructor_scoped_insert" on public."tra_success_criteria"
  for insert with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_success_criteria_instructor_scoped_update" on public."tra_success_criteria"
  for update using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text]))))))) with check ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_success_criteria_instructor_scoped_delete" on public."tra_success_criteria"
  for delete using ((is_instructor(org_id) AND (tra_id IN ( SELECT tras.id
   FROM tras
  WHERE ((tras.created_by = ( SELECT auth.uid() AS uid)) AND (tras.status = ANY (ARRAY['draft'::text, 'documented'::text])))))));
create policy "tra_success_criteria_manager_insert" on public."tra_success_criteria"
  for insert with check (is_manager(org_id));
create policy "tra_success_criteria_manager_update" on public."tra_success_criteria"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "tra_success_criteria_manager_delete" on public."tra_success_criteria"
  for delete using (is_manager(org_id));

-- ── tras ────────────────────────────────────────────────────────────────
drop policy if exists "tras_manager_all" on public."tras";
drop policy if exists "tras_select" on public."tras";
create policy "tras_select" on public."tras"
  for select using (
    (is_manager(org_id))
     or (((org_id IN ( SELECT user_org_ids() AS user_org_ids)) AND (is_manager(org_id) OR (department_id IN ( SELECT user_department_ids() AS user_department_ids)))))
  );
create policy "tras_manager_insert" on public."tras"
  for insert with check (is_manager(org_id));
create policy "tras_manager_update" on public."tras"
  for update using (is_manager(org_id)) with check (is_manager(org_id));
create policy "tras_manager_delete" on public."tras"
  for delete using (is_manager(org_id));
