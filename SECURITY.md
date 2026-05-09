# Security & Permission Model

This document is the one-page summary of how Arbor enforces who-can-do-what. Written for an acquirer or new engineer reviewing the codebase. The full design rationale lives in [docs/build-plans/2026-05-09_permissions-and-workspace-identity.md](./docs/build-plans/2026-05-09_permissions-and-workspace-identity.md).

## TL;DR

- **Three roles** per organization membership: `manager`, `instructor`, `viewer`. DB-enforced via CHECK constraint on `org_memberships.role`.
- **Defense in depth**: every write is gated by RLS at the database layer (primary), server-action checks (secondary), UI hiding (tertiary).
- **Auditable**: every mutation is captured in `public.audit_log` via standard triggers; every FORBIDDEN denial at the app layer is logged with operation `DENIED`.
- **Multi-tenant**: every tenant table carries `org_id` + (most) `department_id`. RLS uses these plus the role to scope access.
- **Anon paths** (public share tokens, public intake forms) are explicitly carved out with separate RLS policies and never share code with authenticated paths.

## Roles

| Role         | Allowed to                                                                                                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manager`    | Full read/write across the org. Manages users, settings, role assignments, TRA conversion, implementation publishing. **Last-manager guard** prevents demotion/removal of the only manager.                                                     |
| `instructor` | Read org-shared catalogs (classes, skills, instructor roster). Write only on their own slice (own profile contact info, own skill self-attestations, own assigned tasks, own draft TRAs, own allocation row). Workload view shows own row only. |
| `viewer`     | SELECT-only across the entire org (except `audit_log`). No mutations on any table. Read-only banner on every form (UX).                                                                                                                         |

## Defense in depth

### 1. Row-Level Security (primary, DB-enforced)

Every tenant-scoped table has RLS enabled. The pattern after Phase 4:

- **Read tier**: `org_id IN (SELECT user_org_ids()) AND (is_manager(org_id) OR department_id IN (SELECT user_department_ids()))`. Covers all roles for SELECT.
- **Manager-only tables** (catalogs, allocations infrastructure, project membership, implementations, recurring tasks): `is_manager(org_id)` for all writes.
- **Self-scoped** (instructors, instructor_skills, individual_allocations): instructor can edit own row only.
- **Creator-scoped** (TRAs + 9 child tables): instructor can edit rows they created when status is draft/documented.
- **Assignment-scoped** (projects, tasks, task_action_items, education_request_assignments): instructor can edit rows they're assigned to.

Helpers (all `SECURITY DEFINER`, search_path locked): `is_manager(org_id)`, `is_instructor(org_id)`, `is_viewer(org_id)`, `has_any_role(org_id, roles[])`, `current_instructor_id(org_id)`, `user_role_in_org(org_id)`.

Two `BEFORE UPDATE` triggers enforce column-level ACL where RLS can't:

- `instructors`: instructor caller can only edit `phone`, `notes` columns.
- `tasks`: instructor caller can only edit `status`, `description`, `percent_complete`, `actual_hours` columns.

### 2. Server-action gates (secondary, app-enforced)

Manager-only server actions check role via the `ctx()` helper before any mutation. On FORBIDDEN, the helper writes a `DENIED` row to `audit_log` so unauthorized attempts are queryable. Currently wired into `/admin/actions.ts` (invitations, member management, settings) and `/admin/settings/workspace/actions.ts` (workspace identity).

Other server actions rely on RLS to enforce role. RLS will reject the underlying SQL operation; the action returns a generic Supabase error.

### 3. UI hiding (tertiary, UX)

`<RoleGate roles={[...]}>` and `<ManagerOnly>` hide UI from users who can't act on it. `<RoleGuard roles={[...]}>` renders a 403 page when a route is accessed by the wrong role. `<FormReadOnlyContext>` flips form inputs to disabled for viewers. **None of these are security boundaries** — they declutter the UI. RLS does the real work.

## Audit trail

Every DML (INSERT/UPDATE/DELETE) on tenant tables is captured by the `write_audit_log()` trigger, attached via `apply_standard_triggers()` to every relevant table. Audit rows include:

- `org_id`, `actor_id`, `operation` (INSERT/UPDATE/DELETE/DENIED/PHASE_2_ROLE_RENAME/WORKSPACE_PRESET_APPLIED)
- `table_name`, `record_id`
- For UPDATE: `changed_fields` array + `old_values`/`new_values` jsonb
- `occurred_at` timestamp

To answer "who did what, when, and was it permitted?":

```sql
SELECT actor_id, operation, table_name, occurred_at, new_values
  FROM public.audit_log
 WHERE org_id = $1
   AND occurred_at > now() - interval '7 days'
 ORDER BY occurred_at DESC;
```

To answer "what unauthorized attempts have we seen?":

```sql
SELECT actor_id, table_name, occurred_at, new_values
  FROM public.audit_log
 WHERE org_id = $1
   AND operation = 'DENIED'
 ORDER BY occurred_at DESC;
```

## Anon access (public paths)

Two carve-outs with explicit RLS policies, never touched by authenticated paths:

1. **Public share tokens** for projects (`projects.public_share_token`). Anon role can read project data when the share token is presented via the `set_share_token(uuid)` SECURITY DEFINER RPC.
2. **Public intake links** for education requests (`public_intake_links` table). Anon role can INSERT into `education_requests` when `submitted_via='public_form'` AND a valid token exists.

Both paths are scoped per-link and revocable.

## Cron / service role

- Cron functions (`notify_aging_requests()`, `notify_expiring_certifications()`) run as `SECURITY DEFINER` to bypass RLS for system inserts. Documented in their comments.
- Direct `service_role` access (used by edge functions and the seeding script) bypasses RLS by design. App-facing code paths never use service_role.

## Schema constraints

- `org_memberships.role` CHECK constraint: `role IN ('manager', 'instructor', 'viewer')` — DB-level single source of truth.
- `org_invitations.role` same constraint — invitations cannot create roles outside the canonical set.
- Last-manager guard in `updateMember` and `removeMember` server actions: refuses to demote/remove the only remaining manager (returns `LAST_MANAGER` error code).

## Auditor checklist

- [x] Every tenant table has RLS enabled.
- [x] Every role transition is logged (`PHASE_2_ROLE_RENAME` for the rename migration; ongoing role changes captured by the `org_memberships` audit trigger).
- [x] Every FORBIDDEN return on manager-gated actions writes a `DENIED` row.
- [x] Last-manager guard prevents lockout.
- [x] Cannot create role values outside the canonical set (DB CHECK constraint).
- [x] Anon paths use separate explicit policies; never share the authenticated SQL.
- [x] No `SECURITY DEFINER` function elevates beyond what its caller needs (each one is documented with intent).
- [~] pgTAP test suite — sample coverage shipped (`supabase/tests/role_helpers.test.sql`, `rls_role_boundaries.test.sql`). Full (role × operation × table) matrix is documented; extending to every table is incremental work.
- [~] E2E suite — manager path live (`apps/web/e2e/hospital-training-golden-path.spec.ts`, `three-roles.spec.ts`). Instructor + viewer specs scaffolded as `test.skip` pending dedicated test users (see `apps/web/e2e/README-roles.md`).
- [x] `docs/permissions.md` generated from JSDoc + policy metadata; `pnpm permissions:check` is the drift guard.

## Reporting a vulnerability

Email contact@raisedbeef.ai. Please do not file public issues for security concerns.
