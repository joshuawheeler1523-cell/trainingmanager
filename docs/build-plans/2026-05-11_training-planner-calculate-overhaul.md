# Training Planner — Calculate + Generator overhaul

**Status:** in progress (2026-05-11)
**Owner:** Joshua Wheeler
**Why:** the Calculate step doesn't answer the question it exists to answer ("do we have enough resources, and if not, how many more?") and the greedy generator violates several of its own spec rules (even load distribution, equipment matching, business hours, go-live buffer). This is Arbor's most important tool — current state is "happy-path only."

The intent of the Calculate step, per the user: take classes, durations, rooms, capacities, expected headcount and **tell the planner whether the implementation is feasible with current resources, and quantitatively what they need to add to make it feasible.** The current page returns aggregate utilization % — useful as a smoke test, useless as a planning tool.

## Scope decisions (made 2026-05-11)

- All five phases in scope.
- Module-level prerequisites with cumulative-trainee thresholds are **out** — class-level prereqs remain the only prereq model. Phase E reduces to "prereq conflict detection in the trigger."
- Skills-based trainer auto-fill, partial regen, drag-and-drop pre-commit conflict preview: all **deferred to v2**.

## Phase A — Preview accuracy + actionable recommendations (no schema)

File: `apps/web/src/app/(authenticated)/training-planner/[id]/calculate/page.tsx`

Replace the current static preview with one that:

