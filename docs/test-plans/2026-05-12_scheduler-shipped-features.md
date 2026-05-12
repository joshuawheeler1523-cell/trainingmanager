# Test plan — scheduler shipped 2026-05-11/12

Covers four PRs that landed on master back-to-back:

- **#17** lunch-span fix + Resource Forecast panel
- **#20** Resource Forecast formatted as a table
- **#19** Schedule view timezone + readability (per-class colors, day view, room lanes)
- **#18** Per-trainer PTO / unavailability windows

Tested in production (no preview URL needed — everything is live on master).
Sign in as you normally would.

## Setup

You'll do most of this against **Dual Care Connect Projects**. After PR #17's
end-to-end verification script ran with `--commit`, that impl has 23 correct
draft sessions live. Don't click Generate again until step 3 below.

## 1. Calculate page — verdict + Resource Forecast (#17 + #20)

Open **Dual Care Connect Projects → Calculate**.

- [ ] Banner reads **"Looks feasible"** (green). Not "Infeasible as configured".
- [ ] Below the summary cards, see a new section titled **"Resource forecast"**.
- [ ] The forecast renders as a **table** (not a bulleted list) with columns: Seats, Need, Have, Status, Classes.
- [ ] Three rows: `≥8`, `≥5`, `≥4`. Each shows `Need=1`, `Have=2/3/4`, **✓** status.
- [ ] "Classes" column wraps cleanly — no awkward overflow even on the ≥5 row that lists 5 classes.
- [ ] A "Trainer headcount" card to the right of the table shows `1 trainer at ~40 h/wk over 6 weeks` with `have 11 entered ✓`.
- [ ] Per-class table below shows **0 unscheduled** sessions — every row has ✓ in Room / Trainer / Prereq columns.

## 2. Schedule view — timezone + readability (#19)

Open **Dual Care Connect Projects → Schedule**.

- [ ] Default view is **Day**, not Week.
- [ ] First AMBULATORY session for Mon Aug 31 reads **9:00 AM → 6:00 PM** (an 8h class with 1h lunch absorbed in the middle). **Not 6 AM → 3 PM** — that was the bug.
- [ ] Footer text reads "Times shown in **America/New_York** (the org's timezone)".
- [ ] Each session block shows just the **class name** (e.g. `AMBULATORY CLINICAL SUPPORT`), not the trainer/room jammed in.
- [ ] **Hover** any block — tooltip shows: class name, full start–end with tz, trainer name, room name + seat count, learner count, status.
- [ ] Same class → **same color** across all its sessions. 8 distinct light colors across the 8 classes (blue, indigo, violet, pink, cyan, teal, orange, etc).
- [ ] No red/amber borders on any block (no conflicts in the default schedule).
- [ ] Each room has its own **lane** (column) in Day view. Concurrent sessions in different rooms don't overlap visually.

## 3. Schedule view — drag-and-drop preserves timezone (#19)

Still on the Schedule view.

- [ ] Drag any session to a new time slot.
- [ ] Confirmation dialog shows the new time in **org tz** (e.g. "Move 'EVS Technician' to Sep 3, 2:00 PM (America/New_York)?"). Not in your browser tz.
- [ ] Confirm. Page refreshes; the session lands at the new time.
- [ ] Refresh the page — time is still correct (persisted in UTC, rendered in org tz).

## 4. Generate → 23 sessions (#17 lunch-span)

- [ ] Click **Calculate → Generate Schedule** (or call it from the page).
- [ ] Toast / payload confirms `23 sessions, 0 capacity gaps`.
- [ ] Return to Schedule — 23 blocks visible. 15 of them (the 6h + 8h ones) span lunch with `start + 9h` (or `start + 7h` for 6h classes) end times.

## 5. Trainer PTO (#18)

Open any training-planner impl → **Trainers** wizard step. Suggest using a
non-Dual-Care impl for this to keep Dual Care's clean schedule undisturbed.

- [ ] New chevron (▶) on the left of every trainer row.
- [ ] New **"Time off"** column with `Add` button per row.
- [ ] Click chevron on a trainer → row expands below with: Start datetime, End datetime, Reason (optional), Add button.
- [ ] Pick start = tomorrow 9 AM, end = tomorrow 5 PM, reason = "Vacation test".
- [ ] Click **Add** → green toast "Time off added", panel shows the new entry as a row, the chip in the Time-off column changes from `Add` to `1 entry` (highlighted amber).
- [ ] **Calculate** → still feasible. Look at the simulator output — the trainer's util should reflect that day off.
- [ ] **Generate Schedule** → no session for that trainer overlaps the PTO window. Spot-check on the Schedule view.
- [ ] Back to Trainers → expand the row → trash-icon next to the entry → remove it. Confirm chip returns to `Add`.

## 6. Cross-tz sanity (#19) — optional

Only if you have a way to change machine tz or a VPN.

- [ ] Open Schedule from a non-Eastern timezone — times should still read 9 AM, not shifted to your local time.

## 7. Regression smokes

- [ ] **Older impl with no PTO** → Trainers step shows the new chevron + Time-off column, but every trainer's chip says `Add` (no entries). Calculate verdict unchanged from before PR #18.
- [ ] **Old impl with short (≤4h) classes only** → Calculate verdict and Resource Forecast unchanged from before PR #17 (the lunch-span fix only changes behavior for sessions ≥ 6h).
- [ ] **Org admin → Organization settings** — `time_zone` field still appears and edits cleanly. Changing it should change what the Schedule view renders (test by setting the org to "America/Los_Angeles" temporarily; 9 AM ET sessions would then show as 6 AM PT — that's correct, since the org tz IS the display tz now).

## 8. Pass/fail decision

If everything ticks: tell Claude "all tests pass, ready for the next phase."
We'll then move to Phase 1.5+ from `docs/build-plans/2026-05-11_realistic-scheduler.md`.

If anything fails: screenshot + paste with the step number. Claude can fix
forward without you having to re-test the parts that worked.
