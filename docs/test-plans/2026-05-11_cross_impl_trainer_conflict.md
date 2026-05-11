# Cross-implementation trainer conflict — test plan

For migration `20260511000006_cross_impl_trainer_conflict.sql` and the
associated TS feasibility cross-impl support. Two layers to verify:

1. **SQL trigger correctness** — pgTAP suite at
   `supabase/tests/cross_impl_trainer_conflict.test.sql`. Run locally
   with `supabase start && supabase test db`. Asserts that bilateral
   conflict flagging works, external (NULL instructor_id) trainers are
   not cross-checked, archived/cancelled impls/sessions don't poison
   the cross-impl check.

2. **Browser end-to-end** — walk-through below. The user is the only one
   who can verify the full UX.

## Setup

You need two implementations in the same org with **one person** linked
on both sides via an `instructors` record. The fastest path:

1. From the org's main nav → Instructors. Make sure "Sarah Test" exists
   as an active instructor (or any name you'll remember). Note her
   instructor row's ID isn't shown directly — just use the same
   instructor row in both impls below.
2. Training Planner → New implementation "Site A — Test." Walk through:
   - Setup: window `today` → `today + 4 weeks`, go-live `today + 5 weeks`,
     buffer 7 days, lunch 12:00 / 60 min.
   - Rooms: add "A1" with 20 seats, M–F 9:00 start, 8 hrs/day.
   - **Trainers: add Sarah from the instructor dropdown** (not as
     external). 40 h/wk.
   - Modules: skip (or add one named "EMR Basics" if you want).
   - Classes: add "EMR Provider A" — 2 hrs/session, 10 per session, 30
     total people. Assign Sarah as the trainer.
3. Repeat for "Site B — Test" with its own room "B1" — but **add Sarah
   from the same instructor dropdown** so both impl_trainers rows point
   at the same instructor record.
4. In Site A's Calculate step, press **Generate Schedule**. Verify all
   sessions land cleanly (no red conflicts).
5. From Site A's Schedule step, press **Publish drafts**. The sessions
   are now `published` and will become cross-impl walls for Site B.

## Cross-impl conflict checks

### A. Calculate preview reflects cross-impl commitments (TS sim)

1. Open **Site B → Calculate**. Without doing anything else, look at
   the verdict banner and the per-class feasibility table.
2. **Expected:** The simulated completion date should be PUSHED LATER
   than it would have been without Site A's published sessions in the
   way — because Sarah's commitments at Site A act as a wall.
3. Compare against a baseline: temporarily delete Site A (Implementations
   list → trash) and reload Site B's Calculate. Completion should now
   be earlier. Restore Site A by re-running its setup, or skip this
   delta-check if you trust the absolute math.

### B. Trigger flags a manual session overlap as 'full'

1. In Site B's Schedule, press **Generate Schedule** to populate drafts.
2. Pick any draft session and drag it onto a time window that overlaps
   one of Site A's published sessions for Sarah.
3. **Expected:**
   - The dragged session turns **red (full conflict)**.
   - Clicking it opens the session drawer.
   - The conflict_reason text reads something like:
     **"Trainer is also teaching 'EMR Provider A' in implementation
     'Site A — Test' at 2026-XX-XX HH:MM–HH:MM."**
   - The Publish button at the top should be available, but Publishing
     a 'full' conflict is what we ask the planner not to do; verify by
     visual cue rather than by attempting Publish.

### C. Bilateral flagging — both sessions show the conflict

1. With Site B's draft overlapping Site A's published session, switch to
   Site A's Schedule view.
2. **Expected:** Site A's published session that previously had no
   conflict should NOW be flagged as 'full' too, with conflict_reason
   referencing Site B.
3. This verifies the AFTER trigger fired and re-stamped the sibling row
   in the other implementation.

### D. Move out of overlap — both clear

1. Back in Site B's Schedule, drag the overlapping draft to a time slot
   that doesn't intersect any Site A published session.
2. **Expected:**
   - Site B's draft: conflict_status drops to 'none' (green).
   - Site A's previously-flagged published session also clears.
   - This verifies bilateral clearing.

### E. External trainer (NULL instructor_id) is NOT cross-checked

1. In Site B, add a SECOND trainer named "External Vendor" via the
   "Add external trainer" path (NOT linked to an instructor record).
2. Edit one of the classes to assign Sarah's class to the external
   trainer instead. Re-generate.
3. Manually schedule an external-trainer draft session at the same time
   as a Sarah commitment in Site A.
4. **Expected:** the external-trainer session does NOT flag red. Sarah
   in Site A is unaffected. This is by design — external trainers are
   not cross-checked. The trainer-creation UX should make this clear
   (note: this is a known gap; future enhancement could nudge linking
   when names match).

### F. Archived implementation doesn't pollute

1. Site A: from Implementations list, archive it (set status to
   "archived" — currently done via the delete button which does
   archive+soft-delete).
2. In Site B, attempt to generate a session at the same time as one of
   Site A's old published sessions.
3. **Expected:** no cross-impl conflict — archived impl sessions don't
   contribute. Site B's session stays green.

### G. Generator pre-seed (no auto-conflicts on regen)

1. Restore Site A (un-archive — easiest is to recreate or directly
   update the DB).
2. Site B Schedule → press **Generate Schedule** to re-run the greedy
   scheduler from scratch.
3. **Expected:** the generated drafts should AVOID Sarah's committed
   Site A windows automatically. No red rows should appear simply
   because of cross-impl overlap. The generator's pre-seed of
   `pg_temp.tmp_busy_trainer` from cross-impl published sessions is
   responsible for this.

## Known limitations to surface to users

- External trainers (those NOT linked to an `instructors` record) are
  silently NOT cross-checked. The trainer-creation form makes both
  paths (linked vs external) available; the planner has to know that
  multi-site trainers must use the linked path.
- Only **published** sessions in OTHER impls count as cross-impl walls.
  Draft sessions in other impls don't (yet) — they're aspirational, not
  commitments.
- Cross-org conflict isn't supported. If your org runs two separate
  Arbor orgs for two hospitals, the trigger won't see across them.
  Same org with two impls is the supported pattern.

## What to do if any step fails

1. Check `supabase/migrations/20260511000006_cross_impl_trainer_conflict.sql`
   is the most recent generator/trigger migration (look in
   `supabase/migrations/` for any later file).
2. In Supabase Studio → Database → Triggers, confirm
   `recompute_session_conflicts` (BEFORE) and
   `recompute_sibling_session_conflicts` (AFTER) both exist on
   `public.impl_sessions`.
3. Use the pgTAP file at `supabase/tests/cross_impl_trainer_conflict.test.sql`
   as the authoritative spec — if it passes locally and your UI
   doesn't reflect it, the bug is in the page layer, not the trigger.
