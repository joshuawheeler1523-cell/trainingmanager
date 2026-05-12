# Training Planner — Realistic scheduler

**Status:** planned (2026-05-11)
**Owner:** Joshua Wheeler
**Why:** the user's stated goal is "the most realistic planner on the market." The current scheduler (TS sim + PL/pgSQL greedy generator) handles the core constraints (rooms, trainers, prereqs, lunch, weekly caps, days-of-week, cross-impl trainer conflict, go-live buffer) but is idealized. It models people and rooms as fungible widgets and uses a 1990s-era greedy algorithm that paints itself into corners. To beat enterprise competitors (Kronos, ServiceNow Workforce, ShiftWizard, ScheduleAnywhere) on _realism_, we need three things, in order: more constraints modeled, a real solver replacing the greedy, and AI augmentation for the human-facing surfaces.

This is a multi-quarter program, not a sprint. Each phase is independently shippable and creates user value on its own — there is no "everything ships together" requirement.

## Honest baseline (what the scheduler does today)

| Constraint                           | Modeled? | Notes                                                 |
| ------------------------------------ | -------- | ----------------------------------------------------- |
| Room seat capacity                   | ✓        | best-fit picks smallest fitting room                  |
| Room days-of-week                    | ✓        | per-room `available_days_of_week`                     |
| Room daily hours                     | ✓        | `available_hours_per_day` + lunch span                |
| Room equipment tags                  | ✓        | required tags must be subset of room tags             |
| Trainer eligibility per class        | ✓        | `impl_class_trainers` slate                           |
| Trainer weekly hours cap             | ✓        | per trainer `availability_hours_per_week`             |
| Trainer concurrent sessions          | ✓        | `max_concurrent_sessions` per row                     |
| Cross-impl trainer conflict          | ✓        | via `instructor_id` linkage                           |
| Class prerequisites (order)          | ✓        | topological pass                                      |
| Lunch break (span)                   | ✓        | shipped 2026-05-11                                    |
| Go-live buffer                       | ✓        | sessions clamped before `go_live - buffer_days`       |
| Trainer min rest between sessions    | ✗        | can teach 9-12 then 13-21 same day                    |
| Trainer daily max hours              | ✗        | only weekly cap is enforced                           |
| Holiday calendar                     | ✗        | doesn't know Thanksgiving exists                      |
| Per-trainer PTO / unavailability     | ✗        | no date-range model                                   |
| Per-trainer day-of-week              | ✗        | inherits room days, not their own                     |
| Room setup/teardown buffer           | ✗        | back-to-back at zero gap                              |
| Prereq spacing (min hours/days)      | ✗        | can be same afternoon as prereq                       |
| Multi-trainer classes (team teach)   | ✗        | one trainer per session                               |
| Learner cohorts                      | ✗        | learners fungible; same person could be double-booked |
| No-show / over-booking buffer        | ✗        | plans for exact head count                            |
| Room location / travel time          | ✗        | rooms have a `location` column; not used in placement |
| Trainer travel between rooms         | ✗        | walking time not modeled                              |
| Time-of-day preferences              | ✗        | no morning/afternoon preferences                      |
| Class size minimum (cancel if N<min) | ✗        | always schedules even if 1 learner                    |

## Scope decisions (made 2026-05-11)

- **Phases 1, 3, 4, 5 in scope.** Phase 2 (learner cohorts) is out — learners are handled in a separate system; the scheduler stays at the headcount/cohort-size level.
- **Phase 1.3 (holidays) is out.** User explicitly removed; orgs handle holiday closures by editing the impl window instead.
- **Solver hosting** (Phase 3): try Supabase Edge Function in Python with `ortools` first; fall back to a small Cloud Run service if the runtime doesn't work. User prefers no marginal infra cost but accepts Cloud Run (~$5–20/mo) if necessary.
- **AI provider** (Phase 4): Claude API (`claude-sonnet-4-6` default, escalate to `claude-opus-4-7` for the explanation pipeline). Prompt caching mandatory for the per-impl prompt prefix. Minimize call volume — AI is the only piece with marginal cost.
- **Migration safety**: greedy generator stays alongside the solver for a release cycle; a feature flag picks which one Generate calls. Cutover happens once parity is proven on real impls.
- **Out of scope for this program**: machine-learned demand forecasting, optimization across multiple impls (each impl is solved independently), cost/billing-driven scheduling, learner-level scheduling.

## Phase 1 — Constraint gap closure (greedy stays)

**Goal:** every constraint that hospital planners actually use is modeled in the existing greedy generator and surfaced in Calculate. No solver swap yet — this phase makes "the most realistic _greedy_ planner" the floor we build on.

**Why first:** each gap closed = one less real-world failure mode where Arbor produces a schedule that gets the user yelled at. Smaller, parallelizable, and de-risks Phase 3 (the solver inherits all this logic).

