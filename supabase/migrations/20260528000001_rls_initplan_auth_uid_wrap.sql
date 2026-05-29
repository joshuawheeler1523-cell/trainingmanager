-- Wrap auth.uid() in a SELECT so Postgres evaluates it once per query
-- (in the initplan) instead of re-evaluating per row. Surfaced by Supabase's
-- performance advisor — `auth_rls_initplan` lint on 25 policies, including
-- every tra_* table (each TRA detail page reads 12 of these in one render),
-- plus instructors, notifications, support_tickets, departments, etc.
--
-- Behavior is unchanged. Functional definition of each policy is preserved
-- verbatim; the only edit is `auth.uid()` → `(select auth.uid())`.

-- ── cookie_consents ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cookie_consents_select_own ON public.cookie_consents;
CREATE POLICY cookie_consents_select_own ON public.cookie_consents
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ── department_memberships ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "users see relevant department memberships" ON public.department_memberships;
CREATE POLICY "users see relevant department memberships" ON public.department_memberships
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (user_id = (select auth.uid()))
    OR (department_id IN (
      SELECT d.id FROM departments d WHERE is_manager(d.org_id)
    ))
  );

-- ── departments ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "members can see departments in their orgs" ON public.departments;
CREATE POLICY "members can see departments in their orgs" ON public.departments
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    org_id IN (
      SELECT org_memberships.org_id
      FROM org_memberships
      WHERE org_memberships.user_id = (select auth.uid())
        AND org_memberships.accepted_at IS NOT NULL
    )
  );

-- ── instructors ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS instructors_self_update ON public.instructors;
CREATE POLICY instructors_self_update ON public.instructors
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (is_instructor(org_id) AND user_id = (select auth.uid()))
  WITH CHECK (is_instructor(org_id) AND user_id = (select auth.uid()));

-- ── legal_acceptances ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS legal_acceptances_select_own ON public.legal_acceptances;
CREATE POLICY legal_acceptances_select_own ON public.legal_acceptances
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

-- ── notifications ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (recipient_id = (select auth.uid()))
    OR (org_id IN (SELECT user_org_ids() AS user_org_ids))
  );

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (recipient_id = (select auth.uid()))
  WITH CHECK (recipient_id = (select auth.uid()));

-- ── org_memberships ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users can join via valid invitation" ON public.org_memberships;
CREATE POLICY "users can join via valid invitation" ON public.org_memberships
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (user_id = (select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM org_invitations inv
      WHERE inv.org_id = org_memberships.org_id
        AND inv.email = current_user_email()
        AND inv.accepted_at IS NULL
        AND inv.expires_at > now()
    )
  );

-- ── saved_reports ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS saved_reports_modify_own ON public.saved_reports;
CREATE POLICY saved_reports_modify_own ON public.saved_reports
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((created_by = (select auth.uid())) AND is_manager(org_id))
  WITH CHECK ((created_by = (select auth.uid())) AND is_manager(org_id));

-- ── support_ticket_messages ────────────────────────────────────────────────
DROP POLICY IF EXISTS ticket_messages_select ON public.support_ticket_messages;
CREATE POLICY ticket_messages_select ON public.support_ticket_messages
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
        AND (
          t.user_id = (select auth.uid())
          OR (t.org_id IN (SELECT user_org_ids() AS user_org_ids) AND is_manager(t.org_id))
        )
    )
  );

DROP POLICY IF EXISTS ticket_messages_insert ON public.support_ticket_messages;
CREATE POLICY ticket_messages_insert ON public.support_ticket_messages
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
        AND (
          (support_ticket_messages.author_kind = 'user' AND t.user_id = (select auth.uid()))
          OR (support_ticket_messages.author_kind = 'admin' AND is_manager(t.org_id))
        )
    )
  );

-- ── support_tickets ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS support_tickets_select ON public.support_tickets;
CREATE POLICY support_tickets_select ON public.support_tickets
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (user_id = (select auth.uid()))
    OR ((org_id IN (SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id))
  );

