-- Gate v_public_project_team by the share-token session var so the view
-- can't be drained by anon users.
--
-- Background: Supabase's security advisor flagged v_public_project_team as
-- security_definer_view (ERROR). The view was the actual leak among the 5
-- flagged: it's exposed to `anon`, runs as SECURITY DEFINER (bypasses RLS),
-- and had no WHERE clause of its own. An anonymous user could `select * from
-- v_public_project_team` and receive every project team across every org —
-- bypassing the share-token gate that `tasks` / `milestones` / `project_team_
-- members` enforce via their `*_public_share_select` RLS policies.
--
-- Fix: bake the same share-token check the sibling RLS policies use directly
-- into the view's WHERE clause. The function get_pg_share_token() reads the
-- request-scoped `request.share_token` GUC that the public route sets via
-- the set_share_token RPC before each query (see
-- apps/web/src/app/public/projects/[token]/page.tsx).
--
-- After this change the view returns rows only for projects whose share
-- token matches the current session var — the same projects the caller can
-- reach via direct SELECTs on tasks/milestones today. Authenticated callers
-- inside the app don't use this view (verified via grep); the only consumer
-- is the public share page, which sets the GUC before querying.
--
-- CREATE OR REPLACE preserves the existing grants (anon, authenticated,
-- service_role all retain SELECT). The view's SECURITY DEFINER property
-- (Postgres view default) is unchanged; we're tightening what it returns,
-- not how it executes.

CREATE OR REPLACE VIEW public.v_public_project_team AS
SELECT
  ptm.id,
  ptm.project_id,
  ptm.role,
  ptm.allocated_hours,
  i.full_name AS instructor_name
FROM project_team_members ptm
JOIN instructors i ON i.id = ptm.instructor_id AND i.deleted_at IS NULL
JOIN projects p ON p.id = ptm.project_id
WHERE p.public_share_token IS NOT NULL
  AND p.public_share_token = get_pg_share_token();

COMMENT ON VIEW public.v_public_project_team IS
  'Public read of project_team_members + instructor.full_name for the /public/projects/[token] route. WHERE clause gates rows by the request.share_token GUC (set via set_share_token RPC) so anon callers without a matching token see nothing. Mirrors the share-token RLS on tasks/milestones/projects/project_team_members.';