### 1.1 Trainer daily max hours

- Migration: `alter table impl_trainers add column max_hours_per_day numeric(4,2) not null default 10`.
- Sim + generator: track `daily_used[trainer_id, date]` alongside weekly. Skip slot if `daily_used + hours_per_session > max_hours_per_day`.
- UI: column on the Trainers step; defaults to 10.

### 1.2 Trainer minimum rest between sessions

- Migration: `add column min_rest_minutes int not null default 0` on `impl_trainers`.
- Sim + generator: `trainer.nextFree` advances to `session_end + min_rest_minutes` (not just `session_end`).
- UI: editable per trainer; default 0 (no enforced break). Recommend 15-30 min for back-to-back classes.

### 1.3 Holiday calendar — OUT OF SCOPE

User decision 2026-05-11: orgs handle holiday closures by editing the impl window instead of a dedicated holidays model.

### 1.4 Per-trainer PTO / unavailability windows

- Migration: new table `impl_trainer_unavailability(impl_trainer_id, starts_at, ends_at, reason)`.
- Sim + generator: pre-seed `tmp_busy_trainer` from unavailability rows (same pattern as published-session pre-seed).
- UI: a "Time off" sub-section on each trainer row in the Trainers step. Quick presets ("vacation week", "PTO day").

### 1.5 Per-trainer day-of-week