DROP POLICY IF EXISTS support_tickets_insert_own ON public.support_tickets;
CREATE POLICY support_tickets_insert_own ON public.support_tickets
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (user_id = (select auth.uid()))
    AND (org_id IN (SELECT user_org_ids() AS user_org_ids))
  );

DROP POLICY IF EXISTS support_tickets_update ON public.support_tickets;
CREATE POLICY support_tickets_update ON public.support_tickets
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    (user_id = (select auth.uid()))
    OR ((org_id IN (SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id))
  )
  WITH CHECK (
    (user_id = (select auth.uid()))
    OR ((org_id IN (SELECT user_org_ids() AS user_org_ids)) AND is_manager(org_id))
  );

-- ── tra_* (8 child tables, each scoped to the same instructor + tra-status gate)
--
-- The qual/with_check for tra_stakeholders, tra_audience_roles, tra_kpis,
-- tra_success_criteria, tra_objectives, tra_smes, tra_evaluation_plan,
-- tra_approvals, tra_deliverables are identical except for the table name.
DROP POLICY IF EXISTS tra_stakeholders_instructor_scoped ON public.tra_stakeholders;
CREATE POLICY tra_stakeholders_instructor_scoped ON public.tra_stakeholders
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  )
  WITH CHECK (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  );

DROP POLICY IF EXISTS tra_audience_roles_instructor_scoped ON public.tra_audience_roles;
CREATE POLICY tra_audience_roles_instructor_scoped ON public.tra_audience_roles
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  )
  WITH CHECK (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  );

DROP POLICY IF EXISTS tra_kpis_instructor_scoped ON public.tra_kpis;
CREATE POLICY tra_kpis_instructor_scoped ON public.tra_kpis
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  )
  WITH CHECK (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  );

DROP POLICY IF EXISTS tra_success_criteria_instructor_scoped ON public.tra_success_criteria;
CREATE POLICY tra_success_criteria_instructor_scoped ON public.tra_success_criteria
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  )
  WITH CHECK (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  );

DROP POLICY IF EXISTS tra_objectives_instructor_scoped ON public.tra_objectives;
CREATE POLICY tra_objectives_instructor_scoped ON public.tra_objectives
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  )
  WITH CHECK (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  );

DROP POLICY IF EXISTS tra_smes_instructor_scoped ON public.tra_smes;
CREATE POLICY tra_smes_instructor_scoped ON public.tra_smes
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  )
  WITH CHECK (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  );

DROP POLICY IF EXISTS tra_evaluation_plan_instructor_scoped ON public.tra_evaluation_plan;
CREATE POLICY tra_evaluation_plan_instructor_scoped ON public.tra_evaluation_plan
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  )
  WITH CHECK (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  );

DROP POLICY IF EXISTS tra_approvals_instructor_scoped ON public.tra_approvals;
CREATE POLICY tra_approvals_instructor_scoped ON public.tra_approvals
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  )
  WITH CHECK (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  );

DROP POLICY IF EXISTS tra_deliverables_instructor_scoped ON public.tra_deliverables;
CREATE POLICY tra_deliverables_instructor_scoped ON public.tra_deliverables
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  )
  WITH CHECK (
    is_instructor(org_id)
    AND tra_id IN (
      SELECT tras.id FROM tras
      WHERE tras.created_by = (select auth.uid())
        AND tras.status = ANY (ARRAY['draft'::text, 'documented'::text])
    )
  );

-- ── tras (the parent) ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS tras_instructor_insert ON public.tras;
CREATE POLICY tras_instructor_insert ON public.tras
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    is_instructor(org_id)
    AND department_id IN (SELECT user_department_ids() AS user_department_ids)
    AND created_by = (select auth.uid())
  );

DROP POLICY IF EXISTS tras_instructor_update_own ON public.tras;
CREATE POLICY tras_instructor_update_own ON public.tras
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    is_instructor(org_id)
    AND created_by = (select auth.uid())
    AND status = ANY (ARRAY['draft'::text, 'documented'::text])
  )
  WITH CHECK (
    is_instructor(org_id)
    AND created_by = (select auth.uid())
    AND status = ANY (ARRAY['draft'::text, 'documented'::text])
  );
