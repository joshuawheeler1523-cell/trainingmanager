# Build Plan — Three-Role Permissions + Workspace Identity

| Field            | Value                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Status           | Approved, ready to execute                                                                                                            |
| Date drafted     | 2026-05-09                                                                                                                            |
| Estimated effort | 9–12 working sessions across 8 phases                                                                                                 |
| Scope            | Permission model overhaul + multi-vertical workspace identity (terminology, modules, presets)                                         |
| Constraint       | Hospital training workflows must continue to work end-to-end. Cosmetic/architectural changes allowed; capability removal not allowed. |

---

## 1. Summary

Two strategically linked changes shipped together:

1. **Three-role permissions** — replace today's binary `org_admin` / `member` model with `manager` / `instructor` / `viewer`. Defense-in-depth (RLS + app-layer + audit). Per-instructor row-level scoping using the existing `instructors.user_id` column.
2. **Workspace identity layer** — every org picks a _workspace preset_ at creation that bundles module toggles, default labels, default bucket templates, and intake section visibility. Today's hospital-training experience becomes the default preset; new presets unlock the platform for non-training teams (EMR analysts, clinical informatics, corporate L&D, software engineering, consulting, creative agencies, custom).

Both changes are **architecturally additive**. No core schema renames. No code-path branches based on preset. Internal identifiers stay stable; external labels do all the work.

---

## 2. Vision

**Today:** a polished training-management tool for hospital training departments.

**After this build:** a **capacity & project management platform for specialized knowledge teams**, with hospital training as the gold-path preset and 7 additional presets covering adjacent verticals.

