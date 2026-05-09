# Test Plan — Permissions & Workspace Identity

A click-by-click checklist for everything shipped today. Designed to take **20–30 minutes** end to end. Mark each item ✅ or ❌ as you go. If something's wrong, note what you saw — don't try to debug in the moment.

> **What you need before starting:**
>
> - The dev server running locally (`pnpm dev`) **OR** the deployed Vercel URL
> - You signed in as a **manager** (your normal account works)
> - For Part 6 you'll also need the **instructor** and **viewer** test credentials (run `pnpm seed:e2e-users` once and copy the printed values into `apps/web/.env.local`)

---

## Part 1 — Workspace switcher (the big new toy)

This is the most visible thing we built today. You'll switch your org's "preset" and watch the UI relabel + reshape itself.

### 1.1 Find the new settings page

- [ ] Click your name in the top-right → **Profile menu**. You should see a small **MANAGER** badge under your email. ✅ if visible.
- [ ] In the menu, click **Organization admin**.
- [ ] On the admin landing page, find the new tile: **Workspace identity**. Click it.
- [ ] You should land on `/admin/settings/workspace` with three sections: **Workspace preset**, **Terminology**, **Modules**.

### 1.2 Look at the current state

- [ ] In **Workspace preset**, the **Hospital training** card has a small **ACTIVE** badge in the corner.
- [ ] In **Terminology**, the input fields are empty. The light grey text inside (placeholders) shows the defaults: Manager, Instructor, Viewer, etc.
- [ ] In **Modules**, all three checkboxes are **on**: Classes, Training Planner, Public Intake (Request Queue).

### 1.3 Switch to a non-training preset

- [ ] Click the **EMR analyst team** card.
- [ ] First confirmation popup appears asking "Switch to EMR analyst team?". Click **OK**.
- [ ] Second confirmation popup asks "Also overwrite terminology overrides?". Click **OK**.
- [ ] You should see a green toast: "Preset applied: emr analyst".
- [ ] The **EMR analyst team** card now has the **ACTIVE** badge (Hospital training no longer does).
- [ ] The **Modules** section now shows all three checkboxes **off**.
- [ ] Look at the sidebar (left nav): **Classes**, **Training Planner**, and **Request Queue** are **gone**.
- [ ] In the **Team** section of the sidebar, **Instructors** has changed to **Analysts**.

### 1.4 Walk around the relabeled app

- [ ] Click **Analysts** in the sidebar. The page header at top reads **Analysts** (not "Instructors").
- [ ] Look at the empty state copy (if any) — it says "No analysts" instead of "No instructors".
- [ ] Click **Add analyst** button. The dialog title is "Add analyst".
- [ ] Close the dialog.
- [ ] Open your **Profile menu** again — your role badge now reads **Manager** (the role label didn't change because we didn't override `role.manager`, only `role.instructor` → `Analyst`).
- [ ] Visit the **Reports** section → click any report → the filter pane on the right shows "Analysts" as a multi-select filter.
- [ ] Visit **Dashboard**: the KPI card that used to say "Active instructors" now says "Active analysts".

### 1.5 Open a TRA and confirm sections shrank

- [ ] Click **TRAs** in the sidebar.
- [ ] Open any existing TRA.
- [ ] Look at the step indicator at the top. It should now show **7 steps** (not 9). **Learning design** and **Logistics** are gone.
- [ ] Click **Next** through the steps — the wizard skips from step 4 → step 7 cleanly.

### 1.6 Switch back to Hospital training

- [ ] Go back to `/admin/settings/workspace`.
- [ ] Click the **Hospital training** card.
- [ ] OK both confirmation popups.
- [ ] Sidebar restores: **Classes**, **Training Planner**, **Request Queue** reappear. **Analysts** flips back to **Instructors**.
- [ ] Profile menu badge: still **Manager**.
- [ ] Open the same TRA — all 9 steps are back.

> ✅ Part 1 confirms the whole **labeling layer** + **module toggles** + **TRA section conditional** work end-to-end.

---

## Part 2 — Manual terminology override

Try setting a custom label without using a preset.

- [ ] Go to `/admin/settings/workspace` (you should be on Hospital training preset now).
- [ ] In the **Terminology** table, in the **role.instructor** row:
  - Singular field: type `Educator` (Tab to leave the field).
  - Plural field: type `Educators`.
- [ ] In **entity.instructor** row:
  - Singular: `Educator`
  - Plural: `Educators`
