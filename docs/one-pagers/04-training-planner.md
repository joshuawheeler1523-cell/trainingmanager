# Training Planner

## What it is

Arbor's Training Planner is a purpose-built tool for designing and scheduling **large training rollouts** — the kind of project where you need to put hundreds or thousands of staff through a sequence of classes in a fixed window, with limited rooms, limited trainers, and a hard go-live date.

Think: an Epic or Cerner EMR cutover. A new infusion pump rollout. A facility-wide BLS recertification. A merger that requires onboarding 400 nurses to a new policy set in 60 days.

It is **the only screen where Arbor stops being a steady-state capacity tool and becomes a project scheduler** — with a constraint-aware engine that places sessions on the calendar respecting prerequisites, trainer availability, and room capacity.

## The problem it solves

Large training rollouts are where most departments either burn out a senior planner for three months or just give up and brute-force it with spreadsheets and prayers:

1. **The scheduling problem is genuinely hard.** Class B requires Class A first. Room 3 holds 20 seats and is unavailable Tuesday afternoons. Trainer Jamie is only available 12 hours a week and can't teach Class C. Multiply this by 40 classes, 12 trainers, 6 rooms, and a 10-week window, and a human planner can't hold it in their head.
2. **One-time rollouts contaminate the steady-state plan.** When the EMR cutover work gets jammed into the same calendar/spreadsheet as the regular catalog, normal scheduling decisions become impossible. Departments end up with a "this quarter is just chaos" mentality.
3. **External trainers are required but invisible.** Big rollouts almost always require borrowed or vendor trainers. The rollout plan needs to model them with the same fidelity as internal staff.
4. **Replication is manual.** When the same kind of rollout happens again (Wave 2 of the EMR cutover, the next facility in a multi-site rollout, the annual recert wave), the previous plan gets copy-pasted from memory.

The Training Planner gives the rollout its own isolated workspace with a real solver behind it.

## How it works

- **7-step wizard creates an Implementation** — A named project workspace (e.g., "EMR Wave 2 — North Tower") with its own window (start/end dates), go-live date, and status (`draft` → `active` → `completed`). Steady-state catalog, instructors, and allocation are untouched.
- **Scoped rooms** — Add rooms specifically for this rollout: seat capacity, available hours per day, available days per week, and equipment notes. Rooms shared with the catalog can be reused; rollout-only rooms (a borrowed conference center, a sim lab booked from a partner) live only inside the implementation.
- **Scoped trainers (internal + external)** — Pull internal instructors into the rollout with a weekly-hours budget that may be lower than their normal availability (because catalog work still has to run). Add external trainers — vendor reps, contracted consultants, agency floats — with their own availability. Cross-org trainer pools are supported for multi-facility rollouts.
- **Modules, classes, and prerequisites** — Group classes into modules for organization. Define prerequisite dependencies (Class B can't be scheduled before Class A for the same cohort).
- **Auto-generated session schedule** — A greedy topological scheduler places every session respecting: (1) prerequisites scheduled before dependents, (2) each trainer's weekly hours cap, (3) room availability and seat capacity, (4) no trainer or room double-bookings. Sessions that cannot be placed are surfaced as "full conflict" rather than silently dropped.
- **Conflict detection on hand-edits** — Drag a session to a new time, swap a trainer, change a room — the system re-validates immediately and flags any new conflict (trainer double-booked, room over capacity, prerequisite violated).
- **Duplicate an implementation** — Clone a completed rollout to spawn the next one. Rooms, trainers, modules, classes, prerequisites copied; sessions cleared so the new window can be solved fresh.

## Why it's valuable

- **Cuts rollout planning from weeks to hours.** The senior planner stops being the bottleneck; the solver handles the combinatorics and the planner reviews/adjusts.
- **Isolates rollout work from steady-state.** The catalog, the regular schedule, and ongoing allocation don't get corrupted by the project. Reporting stays clean.
- **Models the people who actually do the work.** External trainers are not an afterthought — they're a first-class concept, which matches how every real-world rollout is staffed.
- **Replays cleanly.** When the same rollout pattern recurs (subsequent waves, additional facilities, annual recert cycles), the prior plan becomes a template instead of starting from scratch.
- **Removes the "trust me" from rollout commitments.** When leadership asks if the go-live date is achievable with the trainers and rooms available, the answer is a generated schedule with named conflicts, not a manager's gut feel.

## Design notes for the webpage

- Hero visual: a Gantt-style or weekly grid showing sessions placed across a 10-week window, with trainer initials and room codes — and one or two red "conflict" markers visible to imply that the system catches them.
- Secondary visual: the 7-step wizard breadcrumb, communicating the "set it up, generate, refine" flow.
- Worth dedicating space to: the prerequisite graph (a small DAG visualization), the trainer-budget bar (Jamie 12/12 hrs used → red), and the duplicate-implementation gesture.
- Key phrase candidates: *"Big rollouts, solved."* — *"Schedule an EMR cutover before lunch."* — *"From wishful date to defensible plan."*
- Audience: training directors at hospitals undergoing EMR transitions, mergers, accreditation cycles, or facility expansions; and the consulting agencies that resell Arbor specifically for cutover engagements.