- Migration: `add column available_days_of_week int[] not null default '{1,2,3,4,5}'` on `impl_trainers` (mirror room's column).
- Sim + generator: intersect with room days when picking a slot.
- UI: chip selector per trainer, Mon–Sun.

### 1.6 Room setup/teardown buffer

- Migration: `add column turnover_minutes int not null default 0` on `impl_rooms`.
- Sim + generator: `room.nextFree` advances to `session_end + turnover_minutes`.
- UI: per-room number input. Default 0; suggest 15 for AV-heavy rooms.

### 1.7 Prerequisite spacing

- Migration: `add column min_gap_after_prereq_hours int not null default 0` on `impl_class_prerequisites` (per-edge, not per-class — different prereqs may need different gaps).
- Sim + generator: when computing `prereq_min`, add the per-edge gap.
- UI: editable on each prereq edge in the Classes step.

### 1.8 Multi-trainer classes (team teaching)

- Migration: `add column trainers_per_session int not null default 1` on `impl_classes`.
- Sim + generator: pick N least-loaded eligible trainers when `trainers_per_session > 1`. Conflict detection extends — _all N_ trainers must be free; busy-list inserts N rows.
- Schema: `impl_sessions` already has a single `impl_trainer_id`. Add a junction `impl_session_trainers(session_id, trainer_id, role)` with role in `(primary, assistant)`. Keep `impl_sessions.impl_trainer_id` as the primary trainer for backward compat.
- UI: number input on each class; if >1, show assigned trainers per role.

### 1.9 Class size minimum

- Migration: `add column min_learners_per_session int not null default 1` on `impl_classes`.
- Generator: if `sessions_needed × per_session > total_to_train` and the _last_ session would have fewer than `min`, fold those learners into the previous session (potentially exceeding `per_session` by a small amount) or drop the session.
- UI: input next to `expected_learners_per_session`.

### 1.10 No-show buffer

- Migration: `add column oversubscribe_pct numeric(5,2) not null default 0` on `impl_classes` (10 = book 10% extra to absorb no-shows).
- Calculate: `effective_total = total_people_to_train × (1 + oversubscribe_pct/100)`. `sessions_needed` recomputed.
- UI: slider 0–25% per class.

**Estimated effort:** 4–6 weeks of focused work (1.1–1.5 are 3–4 days each; 1.8 and 1.10 are the bigger items at ~1 week each). Each item is its own PR per the new workflow.

## Phase 2 — Learner cohorts — OUT OF SCOPE

User decision 2026-05-11: learner-level scheduling is handled in a separate system. Arbor's scheduler stays at the headcount level. The original Phase 2 spec (impl_learners + impl_cohorts tables, per-cohort placement) is parked indefinitely.

**Estimated effort:** 3–4 weeks. This is the biggest _data model_ change. Stack it after Phase 1 because the per-cohort logic depends on cohort-aware constraints anyway.

## Phase 3 — CP-SAT solver swap (the big one)

**Goal:** replace the greedy generator with a provably-correct constraint-programming solver. This is the single change that moves us from "fast but optimistic" to "actually-realistic."

### 3.1 Why CP-SAT, not LLMs or other solvers

- **CP-SAT (Google OR-Tools)** is industry standard for scheduling problems with discrete time, capacity constraints, and disjunctions. Open-source, MIT-friendly license. Excellent docs. The same engine powers Google Calendar's scheduling, parts of Tesla's gigafactory planning, and academic course schedulers at scale.
- **Linear programming (Gurobi/CPLEX)** is overkill and expensive ($10k+/yr licenses).
- **LLMs** can't actually solve this. They produce plausible-looking schedules that quietly violate constraints. Not a candidate.
- **Hand-rolled algorithms** (genetic, simulated annealing) lose to CP-SAT on every problem under 100k variables and are a maintenance burden.

### 3.2 Hosting

Options considered:

| Option                              | Pros                                         | Cons                                          | Verdict                |
| ----------------------------------- | -------------------------------------------- | --------------------------------------------- | ---------------------- |
| Supabase Edge Function (Deno)       | Same platform; cheap                         | No Python; ortools doesn't have a Deno port   | ✗                      |
| **Supabase Edge Function (Python)** | New as of 2024; Python supported via py-edge | First-class ortools; same auth surface; cheap | **✓**                  |
| Vercel Edge Function                | Same auth surface                            | No Python yet                                 | ✗                      |
| Separate Cloud Run service          | Full flexibility                             | Another deploy target, another auth layer     | ✗ if Supabase py works |
| Browser-side (WASM ortools)         | Zero infra                                   | WASM ortools is experimental, large, slow     | ✗                      |

**Decision:** Supabase Edge Function in Python with `ortools`, called from a new server action that wraps the current `generate_implementation_schedule` RPC.

### 3.3 Model formulation (sketch)

```python
# Pseudocode
model = cp_model.CpModel()

# Time discretization: 15-minute slots over the implementation window
slots = list_of_15min_slots(window_start, window_end, exclude_holidays, ...)

# Decision variables
# x[c, s, r, t, slot] = 1 if session s of class c is assigned to room r,
# trainer t, starting at `slot`. (For multi-trainer classes, expand to
# x[c, s, r, T, slot] where T is a tuple of trainer ids.)
x = {}
for c in classes:
  for s in range(sessions_needed[c]):
    for r in eligible_rooms[c]:
      for t in eligible_trainers[c]:
        for slot in slots_that_fit[c, r]:
          x[c, s, r, t, slot] = model.NewBoolVar(...)

# Constraint: each session is placed exactly once
for c, s in all_sessions:
  model.AddExactlyOne(x[c, s, r, t, slot] for r, t, slot in placements)

# Constraint: room cannot host two sessions simultaneously
for r in rooms:
  for slot in slots:
    overlapping = [x[c, s, r, t, slot2] for c, s, t, slot2 in placements
                   if r and intervals_overlap(slot, slot2, c.hours_per_session)]
    model.Add(sum(overlapping) <= 1)

# Trainer overlap, daily hours, weekly hours, prereqs, holidays, PTO,
# room equipment, lunch span, setup/teardown, prereq gap, cohort overlap,
# trainer min rest, etc. — each is a similar constraint expression.

# Objective: minimize latest completion time, then prefer earlier mornings
model.Minimize(latest_end_time - alpha * total_morning_starts)

solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = 30.0
status = solver.Solve(model)
```

A real medium-sized impl (50 classes, 200 sessions, 6 rooms, 12 trainers, 8-week window at 15-min granularity) is ~50k–200k boolean variables. CP-SAT solves this in seconds with a 30-second wall-clock budget.

### 3.4 Wiring

- New Edge Function: `supabase/functions/solve-schedule/index.ts` (Python via the new Supabase Python runtime, or via a thin TS wrapper that shells out).
- Server action: `apps/web/src/app/(authenticated)/training-planner/[id]/calculate/solve-action.ts`.
- Feature flag: `IMPL_SOLVER` env var with values `greedy | solver | shadow`. `shadow` runs both and logs deltas without affecting output. Default `greedy` for a release cycle.
- The existing `generate_implementation_schedule` PL/pgSQL RPC stays as the `greedy` path. The solver path writes the same `impl_sessions` rows so the rest of the app (Schedule view, conflict triggers, exports) doesn't change.

### 3.5 Performance budget

- p50 solve time: ≤ 5s for impls under 100 sessions.
- p95 solve time: ≤ 30s for impls under 500 sessions.
- p99: ≤ 60s; if timed out, fall back to greedy and surface a warning.
- Infeasibility detection: ≤ 10s (CP-SAT proves infeasibility fast).

### 3.6 Test surface

- Property-based tests: random impls, both engines should agree on infeasibility verdict.
- Regression suite: 20 hand-curated impls covering known-tricky shapes (tight windows, prereq chains, scarce trainer pools, learner cohort conflicts). Both engines must produce _valid_ schedules; solver must produce _better_ (≤ latest end).
- Performance benchmark: track p50/p95 over time in CI.

**Estimated effort:** 3–4 weeks. The math is well-understood; the engineering is integration. Highest-risk item is the Python runtime in Supabase Edge Functions — if it doesn't work cleanly, fallback is a small Cloud Run service (adds maybe 1 week and one more deploy target).

## Phase 4 — AI augmentation

**Goal:** make the solver's output understandable to humans, and let humans configure the system in natural language.

The solver is correct but inscrutable. "No feasible schedule exists" is not actionable. "PT-3 is the bottleneck — they have 47 hours of mandatory coverage and only 40 hours available; either reduce IV class to 1 session/week or add a second IV-eligible trainer" is actionable.

### 4.1 Conflict explainer

- When the solver returns infeasible, post-process to extract the constraints that conflict. CP-SAT can produce an Irreducible Inconsistent Subsystem (IIS) — the minimal set of constraints that, if any one is dropped, would make the problem feasible.
- Feed the IIS plus the impl context to Claude API. Prompt: "given these conflicting constraints, explain in 2–3 sentences why the schedule is infeasible and propose 3 concrete fixes in priority order."
- Render the AI explanation alongside the IIS itself (so the user can verify).
- Use prompt caching on the impl context (classes, rooms, trainers) — the dynamic part is just the IIS.

### 4.2 Natural-language intake

- New page: `/training-planner/new-from-text` (or a button on the existing list).
- Single textarea: "Describe what you need to train, who teaches, what rooms you have, when it must finish."
- Claude extracts structured fields (classes, trainers, rooms, dates) into the same shape the wizard produces.
- User reviews/edits, then hands off to the normal wizard for fine-tuning.

### 4.3 Plan summary

- After Generate completes, surface a "Send to stakeholders" button.
- Claude composes a markdown / email summary: total sessions, completion date, gaps closed, risks, who's teaching what.
- One-click copy / send via Resend.

### 4.4 Anomaly detection (across impls)

- Background job (weekly): for each org, examine the last N impls. Flag patterns:
  - Trainer chronically over-scheduled (>90% util on 3+ impls)
  - Room consistently under-used (suggests purge or redeploy)
  - Specific classes always running over (suggests `hours_per_session` is wrong)
- Show on the impl list as small badges; link to a detailed view.

**Estimated effort:** 2–3 weeks. 4.1 is the highest-leverage piece; 4.2 is the marketing differentiator. 4.4 is a nice-to-have that gets more valuable as you have more historical data.

## Phase 5 — Positioning & proof

**Goal:** turn the technical capability into a competitive claim that holds up.

### 5.1 Benchmark against competitors

- Build a public reference impl (anonymized real-world shape) and run it through Arbor, Kronos demo, ShiftWizard demo. Capture:
  - Constraints honored (tick-box matrix)
  - Time to first valid schedule
  - Time to optimal schedule
  - Replan time after a disruption
- Publish results on the marketing site as a comparison table.

### 5.2 Case studies

- Once 3 paying customers ship a real impl on Arbor, write up:
  - What constraints mattered to them
  - What the solver caught that the planner missed
  - Time-to-schedule before vs after Arbor

### 5.3 Marketing claims

- Headline-tier: "The only training planner that proves your schedule respects every rule you set."
- Sub-headline: "Built on the same constraint-programming engine Google uses for its own logistics."
- Differentiator vs AI-marketed competitors: "We don't generate plausible schedules. We solve for correct ones."

**Estimated effort:** ongoing, owner-driven.

## Open questions (need user input)

1. **Phase 1 ordering.** Which of 1.1–1.10 hurt most in real use today? Without input I'd default to 1.3 (holidays) + 1.4 (PTO) first since those are the most common questions. Cohorts (Phase 2) is a bigger lift but might be more valuable than half of Phase 1.
2. **Cohort modeling depth (Phase 2).** Do learners need to be linked to org members (real auth users), or are free-text names fine for v1?
3. **Solver hosting fallback (Phase 3).** If Supabase Python edge functions don't pan out, are you OK adding a Cloud Run service (small infra cost, ~$5–20/mo), or do you prefer to keep everything on Supabase even if it means waiting?
4. **Feature flag duration (Phase 3).** How long do greedy and solver run in parallel before cutover — one release cycle (2 weeks), one quarter, or until N impls have been re-run through both?
5. **AI cost budget (Phase 4).** With prompt caching, conflict explanations are ~$0.01/call. Natural-language intake is ~$0.05/call (longer input). At ~100 impls/day across all customers that's about $150/mo. Acceptable, or do you want a usage cap?

## Estimated total timeline

- **Phase 1:** 4–6 weeks
- **Phase 2:** 3–4 weeks
- **Phase 3:** 3–4 weeks
- **Phase 4:** 2–3 weeks
- **Phase 5:** ongoing

**End-to-end:** ~3 months of focused work to ship Phases 1–4. Phase 5 layers on top once Phase 3 is in prod.

You'd see incremental customer value every 1–2 weeks (each Phase 1 item is its own PR), with the big "step change" at Phase 3 when the solver replaces greedy.