The universal value proposition (true for any team where people aren't interchangeable):

1. **Who can do what?** — skills/certifications
2. **Who is doing what?** — allocations + workload
3. **What are we delivering?** — projects + tasks
4. **What's coming next?** — intake → analyze → convert

The training-specific surface (Classes + Training Planner) becomes one optional module set. Everything else (Allocations, Projects, Intake, Reports, People, Skills, Notifications, Support) is universal.

### Soft-lock guarantee

Hospital training is the **gold-path preset**. Cosmetic and architectural changes are fair game if they improve the whole platform. **Capability removal is not.** Concretely:

- Every workflow a training team uses today still completes after this build.
- The TRA convert-to-project flow stays.
- All 9 TRA sections stay visible for the Hospital Training preset.
- Mercy Health Demo data continues to render correctly.
- Some UI may move (e.g., a nav restructure that reads better across verticals); training users learn the new spot once, no workflow lost.

Regression is enforced by an end-to-end **Hospital Training Golden Path** test (Phase 6) that walks Mercy Health Demo through login → instructors → classes → workload → TRA wizard → training planner. This must pass on every PR after Phase 5.

---

## 3. Working principles

1. **Single source of truth for role.** DB CHECK constraint on `org_memberships.role`. App reads it; never duplicates.
2. **Defense in depth.** RLS is primary enforcement. App-layer gates are mandatory secondary checks. UI hiding is tertiary (UX, not security).
3. **Auditability.** Every role change, every grant, every FORBIDDEN denial written to `audit_log`. An acquirer can answer "who did what, when, and was it permitted?" via SQL alone.
4. **Least privilege.** Instructor scope is per-row, not per-table. Viewer is SELECT-only.
5. **Reversible migration.** Every phase ships independently and can be rolled back without data loss.
6. **Documentation that can't drift.** Permissions matrix is generated from JSDoc tags + policy metadata, not hand-maintained.
7. **Stable internal identifiers.** Tables, role enum values, type names stay canonical (`instructors`, `manager`, `tras`). Only external labels are customizable.
8. **Generalization is additive.** Other workspace presets are subsets or relabels of training. We never subtract from training to enable other verticals.

---

## 4. Three-Role Permission Model

### 4.1 Role definitions

| Role           | Cardinality                     | Operating model                                                                                                                                                                                                                                                    |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **manager**    | 1+ per org (last-manager guard) | Full read/write across the org. Replaces today's `org_admin`. Manages users, settings, role assignments, TRA conversions, implementation publishing.                                                                                                               |
| **instructor** | Many                            | Scoped operator. Reads org-shared catalogs (classes, skills, instructor roster). Writes only on their own slice (own profile contact info, own skill self-attestations, own assigned tasks, own draft TRAs, own allocation row). Workload view shows own row only. |
| **viewer**     | Many                            | SELECT-only across the entire org (except `audit_log`). Cannot mutate anything. Read-only banner on every form.                                                                                                                                                    |

### 4.2 Permissions matrix (canonical)

`✓` = full • `~` = scoped to own/assigned • `R` = read only • `—` = denied

| Surface                             | Manager   | Instructor                                                 | Viewer              |
| ----------------------------------- | --------- | ---------------------------------------------------------- | ------------------- |
| Org settings                        | ✓         | —                                                          | —                   |
| Departments                         | ✓         | R                                                          | R                   |
| Feature flags                       | ✓         | —                                                          | —                   |
| Invite users / change roles         | ✓         | —                                                          | —                   |
| Audit log                           | R         | —                                                          | —                   |
| Instructors roster                  | ✓         | R + edit own contact info                                  | R                   |
| Skills catalog                      | ✓         | R                                                          | R                   |
| Instructor-skill links              | ✓         | edit own                                                   | R                   |
| Classes catalog                     | ✓         | R                                                          | R                   |
| Class-instructor assignments        | ✓         | R                                                          | R                   |
| Allocations (buckets/global/groups) | ✓         | —                                                          | R                   |
| Allocations (individual)            | ✓         | R + edit own                                               | R                   |
| Workload view                       | ✓ all     | own row                                                    | R all               |
| TRAs                                | ✓         | edit own draft, mark own `documented`, save own child rows | R                   |
| TRA → Project conversion            | ✓         | —                                                          | —                   |
| TRA archive/cancel                  | ✓         | own only                                                   | —                   |
| Projects                            | ✓         | R; edit if team member                                     | R                   |
| Project team membership             | ✓         | R                                                          | R                   |
| Tasks                               | ✓         | edit if assigned (status, action items, percent_complete)  | R                   |
| Task creation/deletion              | ✓         | —                                                          | —                   |
| Milestones, dependencies            | ✓         | —                                                          | R                   |
| Project share token                 | ✓         | —                                                          | —                   |
| Implementations (Training Planner)  | ✓         | R if listed as trainer; edit own session details           | R                   |
| Publish implementation              | ✓         | —                                                          | —                   |
| Education requests                  | ✓         | R + assigned ones writable                                 | R                   |
| Reports                             | ✓ all 5   | self-scoped only                                           | R saved org-visible |
| Saved report templates              | ✓         | own only                                                   | R org-visible       |
| Support tickets                     | ✓ all org | own only                                                   | own only            |
| Notifications                       | own       | own                                                        | own                 |

This matrix is the contract. Every RLS policy and server-action gate must conform. Drift is caught by the generated permissions doc (Phase 7).

### 4.3 Resolved design decisions

| Decision                                         | Choice                                  | Rationale                                                                                                                         |
| ------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Rename `org_admin` → `manager` everywhere        | Yes                                     | Cleaner naming for acquisition. Backward-compat alias `is_org_admin` kept for one migration cycle then dropped.                   |
| Auto-link invite email → existing instructor row | Yes, with audit_log entry               | Saves manager a step. Email match is unique-per-org so no ambiguity.                                                              |
| Can instructor convert own TRA → project         | No, manager only                        | Conversion creates project + tasks + assignments — too much org-wide impact.                                                      |
| Can instructor mark own TRA `documented`         | Yes (creator OR manager)                | Their work, they finish it.                                                                                                       |
| Instructor edits own `instructors` row           | Contact info yes, status/active flag no | Contact info self-service; HR fields stay manager-controlled. Enforced via column-level ACL trigger.                              |
| Allocation visibility for instructors            | Own row only                            | Allocations = effectively comp planning. Other people's allocations are sensitive.                                                |
| Reports for instructors                          | Self-scoped reports only                | Workload report filtered to self. No org-wide reports. Manager: full. Viewer: read org-visible saved reports.                     |
| Department-level manager (4th role)              | No, keep 3 roles                        | Simpler. If multi-dept manager scope is ever needed, add `org_memberships.department_scope_ids[]` later — additive, not breaking. |

---

## 5. Workspace Identity Layer

### 5.1 Concept

A **workspace preset** is a bundle:

- Module toggles (which features appear in nav)
- Default labels for roles + entities (e.g., "Trainer" vs "Analyst" vs "Engineer")
- Default bucket template (initial allocation bucket slate)
- Default skill categories
- Intake (TRA) section visibility

One preset is picked at org creation. Re-applying a different preset later requires a destructive-action confirmation.

### 5.2 Terminology layer

Internal vs display names are split. Two new columns on `organizations`:

```sql
ALTER TABLE organizations
  ADD COLUMN role_labels jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN entity_labels jsonb DEFAULT '{}'::jsonb;

-- role_labels:    { "instructor": { "singular": "Trainer", "plural": "Trainers" }, ... }
-- entity_labels:  { "instructor": { "singular": "Trainer", "plural": "Trainers" } }
```

**Two separate fields** because they're often equal (the role "instructor" matches the entity noun) but not always — a hospital might call its people "Clinical Educators" but the role just "Educator" for brevity.

**Defaults shipped in code:**

```ts
export const DEFAULT_LABELS = {
  "role.manager": { singular: "Manager", plural: "Managers" },
  "role.instructor": { singular: "Instructor", plural: "Instructors" },
  "role.viewer": { singular: "Viewer", plural: "Viewers" },
  "entity.instructor": { singular: "Instructor", plural: "Instructors" },
};
```

**Resolution at runtime:** `useOrgLabels()` hook merges org overrides over defaults. `<Label kind="role.instructor" plural />` renders the right string. Used everywhere instead of hardcoded strings.

**Audit log + RLS continue to use canonical names** (`'manager'`, `'instructor'`, `'viewer'`) for stability across language drift.

### 5.3 Module toggles

Reuses the existing `feature_flags` table with a canonical key namespace:

```sql
INSERT INTO feature_flags (org_id, key, enabled) VALUES
  (org_id, 'module.classes',             true|false),
  (org_id, 'module.training_planner',    true|false),
  (org_id, 'module.education_requests',  true|false);
```

**Always-on modules** (no toggle): Allocations, Projects, Intake (TRA), Reports, People, Skills, Notifications, Support, Admin.

**Toggleable modules:** Classes, Training Planner, Education Requests (Public Intake).

When a module is off, its nav entry is hidden. Existing data is preserved; turning the module back on restores the experience.

### 5.4 Workspace presets — v1 library

Eight presets shipped. Hospital training is the default at org creation.

| Preset                            | Modules on                               | "People" called | "Intake" called  | Default buckets                                     |
| --------------------------------- | ---------------------------------------- | --------------- | ---------------- | --------------------------------------------------- |
| **Hospital training** _(default)_ | Classes, Training Planner, Public Intake | Instructors     | TRA              | New content / Maintenance / Direct training / Admin |
| **Corporate L&D**                 | Classes, Training Planner                | Trainers        | Training Request | Design / Delivery / Sustainment / Admin             |
| **EMR analyst team**              | —                                        | Analysts        | Build Request    | Build / Optimization / Support / Meetings           |
| **Clinical informatics**          | —                                        | Informaticists  | Initiative       | Strategy / Build / Governance / Meetings            |
| **Software engineering**          | —                                        | Engineers       | Spec             | Features / Tech debt / Oncall / Meetings            |
| **Consulting firm**               | Public Intake                            | Consultants     | Engagement Brief | Billable / Internal / BD / Admin                    |
| **Creative agency**               | Public Intake                            | Producers       | Creative Brief   | Active production / Pitch / Internal                |
| **Custom**                        | choose                                   | choose          | choose           | empty (use templates)                               |

### 5.5 What stays, moves, or hides per preset

| Surface                                             | Hospital Training              | Other presets                                                                                          |
| --------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Classes nav                                         | visible                        | hidden when `module.classes=false`                                                                     |
| Training Planner nav                                | visible                        | hidden when `module.training_planner=false`                                                            |
| TRA Section 5 (Learning design)                     | visible                        | hidden when `module.training_planner=false` (Section 5 is rollout/cadence stuff)                       |
| TRA Section 6 (Logistics) — training rollout fields | visible                        | hidden when `module.training_planner=false`                                                            |
| Bucket template gallery                             | training-flavored templates    | preset-flavored templates                                                                              |
| Skill seed data                                     | medical/educational categories | preset-flavored categories                                                                             |
| Workload sources (`v_instructor_workload`)          | all 7                          | dropping a module silently drops its source from the union — view continues to work with fewer sources |

**Internal table names never change.** `instructors`, `classes`, `tras`, `implementations`, `instructor_skills` all stay. The `<Label>` component handles all display.

---

## 6. Architecture

### 6.1 Database layer

#### 6.1.1 Role helpers (new, all `SECURITY DEFINER`)

```sql
-- Returns the caller's role for a given org, or NULL if not a member.
public.user_role_in_org(p_org_id uuid) returns text;

public.is_manager(p_org_id uuid) returns boolean;
public.is_instructor(p_org_id uuid) returns boolean;
public.is_viewer(p_org_id uuid) returns boolean;
public.has_any_role(p_org_id uuid, p_roles text[]) returns boolean;

-- The scope key for instructor-tier RLS
public.current_instructor_id(p_org_id uuid) returns uuid;
  -- SELECT id FROM instructors WHERE user_id = auth.uid() AND org_id = p_org_id LIMIT 1

-- Backward-compat shim (one migration cycle, then dropped in Phase 7)
public.is_org_admin(p_org_id uuid) returns boolean;
  -- delegates to is_manager()
```

#### 6.1.2 Role enum migration

```sql
ALTER TABLE org_memberships
  DROP CONSTRAINT org_memberships_role_check,
  ADD CONSTRAINT org_memberships_role_check
    CHECK (role IN ('manager','instructor','viewer'));

UPDATE org_memberships SET role = 'manager'    WHERE role = 'org_admin';
UPDATE org_memberships SET role = 'instructor' WHERE role = 'member';
UPDATE org_invitations SET role = 'manager'    WHERE role = 'org_admin';
UPDATE org_invitations SET role = 'instructor' WHERE role = 'member';
```

#### 6.1.3 RLS policy pattern

Every domain table gets a uniform 3-policy structure, replacing today's 2-policy uniform pattern:

```sql
-- Manager: full
CREATE POLICY <t>_manager_all ON <t> FOR ALL
  USING (public.is_manager(org_id))
  WITH CHECK (public.is_manager(org_id));

-- Read tier: instructor + viewer can SELECT
CREATE POLICY <t>_read ON <t> FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));

-- Instructor scoped writes (only on tables where it applies)
CREATE POLICY <t>_instructor_write ON <t> FOR <op>
  USING (<scope predicate>)
  WITH CHECK (<scope predicate>);
```

#### 6.1.4 Per-domain instructor-write scope predicates

| Table                           | Instructor write predicate                                                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `instructors`                   | `user_id = auth.uid()` plus column-ACL trigger restricting writable columns to `phone`, `notes`                                                                                                                           |
| `instructor_skills`             | `instructor_id = current_instructor_id(org_id)`                                                                                                                                                                           |
| `tras` (UPDATE)                 | `created_by = auth.uid() AND status = 'draft'`                                                                                                                                                                            |
| `tra_*` child rows              | `tra_id IN (SELECT id FROM tras WHERE created_by = auth.uid() AND status IN ('draft','documented'))`                                                                                                                      |
| `tasks` (UPDATE)                | exists `task_assignments ta JOIN project_team_members ptm WHERE ta.task_id = tasks.id AND ptm.instructor_id = current_instructor_id(org_id)` plus column-ACL trigger restricting to `status`, `notes`, `percent_complete` |
| `task_action_items`             | parent task is assigned to caller                                                                                                                                                                                         |
| `individual_allocations`        | `instructor_id = current_instructor_id(org_id)` (UPDATE only — manager creates row, instructor adjusts %)                                                                                                                 |
| `saved_reports`                 | `created_by = auth.uid()` (already in place)                                                                                                                                                                              |
| `implementation_class_trainers` | session row's trainer = caller; status/notes only                                                                                                                                                                         |
| `notifications`                 | `recipient_id = auth.uid()` (tighten existing)                                                                                                                                                                            |
| `support_tickets`               | `user_id = auth.uid()` (tighten viewer to own only)                                                                                                                                                                       |

Viewer has only `<t>_read` policies, so all INSERT/UPDATE/DELETE statements fail RLS automatically.

#### 6.1.5 Workspace identity schema

```sql
ALTER TABLE organizations
  ADD COLUMN preset_key text DEFAULT 'hospital_training' NOT NULL,
  ADD COLUMN role_labels jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN entity_labels jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD CONSTRAINT organizations_preset_key_check
    CHECK (preset_key IN (
      'hospital_training','corporate_ld','emr_analyst','clinical_informatics',
      'software_engineering','consulting','creative_agency','custom'
    ));
```

Module toggles via existing `feature_flags`. Preset application is an RPC `apply_workspace_preset(p_org_id uuid, p_preset_key text, p_overwrite_labels boolean default false)` that:

1. Sets `preset_key` on org
2. Upserts `feature_flags` for each module
3. Optionally upserts `role_labels` + `entity_labels` (off by default — preserves existing custom labels unless explicitly requested)
4. Optionally seeds default skill categories + bucket template (manager confirms)
5. Writes audit_log entry `workspace_preset_applied`

### 6.2 Application layer

#### 6.2.1 Auth helpers (new file)

```ts
// apps/web/src/lib/auth/role.ts
export type Role = "manager" | "instructor" | "viewer";

export async function getCurrentRole(orgId: string): Promise<Role | null>;
export async function requireRole(roles: Role[], orgId: string): Promise<Role>;
// Throws { code: 'FORBIDDEN' }; also writes audit_log denial entry.
```

#### 6.2.2 `ctx()` upgrade — every server action

Every `apps/web/src/app/**/actions.ts` file gets a refactored `ctx()` helper that accepts a required-roles parameter:

```ts
async function ctx(roles: Role[] = ['manager']) {
  const orgId = await getCurrentOrgId();
  if (!orgId) throw forbidden('No org');
  const role = await getCurrentRole(orgId);
  if (!role || !roles.includes(role)) {
    await writeAuditDenial(orgId, callerActionName(), 'role_check_failed');
    throw forbidden(`Role required: ${roles.join('|')}`);
  }
  return { orgId, role, supabase: ... };
}
```

Every exported server action declares its required role(s) explicitly + a JSDoc `@requiredRole` tag. Permissions doc (Phase 7) is generated from these tags.

#### 6.2.3 Terminology hook

```ts
// apps/web/src/lib/labels/use-org-labels.ts
export function useOrgLabels(): { label: (kind: string, opts?: { plural?: boolean }) => string };

// React component
<Label kind="role.instructor" plural />  // → "Instructors" or org override
```

`AuthenticatedLayout` populates a context provider with the org's resolved label map (defaults merged with overrides) per request.

### 6.3 UI layer

- **`<RoleGate roles={['manager']}>...</RoleGate>`** — hides children unless current role matches. Used on every manager-only button and nav item.
- **`<RoleGuard roles={['manager']}>...</RoleGuard>`** — page-level guard, replaces today's `<OrgAdminGuard>`. Renders 403 if role doesn't match.
- **`<FormReadOnlyContext>`** — provider that flips all form controls to disabled for viewers. Forms wrap in this; controls read it.
- **Read-only banner** — shown above the form for viewers: "View-only access. Ask a manager to make changes."
- **Profile menu** — shows current role next to user name.
- **Empty states** — instructors with no assigned projects see: "Ask a manager to add you to a project team."
- **Invite dropdown** — three options with one-line role descriptions.
- **Workspace settings panel** — `/admin/settings/workspace` — shows current preset, terminology overrides with preset picker, module toggles, "Re-apply preset" destructive action.

### 6.4 Audit & observability

- `audit_log` already captures DML across most tables via `apply_standard_triggers`.
- **New helper** `writeAuditDenial(orgId, action, reason)` — every FORBIDDEN return logs one row with `change_kind='denied'`.
- **New view** `v_role_history` — projects `audit_log` rows where `table_name='org_memberships' AND column_changes ? 'role'`. Powers a "Role Change History" page in admin UI.
- **New page** `/admin/role-history` — manager-only. Renders `v_role_history`.
- **New page** `/admin/permissions` — manager-only. Renders the generated permissions matrix.
- **`docs/permissions.md`** — generated by `scripts/generate-permissions-doc.ts` from JSDoc tags + policy metadata. CI fails if drift detected.
- **`SECURITY.md`** at repo root — describes the permission model, defense-in-depth posture, audit guarantees. One page, written for an acquirer.

---

## 7. Edge cases & failure modes

| Case                                                                | Handling                                                                                                                                                             |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Last manager removes self                                           | Block (existing LAST_ADMIN guard, renamed to LAST_MANAGER)                                                                                                           |
| Last manager demoted to instructor                                  | Block, same guard                                                                                                                                                    |
| Instructor's `instructors` row deleted                              | `user_id` cascades to NULL; user becomes role-only with no instructor scope — sees nothing personal but can still view org reads. Manager re-creates row to restore. |
| Two users claim same instructor row                                 | Unique constraint `(user_id, org_id) WHERE user_id IS NOT NULL`                                                                                                      |
| Invite email matches existing instructor row                        | Auto-link on `accept_invitation` RPC; audit log entry `auto_linked_instructor`                                                                                       |
| Invite email matches existing instructor in different org           | Don't link; instructor table is org-scoped                                                                                                                           |
| Manager invited as instructor by mistake                            | Manager can update via `/admin/team` (existing flow)                                                                                                                 |
| Instructor with no `current_instructor_id` (orphan)                 | Read-only experience until manager links them. No errors, just empty personal scopes.                                                                                |
| Public anon paths (share tokens, intake)                            | Untouched — explicit anon policies stay                                                                                                                              |
| Service role / cron                                                 | Untouched — runs as `service_role`, bypasses RLS                                                                                                                     |
| Migration mid-flight (some users still have `org_admin`)            | Backward-compat `is_org_admin = is_manager` alias keeps app functional during 1 cycle                                                                                |
| Org switches preset and existing custom labels would be overwritten | `apply_workspace_preset(..., overwrite_labels=false)` by default; manager toggles overwrite explicitly                                                               |
| Module toggled off while data exists                                | Data preserved; nav entry hidden; toggling back on restores access                                                                                                   |
| TRA created under one preset, viewed under another                  | Section visibility recomputed on render; data preserved regardless. Hidden sections still saved if values exist (no data loss).                                      |
| Workload view query with module off                                 | UNION branch for that source is conditionally compiled or returns empty set                                                                                          |

---

## 8. Phasing

Eight phases. Each ships as one PR (with own migrations + tests + acceptance criteria), independently deployable, independently rollback-safe.

### Phase 1 — Foundation: role helpers (1 session)

- New migration `20260510000001_role_helpers.sql`: `is_manager`, `is_instructor`, `is_viewer`, `current_instructor_id`, `has_any_role`, `user_role_in_org`
- New migration `20260510000002_role_enum_expand.sql`: expand `org_memberships_role_check` to allow new values _in addition to_ old (no data migration yet)
- Backward-compat: `is_org_admin` stays as today, will become an alias in Phase 2
- App: new `apps/web/src/lib/auth/role.ts` with `getCurrentRole` / `requireRole`
- Tests: 18 unit tests for the helpers, no behavioral change to existing app
- **Ships green**: existing app keeps working unchanged

### Phase 2 — Data migration + role rename (1 session)

- Migration `20260510000003_role_data_migration.sql`: `org_admin` → `manager`, `member` → `instructor`. Audit log entry per row.
- Tighten constraint to `IN ('manager','instructor','viewer')` only.
- Rewrite `is_org_admin()` to delegate to `is_manager()` (one-cycle alias).
- App: rename `isOrgAdmin` → `isManager` in code (find/replace); leave deprecated re-export.
- All admin actions now call `isManager`.
- **Ships green**: identical behavior, cleaner names.

### Phase 2.5 — Workspace identity (2 sessions)

- Migration `20260510000004_workspace_identity.sql`: `organizations.preset_key`, `role_labels`, `entity_labels` columns
- RPC `apply_workspace_preset(org, preset_key, overwrite_labels)`
- Seed all existing orgs with `preset_key = 'hospital_training'` and corresponding feature flags on (no behavior change)
- App: `<Label>` component, `useOrgLabels()` hook, label provider in `AuthenticatedLayout`
- App: workspace settings panel at `/admin/settings/workspace` (preset picker, label overrides, module toggles)
- App: org-creation flow shows preset picker (defaults to Hospital training)
- App: nav reads module toggles to conditionally render Classes / Training Planner / Education Requests
- App: TRA wizard reads preset to conditionally render Sections 5–6
- Sweep: replace hardcoded "Instructor" / "Class" / "TRA" / "Manager" / "Viewer" strings with `<Label>`
- Tests: snapshot test pinning hospital-training default labels = current strings (regression guard)
- E2E: hospital training golden path passes (proves no UX regression)
- **Ships green**: hospital orgs see no change; new orgs get preset picker

### Phase 3 — RLS read tier (1 session)

- Per-domain migrations replace uniform `<t>_select` / `<t>_modify` with the 3-tier pattern. **Read tier only** — viewer becomes real (SELECT-only); manager/instructor still both have full ALL.
- 7 migrations grouped by domain: instructors, classes/skills, allocations, TRAs, projects/tasks, implementations, reports/support
- pgtap tests: viewer cannot INSERT/UPDATE/DELETE on each table; manager/instructor still can
- **Ships green**: viewer role is now safely usable; instructor still has full power

### Phase 4 — RLS instructor scope (2 sessions)

- Add per-domain scope predicates per table 6.1.4
- Add column-level ACL triggers for `instructors` (only phone/notes self-editable) and `tasks` (status/notes/percent_complete only)
- pgtap tests: "instructor cannot write to row not their own" per applicable table
- **Largest phase** — split across 2 PRs (catalog + identity tables, then operational tables)
- **Ships green**: instructor permissions now match the matrix

### Phase 5 — Server-action gates + denial logging (1–2 sessions)

- `ctx(roles[])` in every actions.ts file. Annotate every server action with `@requiredRole`.
- `writeAuditDenial` helper. Every FORBIDDEN return logs.
- New tests: vitest "FORBIDDEN for {role}" for every server action
- **Ships green**: belt + suspenders. RLS would have caught it anyway, but app-level audit denial trail is now in place

### Phase 6 — UI: role gates + label sweep + read-only mode (1 session)

- `<RoleGate>` wraps every manager-only button and nav item
- `<RoleGuard>` replaces `<OrgAdminGuard>` everywhere
- `<FormReadOnlyContext>` + read-only banner for viewers
- Profile menu shows role
- Empty states for orphan/unassigned instructors
- E2E: 3 test users (manager, instructor, viewer); 5 smoke flows each
- E2E: hospital training golden path still passes
- **Ships green**: UI now matches actual permission boundaries

### Phase 7 — Acquisition polish (1 session)

- `scripts/generate-permissions-doc.ts` produces `docs/permissions.md` from JSDoc + policy metadata
- CI check: regenerate doc, fail PR if it differs from committed version (drift guard)
- `SECURITY.md` at repo root
- Admin UI: "Role Change History" page (uses `v_role_history`)
- Admin UI: "Permissions matrix" page (renders generated doc)
- Drop the `is_org_admin` deprecated alias (final cleanup)
- Coverage report: pgtap + vitest + playwright; aim 100% on role-gating logic

---

## 9. File-level changes (anchor list)

### New files

**Migrations (`packages/db/supabase/migrations/`)**

- `20260510000001_role_helpers.sql`
- `20260510000002_role_enum_expand.sql`
- `20260510000003_role_data_migration.sql`
- `20260510000004_workspace_identity.sql`
- `20260510000005_rls_read_tier_<domain>.sql` (×7)
- `20260510000006_rls_instructor_scope_<domain>.sql` (×7)
- `20260510000007_v_role_history.sql`
- `20260510000008_drop_isorgadmin_alias.sql`

**Application (`apps/web/src/`)**

- `lib/auth/role.ts` + `role.test.ts`
- `lib/auth/audit-denial.ts`
- `lib/labels/use-org-labels.ts`
- `lib/labels/defaults.ts`
- `components/role-gate.tsx`
- `components/role-guard.tsx` (replaces org-admin-guard)
- `components/label.tsx`
- `components/form-read-only-context.tsx`
- `app/(authenticated)/admin/role-history/page.tsx` + view
- `app/(authenticated)/admin/permissions/page.tsx` + view
- `app/(authenticated)/admin/settings/workspace/page.tsx` + view
- `app/(authenticated)/admin/settings/workspace/actions.ts`

**Shared (`packages/shared/src/`)**

- `presets/index.ts` — preset definitions (hardcoded for v1)
- `presets/types.ts`
- `labels/types.ts` + defaults

**Tests**

- `tests/db/<domain>.pgtap.sql` (×7)
- `e2e/three-roles.spec.ts`
- `e2e/hospital-training-golden-path.spec.ts`
- `e2e/workspace-presets.spec.ts`

**Docs / scripts**

- `docs/permissions.md` (generated)
- `docs/build-plans/2026-05-09_permissions-and-workspace-identity.md` (this file)
- `SECURITY.md` (root)
- `scripts/generate-permissions-doc.ts`

### Changed files (high-level)

- Every `apps/web/src/app/**/actions.ts` — `ctx()` upgrade, role annotations, denial logging
- Every `apps/web/src/app/(authenticated)/**/*-view.tsx` containing manager-only buttons — wrap in `<RoleGate>`
- Every component containing hardcoded "Instructor" / "Class" / "TRA" / "Manager" / "Viewer" — replace with `<Label>`
- `apps/web/src/lib/auth/org-admin.ts` — deprecated alias, dropped in Phase 7
- `apps/web/src/components/org-admin-guard.tsx` — superseded by `<RoleGuard>`
- `apps/web/src/app/(authenticated)/admin/team/team-view.tsx` — invite dropdown updated to 3 roles
- `apps/web/src/app/layout-shell.tsx` (or wherever nav lives) — module toggle conditionals
- `apps/web/src/app/(authenticated)/tras/[id]/wizard/*` — section visibility per preset
- `apps/web/src/lib/supabase/database.types.ts` — regenerated after each schema migration
- `CLAUDE.md` / `AGENTS.md` — pointer to permissions docs

---

## 10. Acceptance criteria (acquisition checklist)

- [ ] Every table has RLS enabled
- [ ] Every domain has pgtap tests proving each role × each operation
- [ ] Every server action has a `@requiredRole` JSDoc tag
- [ ] `docs/permissions.md` exists, is generated, matches the live policies (CI-enforced)
- [ ] No `SECURITY DEFINER` function elevates beyond its caller's intended scope (audit + comment each one)
- [ ] Every FORBIDDEN return is in `audit_log`
- [ ] Last-manager guard is tested
- [ ] E2E tests pass for all three roles
- [ ] Hospital Training Golden Path E2E passes (functional regression guard)
- [ ] Workspace preset re-apply works idempotently with audit log entry
- [ ] Lighthouse a11y >= 95 (no regression)
- [ ] `pnpm build` green
- [ ] `pnpm test` green
- [ ] `SECURITY.md` describes the permission model in 1 page
- [ ] Coverage report attached to final PR
- [ ] Demo script: switching Mercy Health Demo through 3 presets and back proves data integrity

---

## 11. Rollback plan

| Phase     | Rollback action                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1   | Drop helper functions; constraint expansion is forward-compatible                                                                                                      |
| Phase 2   | Reverse data migration: `manager` → `org_admin`, `instructor` → `member`. App alias still works.                                                                       |
| Phase 2.5 | Drop `preset_key`, `role_labels`, `entity_labels` columns. Feature flags can stay or be deleted. App falls back to hardcoded strings if `<Label>` provider is missing. |
| Phase 3   | Recreate uniform old policies; drop new 3-tier policies                                                                                                                |
| Phase 4   | Drop instructor-scope policies + column-ACL triggers                                                                                                                   |
| Phase 5   | Revert `ctx()` to old version; denial logging is additive (audit entries harmless if left)                                                                             |
| Phase 6   | Revert UI components; `<RoleGate>` removal makes everything visible (back to today's UX)                                                                               |
| Phase 7   | Generated docs are append-only artifacts; drop the alias only when confident                                                                                           |

Every migration ships with a corresponding `down.sql` (or inline DOWN comment block). No phase locks us in.

---

## 12. Out of scope

### 12.1 Permanent anti-scope (never building this)

This product is a **capacity & project planning platform**, not a time-tracking or PSA platform. The following are **never** in scope, regardless of preset or vertical:

- **Hour-by-hour time entry / timesheets.** No "log 2.5 hours to project X today." We track _planned capacity_ (Sarah is 40% allocated to training delivery), not _actuals by the hour_.
- **Time clocks / punch in-out.** No clock-in, no stopwatch, no timer.
- **Billable vs non-billable hours.** Even the Consulting Firm preset uses % allocation buckets (a "Billable" bucket is a category name, not a billing flag). Hours-based billing belongs in a separate billing system.
- **Invoice generation.** Not an AR tool.
- **Timesheet approval workflows.** No "submit for approval" weekly cycles.
- **Burn-down by hours actually spent.** Project progress is measured by `percent_complete` or task status, not by `actual_hours / estimated_hours`.
- **HRIS / payroll integration.** Not a system of record for HR.

**What we DO have that is sometimes confused with time tracking:**

- `estimated_hours` on TRAs/deliverables/tasks — forecasting load, not logging time
- `allocation %` on instructors — planning capacity, not recording actuals
- `v_instructor_workload` — aggregated forecast view across sources
- Implementation session schedules — calendar of planned sessions, not attendance records

**Litmus test for any future feature request:** if it requires the user to enter a _number of hours actually worked at a specific time_, it's PSA territory and we say no.

### 12.2 v1 scope cuts (deferred but possible later)

- Per-department module toggles (currently per-org only). Add later via `feature_flags.department_id`.
- Per-department managers (4th role). Add later via `org_memberships.department_scope_ids[]`.
- Fully configurable intake forms (custom fields per intake type). Section visibility per preset is the v1 lever.
- Multi-preset per org.
- Custom presets at runtime (v1 ships 8 fixed; users can override labels + modules but not save a new named preset).
- Renaming internal table names (`instructors` → `people`, etc.) — internal stability is a feature.

---

## 13. Open items (require user decision before final lock)

1. **Preset list** — does the user want all 8 presets in v1, or fewer? Current default = 8.
2. **Default preset at org creation** — defaulting to Hospital Training (current focus). Picker still shown.
3. **Phase 4 split** — split into 2 PRs (catalog tables, then operational tables) by default. Confirm.
4. **Re-apply-preset destructive action** — confirm acceptable to wipe the org's existing module flags + label overrides on re-apply (user can opt out per call).

Default answer for any unresolved item: proceed with the recommendation as written.

---

## 14. Execution sequence

When approved:

1. Update `MEMORY.md` index with pointer to this doc
2. Begin **Phase 1**: role helpers migration + app-layer `getCurrentRole`/`requireRole`
3. After each phase: run `pnpm build`, run pgtap, run vitest, run e2e, push to remote, regenerate database types via MCP, commit + tag the phase
4. Phase 6 onward requires the Hospital Training Golden Path E2E to pass on every PR