1. Counts **actual working days** in `[window_start, window_end]` per room (intersect with `available_days_of_week`) and per trainer (assume same days as their rooms' union, or all-7 if not constrained). Window weeks math is gone.
2. Per-class feasibility table with explicit blockers:
   - `sessionsNeeded` (already exists)
   - `roomCapacityOk` — at least one room has `seat_capacity >= expected_learners_per_session` AND matches equipment tags (Phase C) AND is available on at least one day
   - `trainerSlateOk` — class has ≥1 trainer in `impl_class_trainers` with `availability_hours_per_week > 0`
   - `prereqReachable` — every class in the prereq chain has its own row valid; otherwise the chain can't complete in the window
3. Quantitative recommendations:
   - "Need ~N more trainer-hours/week" → translated to "Add K trainers @ org-avg h/wk, **or** extend window by W weeks, **or** reduce per-session learners to Y (which increases session count by ΔS)"
   - Same for rooms-hours and rooms-with-capacity-X
4. Bottleneck identification:
   - Highest-utilized trainer (after the Phase B fair distribution lands, this becomes well-defined)
   - Highest-utilized room
   - Most-demanding class (largest `sessions × hours_per_session`)
5. Estimated completion date — run a lightweight TS simulation (no SQL) that mirrors the generator's greedy logic but at preview time, returning the date the LAST session lands on. Compare to `go_live_date - go_live_buffer_days` (Phase D); flag the gap in red.
6. Stricter `ready` gate: every class must satisfy (a)+(b)+(c) above. Button disabled with explicit reason listed.

Tests: extend `apps/web/src/app/(authenticated)/training-planner/actions.test.ts` (or a new `lib/training-planner/feasibility.test.ts`) covering working-day counting, recommendation arithmetic, completion-date simulation.

## Phase B — Generator fairness + correctness (no schema)

File: `supabase/migrations/<new>_schedule_generator_v2.sql` (CREATE OR REPLACE the function — don't edit the historical migration).

Changes to `generate_implementation_schedule`:

1. **Even trainer load:** loop order becomes `day → slot → room (best-fit) → trainer (lowest cumulative hours)`. Pick the trainer whose `total_assigned_hours` is lowest among eligible-and-free trainers. Tie-break by trainer.sort_order.
2. **Best-fit room:** smallest room with `seat_capacity >= expected_learners_per_session` that has equipment match. Frees the larger rooms for bigger classes.
3. **Pre-seed busy state from published sessions on regen:** before walking classes, populate `v_busy_trainer` / `v_busy_room` / `v_trainer_used` from existing `status='published'` rows for this implementation.
4. **Wire up `max_concurrent_sessions`:** trainer's busy-list check becomes "count of overlapping sessions < max_concurrent", not "any overlap = busy."
5. **Stop inserting stub gap-sessions.** Capacity gaps appear in the return payload only (`capacity_gaps: [{class_id, class_name, session_index, reason, suggested_fix}]`). Calendar stays clean.
6. **Quantitative recommendations in payload:** if `capacity_gaps.length > 0`, include `recommendations: {trainers_needed, trainer_hours_needed, rooms_needed, weeks_to_extend, alternative_per_session_reduction}`.
7. **Perf:** replace JSONB scratch with PG temp tables (`pg_temp.busy_trainer(trainer_id, ts_start, ts_end)` and similar). O(log N) lookups via index on (trainer_id, ts_start).
8. **CTE fix:** topological depth uses `UNION` (set), not `UNION ALL`.

Update `apps/web/src/app/(authenticated)/training-planner/actions.ts:545` to widen `ScheduleGenResult` type.
Update `generate-button.tsx` to render the new recommendations block.

## Phase C — Business hours, lunch, equipment (schema additions)

Migration: `supabase/migrations/<new>_impl_business_hours_equipment.sql`

```sql
alter table public.impl_rooms
  add column start_hour_local numeric(4,2) not null default 9.0
    check (start_hour_local >= 0 and start_hour_local < 24),
  add column timezone text;             -- nullable; falls back to org or 'America/New_York'

alter table public.impl_rooms
  add column equipment_tags text[] not null default '{}';

alter table public.impl_classes
  add column required_equipment_tags text[] not null default '{}';

alter table public.implementations
  add column lunch_break_start_minutes int not null default 720  -- 12:00
    check (lunch_break_start_minutes between 0 and 1439),
  add column lunch_break_length_minutes int not null default 60
    check (lunch_break_length_minutes between 0 and 240);
```

UI:

- Rooms editor: add `start_hour_local` number input (formatted as "9:00 AM"), `timezone` dropdown (default to org tz), `equipment_tags` chip input
- Classes editor: `required_equipment_tags` chip input
- Setup form: lunch break inputs (impl-level)

Generator:

- Slot start = `day::date + (start_hour_local hours) AT TIME ZONE timezone`
- Slot skips the lunch interval `[lunch_start, lunch_start + lunch_length]` — a session that would straddle lunch gets pushed past lunch
- Room candidate filter adds `required_equipment_tags <@ room.equipment_tags` (subset)

Preview (Phase A) gets updated to honor all three (equipment-match in room-eligibility, business-hours in working-hour totals, lunch subtracted from each day).

## Phase D — Go-live buffer + completion estimate (schema + logic)

Migration: `supabase/migrations/<new>_impl_go_live_buffer.sql`

```sql
alter table public.implementations
  add column go_live_buffer_days int not null default 7
    check (go_live_buffer_days >= 0);
```

UI: setup form gets the buffer input (default 7 days, can be 0).

Generator:

- Scheduling window upper bound = `least(window_end, go_live_date - buffer)` when go_live is set
- If a class can't fit in the buffered window, payload's `capacity_gaps[].reason` says "would land after go-live buffer cutoff"

Preview:

- Show `target completion = go_live - buffer`
- Show `simulated completion = (Phase A simulation)`
- Gap = `simulated - target`. Red if positive, green if ≤ 0.
- Recommendations adjust: "extend window" recommends only up to `go_live - buffer` (after that the recommendation becomes "move go_live or reduce buffer")

## Phase E — Prereq conflict detection (no schema)

File: `supabase/migrations/<new>_session_prereq_conflict.sql` (CREATE OR REPLACE the trigger function)

Update `recompute_session_conflicts` to also check: for the session's `impl_class_id`, every prerequisite class must have at least one session with `scheduled_end <= NEW.scheduled_start AND status <> 'cancelled'`. If any prereq lacks a completing-before-this-session session, stamp `conflict_status = 'full'` (overriding 'none', combining with existing trainer/room conflicts).

This catches the case where a user drags class B's session before class A's last session via drag-and-drop.

Optional refinement: differentiate "trainer/room conflict" vs "prereq violation" in the UI. Schema today only has `('none', 'partial', 'full')` — keep that, but include a `conflict_reason text` column to convey detail. Migration adds it:

```sql
alter table public.impl_sessions
  add column conflict_reason text;
```

Schedule view shows the reason in the session drawer.

## Out of scope (deferred to v2)

- Module-level prerequisites with `min_trainees_completed` thresholds
- Skills-based trainer auto-fill from org instructor skill tables
- "Re-run for this class only" partial regeneration
- Drag-and-drop pre-commit conflict preview (currently fire-and-forget)

## Pre-launch checklist (every phase)

1. `pnpm --filter web build`
2. `pnpm --filter web lint`
3. `pnpm --filter web test`
4. Regenerate types after each migration: `npx supabase gen types typescript --project-id bujwdmpyuglvpsvyejcm --schema public > types.tmp && head -n -1 types.tmp > apps/web/src/lib/supabase/database.types.ts && rm types.tmp && pnpm prettier --write apps/web/src/lib/supabase/database.types.ts`
5. `npx supabase db push --include-all` to apply migrations
6. Commit per phase, push immediately

## Open questions during build

(Update as we hit decisions.)