- [ ] Click **Save terminology**. Toast: "Terminology saved".
- [ ] Look at sidebar: **Instructors** is now **Educators**.
- [ ] Open profile menu — the Manager badge is unchanged (we didn't override `role.manager`), but if you'd been signed in as an instructor it'd say **Educator**.

### Reset

- [ ] Go back to the Terminology table, **clear** all four fields you just set.
- [ ] Click **Save terminology**.
- [ ] Sidebar reverts to **Instructors**.

> ✅ Part 2 confirms manual overrides work and clearing brings back defaults.

---

## Part 3 — Toggle a single module

- [ ] Go to `/admin/settings/workspace` → **Modules** section.
- [ ] Toggle **Public Intake (Request Queue)** to **off**.
- [ ] Toast: "Public Intake (Request Queue): disabled".
- [ ] Look at sidebar: **Request Queue** disappears.
- [ ] Toggle it back **on**. Sidebar Request Queue reappears.

> ✅ Part 3 confirms individual module flags affect the nav immediately.

---

## Part 4 — Audit trail evidence

Open the audit log to see the record of what we did.

- [ ] Go to `/admin/audit-log`.
- [ ] In the **Operation** filter (or scroll), find an entry with operation **WORKSPACE_PRESET_APPLIED**. There should be one for each time you switched presets in Part 1 (so 2 entries minimum).
- [ ] Click into one. The "new values" panel shows the preset key, the modules that got reseeded, and whether labels were overwritten.
- [ ] Look for **PHASE_2_ROLE_RENAME** entries (3 of them, written when we migrated `org_admin → manager` and `member → instructor` earlier today).
- [ ] If you tried to do something forbidden as a non-manager (we'll do this in Part 6), look for **DENIED** entries.

> ✅ Part 4 confirms audit logging captures schema-level changes and intentional denials.

---

## Part 5 — Three-role visual differences

Sign out and back in as the test users.

> Skip this part if you haven't yet copied the seed-script-printed credentials into `apps/web/.env.local`. The credentials are in your terminal scrollback from when you ran `pnpm seed:e2e-users`.

### 5.1 Sign in as the instructor

- [ ] Sign out.
- [ ] Sign in with the **e2e-instructor@arbor.local** credentials.
- [ ] Profile menu badge: **INSTRUCTOR**.
- [ ] Sidebar should NOT show **Organization admin** under **Admin** section (the whole Admin section is hidden).
- [ ] Try to manually visit `/admin` in the URL bar → you see a **403 Access denied** page. Good.
- [ ] Try `/admin/settings/workspace` directly → also **403**. Good.
- [ ] Visit `/instructors` — page loads. You can see the roster.
- [ ] Click **Add Instructor**. The dialog opens (UI doesn't gate, but the action would fail at the database). Don't actually submit (it'll throw a Supabase error).
- [ ] Close the dialog.

### 5.2 Sign in as the viewer

- [ ] Sign out.
- [ ] Sign in with the **e2e-viewer@arbor.local** credentials.
- [ ] Profile menu badge: **VIEWER**.
- [ ] Sidebar Admin section hidden (same as instructor).
- [ ] `/admin` → **403**. Good.
- [ ] Browse around — you can READ everything but mutating buttons are visible-but-non-functional (the deeper UI gating is Phase 6 follow-on work).

### 5.3 Sign back in as yourself

- [ ] Sign out, sign in as your manager account.

> ✅ Part 5 confirms the role badge, page-level guards, and admin-nav hiding all work per role.

---

## Part 6 — The "soft-lock" guarantee

This proves we didn't break the existing hospital-training experience.

- [ ] Visit `/` (the dashboard). All the existing widgets render.
- [ ] Visit `/instructors` — you can add, edit, archive an instructor (try one if you want — instructions in the help drawer).
- [ ] Visit `/classes` — catalog renders.
- [ ] Visit `/tras` — list renders, you can open one and walk all 9 wizard steps.
- [ ] Visit `/training-planner` — implementations render, you can open one and visit each step (Setup → Rooms → Trainers → Modules → Classes → Calculate → Schedule).
- [ ] Visit `/projects` — projects render, you can open one and see the Gantt/Kanban/Calendar views.
- [ ] Visit `/allocations` — all six tabs (Buckets, Global, Groups, Individuals, Recurring, Ad-hoc) render.

> ✅ Part 6 confirms the original hospital training workflow is fully preserved.

---

## Part 7 — Drag-and-drop sanity check (the React warning fix)

- [ ] Open browser **DevTools** (F12), switch to the **Console** tab.
- [ ] Visit `/allocations`, click the **Buckets** tab.
- [ ] Click and drag a bucket row up or down to reorder it. The drop should land cleanly.
- [ ] Look at the console — there should be NO red warning that says **"<tbody> cannot contain a nested <div>"** anymore.

> ✅ Part 7 confirms the React DOM warning is gone.

---

## What's left if anything looks off

If any item failed:

1. **Note exactly what you clicked + what you saw** (screenshot if possible).
2. Check `audit_log` — was the action attempted? Was a `DENIED` row written?
3. Tell me which part + item failed and what you saw. I'll dig in.

---

## Sign-off

- [ ] Part 1 — Workspace switcher: ✅ / ❌
- [ ] Part 2 — Manual terminology override: ✅ / ❌
- [ ] Part 3 — Single module toggle: ✅ / ❌
- [ ] Part 4 — Audit trail: ✅ / ❌
- [ ] Part 5 — Three roles: ✅ / ❌ (or N/A if creds not in .env.local)
- [ ] Part 6 — Hospital training golden path: ✅ / ❌
- [ ] Part 7 — DnD warning fixed: ✅ / ❌

If all green, we're clear to move to the next thing on the build plan.
