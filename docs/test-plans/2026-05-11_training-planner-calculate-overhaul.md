# Training Planner Calculate + Generator overhaul — test plan

Smoke test for the 5-phase overhaul shipped 2026-05-11. See
`docs/build-plans/2026-05-11_training-planner-calculate-overhaul.md`.

## Setup (do once)

Create a new implementation, then on the Setup step:

- Name: "Phase E2E test"
- Window: today through today + 8 weeks
- Go-live: today + 9 weeks
- Lunch start (defaults 720 / noon), length 60
- Go-live buffer: 7 days

Add to Rooms step:

- Room A — 12 seats, 8 hrs/day, start 9.0, days M–F, tags `iv-pump,projector`
- Room B — 30 seats, 8 hrs/day, start 7.0, days M–F, tags `projector` (no IV pump)

Add to Trainers step:

- Trainer 1 — 40 h/wk, max concurrent 1
- Trainer 2 — 20 h/wk, max concurrent 1

Add to Classes step:

- "IV Pump 101" — 2 hrs/session, per session 10, total 30, equipment `iv-pump`
- "Provider Overview" — 1 hr/session, per session 25, total 100, no equipment
- "Advanced IV" — 2 hrs/session, per session 8, total 16, equipment `iv-pump`,
  prereq = "IV Pump 101"

Assign both trainers to all classes.

## Phase A — Calculate preview accuracy

On Calculate, verify:

- [ ] Verdict banner reads "Looks feasible" (or "Tight" if you crank trainer
      availability down).
- [ ] Summary cards show: window (days + weeks, NOT "8 weeks" rounded up from a
      partial week — it should be the actual count), sessions needed across
      classes, trainer hours needed vs. available with %.
- [ ] Per-class feasibility table shows green checks for Room / Trainer / Prereq
      on every class.
- [ ] Now go back to Classes, set "IV Pump 101"'s required_equipment_tags to
      include something neither room has (e.g. `dialysis-rig`). Return to
      Calculate: row turns red, "Room" column shows ✗, blockers list reads
      "No room has all required equipment (dialysis-rig)".
- [ ] Recommendations block appears with "Add a room seating ≥10 learners
      (needed for: IV Pump 101)" (because no eligible room exists). Restore
      the tags.
- [ ] Drop Trainer 2 by deleting all class-trainer assignments to one class;
      Calculate shows "Assign at least one trainer to '…'" in recommendations.
      Restore.
- [ ] Top-utilized trainer + top-utilized room cards render. With both
      trainers, both should show roughly even hours (Phase B fairness).
- [ ] Estimated completion card shows three columns: Simulated / Target / Gap.
      Target should read the buffered go-live (e.g. "2026-07-01 (Go-live
      2026-07-08 − 7d buffer)").

## Phase B — Generator fairness + correctness

- [ ] Press **Generate Schedule**. Toast reports N sessions, 0 conflicts.
- [ ] On Schedule step, conflict pills should be all green.
- [ ] Open Trainer 1 vs Trainer 2 in the trainer filter; their session counts
      should be within 1 of each other (fair distribution).
- [ ] On the calendar, "IV Pump 101" sessions should be in the 12-seat room
      (best-fit), NOT the 30-seat room — unless multiple sessions need to run
      in parallel for "Provider Overview" (25-seat). Check filters by Room.
- [ ] No session lands at midnight ("00:00"). Capacity gaps (if any) appear in
      the GenerateButton result block, NOT as fake sessions on the calendar.
- [ ] Set Trainer 1's `max_concurrent_sessions = 2`. Re-Generate. If two
      separate classes can share the same trainer at the same time in
      different rooms, the generator may place them in parallel.
- [ ] Publish a session (or two) via the calendar drawer. Re-Generate. The
      published sessions stay; new draft sessions should NOT overlap them
      and should not flip them to conflict.

## Phase C — Business hours / lunch / equipment

- [ ] Room B's start_hour 7.0: first session in Room B should land at 07:00
      local, not 09:00.
- [ ] With lunch 12:00–13:00, no session should span the 12–13 hour. Verify
      on the calendar: sessions stack 9-11, 13-15, 15-17 (skipping the noon
      hour).
- [ ] Set lunch_break_length_minutes = 0 in Setup, regenerate. Sessions now
      pack back-to-back through noon (9-11, 11-13, 13-15, 15-17). Restore.
- [ ] "Advanced IV" requires `iv-pump`. It should only land in Room A. Verify
      via the Room filter on Schedule.
- [ ] In Calculate's per-class table, the equipment column on classes shows
      the required tags.

## Phase D — Go-live buffer

- [ ] Set Setup's go_live_buffer_days = 0. Calculate's "Target" reads the
      go-live date itself.
- [ ] Set go_live_buffer_days = 21. If the window is shorter, capacity gaps
      should appear with reason "No slot fit before go-live buffer cutoff
      (YYYY-MM-DD)".
- [ ] CompletionCard subline reads "Go-live YYYY-MM-DD − Nd buffer".

## Phase E — Prereq conflict detection

- [ ] On Schedule, drag "Advanced IV" earlier than "IV Pump 101"'s LAST
      session. The session should flip to RED with conflict_reason text
      "Prerequisite 'IV Pump 101' has sessions after this one starts" in
      the drawer.
- [ ] Move it back; conflict clears. Drag two sessions of the same class
      onto the same time slot → trainer/room conflict, drawer shows
      "Trainer double-booked" or "Room double-booked".
- [ ] Edit a session in the drawer to unassign trainer → drawer shows "No
      trainer assigned" reason.

## What was deferred (do NOT expect)

- Module-level prerequisites with `min_trainees_completed` — explicitly out.
- Skills-based trainer auto-fill — v2.
- "Re-run for this class only" partial regen — v2.
