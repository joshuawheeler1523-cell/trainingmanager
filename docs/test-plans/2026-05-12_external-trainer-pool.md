# External / consultant trainer pool — test plan

Migration: `20260512000001_instructors_is_external.sql` +
`20260512000002_workload_views_skip_external.sql`. Adds an `is_external`
flag on `instructors` so consultant / contractor trainers can have a
stable org-level identity (and pick up the cross-impl trainer-conflict
trigger from `20260511000006`) without ever appearing in internal
capacity views.

## Setup

You need:

- A manager account in an org with at least one internal instructor on
  the roster (e.g., "Sarah Test").
- Two implementations in that org (e.g., "Site A" and "Site B"). Either
  pre-existing or create fresh.

## 1. Internal-only filter audit

For each surface below, confirm a freshly-created external pool entry
does **NOT** appear. Pre-step: from any impl's Trainers wizard step,
create a pool entry named "Audit Consultant" via "External / consultant
pool → Or create new".

- [ ] **Instructors page** (`/instructors`) — "Audit Consultant" not in
      the list, not in the department filter dropdown.
- [ ] **Instructor detail** — navigating directly to the audit
      consultant's `/instructors/<id>` should 404 (the page filters
      `is_external = false`).
- [ ] **Work Allocations** (`/allocations`) — not in the per-instructor
      allocation rows.
- [ ] **Dashboard** (`/dashboard`) — not counted in capacity widgets,
      not in instructor breakdown tables.
- [ ] **Classes list** (`/classes`) — not in any "Qualified instructors"
      column rollup.
- [ ] **Class detail** — not in the qualified-instructor picker.
- [ ] **Request queue** (`/request-queue`) — not in the assignee
      dropdown.
- [ ] **Departments admin** (`/admin/departments`) — not counted in
      headcount per department.
- [ ] **Department delete guard** — if you assign an external to a
      department, deleting that department should still succeed (only
      internal headcount counts).
- [ ] **Projects detail** (`/projects/<id>`) — not in the team-member /
      task-assignee picker.
- [ ] **Projects task export** (`/api/projects/<id>/tasks.xlsx`) — not
      in the assignee rows.
- [ ] **Reports filter pane** (`/reports/<slug>`) — not in the
      instructor multiselect.
- [ ] **Workload report** (`/reports/workload` or via saved report) —
      not in the rollup or breakdown.
- [ ] **Skill-gap report** — not counted as a qualified holder of any
      skill.
- [ ] **Allocation report** — not in the bucket-consumption rollup.
- [ ] **Arbor super-admin org detail** (`/arbor/orgs/<id>`) — instructor
      count shows internal only.
- [ ] **`v_instructor_capacity` view** (psql or SQL editor) — confirm
      `select * from v_instructor_capacity where ...` does not return
      the external pool entry.
- [ ] **`/api/v1/instructors`** (REST API) — default response excludes
      externals; `?include_external=true` includes them with
      `is_external: true` in each row.

## 2. Training Planner external pool happy path

- [ ] Open Site A's Trainers step. Right column shows three sections:
      "External / consultant pool" with dropdown + Add, "Or create new"
      with name/email inputs, and a "Add as one-off free-text" details
      disclosure at the bottom.
- [ ] Create new: enter "Jane Consultant" + (optional) email, click
      "Create + add". Toast: "Added Jane Consultant to the external
      pool." Row appears in the trainers table with Source = "Pool"
      (violet chip).
- [ ] Open Site B's Trainers step. "External / consultant pool"
      dropdown now lists "Jane Consultant". Pick her, click Add. Row
      appears with Source = "Pool".

## 3. Cross-impl conflict on the pool entry

- [ ] In Site A's Classes step, ensure a class is assigned to Jane (or
      to all trainers). Calculate → Generate. Sessions land.
- [ ] In Site B's Classes step, ensure a class is assigned to Jane.
      Calculate → Generate.
- [ ] In Site B's Schedule view, drag one of Jane's sessions to a slot
      that overlaps an existing Site A session. Confirm: - The session's border turns rose (`conflict_status = 'full'`). - Hover tooltip shows: _"Trainer is also teaching X in
      implementation Site A at YYYY-MM-DD …"_ - The Site A counterpart session ALSO flips to `full` (bilateral
      flagging from the AFTER trigger).
- [ ] Move the session out of the overlap. Both sessions return to
      `none` conflict status.

## 4. Promote orphan to pool

- [ ] In Site A's Trainers step, add a one-off trainer via the free-text
      disclosure: name "Refugio Vargas", no email. Row appears with
      Source = "Free-text" plus a small "Promote" link.
- [ ] Click "Promote". Expansion row opens with a dropdown ("Pick an
      option…", "+ Create new pool entry from this row", and any
      existing pool candidates as an optgroup).
- [ ] Pick "+ Create new pool entry from this row" → Promote. Toast:
      "Linked to external pool." Row source flips to "Pool".
- [ ] Verify in Site B's Trainers step that "Refugio Vargas" now shows
      in the External pool dropdown.
- [ ] Repeat with a second free-text trainer, but this time pick
      Refugio from the existing pool entries optgroup. Row links to the
      existing entry, no duplicate created.

## 5. Soft-delete from pool

- [ ] In Site A's Trainers step, External pool section, pick an entry
      from the dropdown. A small "Remove this entry from the pool"
      underline link appears below.
- [ ] Click it, confirm the prompt. Toast: "Removed from pool."
- [ ] Refresh Site B's Trainers step. The removed entry is gone from
      the pool dropdown.
- [ ] Existing impl_trainer rows on Site B that link to the removed
      entry still appear in the trainers table; they show Source =
      "Pool" still (the FK survives the soft-delete).
- [ ] If you had a published session for that trainer that overlaps
      another impl, the cross-impl conflict still fires (the trigger
      joins by instructor_id, not by deleted_at).

## 6. Edge: free-text trainer stays usable

- [ ] Add a free-text trainer "One-off Vendor" and leave them
      unpromoted. Calculate → Generate. They get sessions.
- [ ] Schedule one of their sessions to overlap an existing impl in the
      org. Confirm the session does **NOT** flip to `full` cross-impl
      — free-text trainers are intentionally out of scope for cross-
      impl checking (no `instructor_id` to join on).

## 7. Audit-log smoke

- [ ] After creating + soft-deleting a pool entry, check `audit_log`
      (psql): two entries for `instructors` should exist with the
      external row's id, one `INSERT` and one `UPDATE` showing the
      `deleted_at` change.

## 8. Regressions

- [ ] Internal instructors page still works: list, search by name,
      filter by department, view detail, view audit log, soft-delete,
      restore from deleted view.
- [ ] Creating a new internal instructor (via the Instructors page form)
      defaults to `is_external = false`. Confirm with psql.
- [ ] Existing classes, projects, allocations, reports, dashboards,
      requests — render identically to pre-feature behavior.
- [ ] Schedule generator's RPC still produces clean schedules and
      conflict flagging for internal trainers.
