# Instructor Management

## What it is

Arbor's instructor management is the single roster of every person who delivers training in your department — internal employees, floats, per-diem clinical educators, and external vendor trainers — with the metadata, availability, and workload history that turn a list of names into a staffing plan.

It is **the HR-light system of record for the training team**: who they are, what they teach, how much capacity they have, and what they are currently on the hook for, all in one place.

## The problem it solves

Most training departments track their roster across two or three half-broken artifacts: an HR org chart that doesn't know who teaches what, a competency spreadsheet maintained by one senior instructor who is retiring, and a scheduling document that lives in someone's Outlook. The consequences:

1. **Tribal staffing.** Only the manager (or the most-tenured instructor) knows who can cover which class. When that person is out, scheduling stalls or the wrong instructor gets assigned.
2. **Invisible vendor trainers.** External trainers — contractors, vendor reps, agency floats — exist in nobody's HR system, so they're invisible to capacity planning even though they consume real schedule slots and real budget.
3. **No memory.** When a high-performing per-diem leaves and comes back, their history (what they taught, how often, with what outcomes) is gone.
4. **Onboarding penalty.** A new training manager spends their first two months figuring out who is on their team and what each person actually does.

Arbor makes the roster the durable artifact and everything else (capacity, scheduling, assignment) hang off it.

## How it works

- **Full instructor profile** — Name, contact info, department, location, job title, start date, status (`active` / `inactive` / `on_leave`), and FTE basis expressed as annual hours (default 1,880 = 40 hrs × 47 weeks, but configurable per person for part-time, leave, or non-standard schedules).
- **Internal and external instructors** — Internal instructors are linked to a real Arbor login so they can see their own assignments. External instructors (vendor trainers, contractors, agency floats) live in the same roster without an account — they consume schedule slots and count against capacity but don't log in.
- **Class eligibility & roles** — For every class in the catalog, mark each instructor as eligible, primary, or backup. The system knows who *can* teach what, not just who is teaching what right now.
- **Assignment history preserved** — Soft-delete model: removed instructors stay in the database with a deleted-at timestamp so their workload history, class assignment record, and project participation are never lost. Year-over-year comparisons stay honest.
- **8-week rolling capacity forecast** — Per instructor, week-by-week projection of utilization that aggregates every source of assigned work: class offerings annualized into weekly hours, dated project tasks bucketed into their scheduled week, recurring tasks, and ad-hoc work. Surfaces the hot weeks before they happen.
- **Status-aware planning** — Instructors on leave or inactive automatically drop from "available capacity" calculations. The plan adjusts the moment status changes — no manual cleanup.

## Why it's valuable

- **The roster *is* the staffing model.** Every other Arbor surface (class scheduling, project staffing, allocation, training planner) reads from this one table. Update someone's FTE here and every downstream forecast adjusts.
- **Vendor trainers stop being invisible.** External instructors get tracked alongside internal staff with the same fidelity, so capacity planning includes everyone who actually does the work.
- **Manager-handoff insurance.** When the training director changes, the new manager inherits an instantly legible team picture: who, what they teach, what their year looks like, what they're booked on.
- **Skill-aware assignment.** Eligibility marks turn "find someone to cover this class" from a manager-only judgement call into a filtered list anyone on the team can produce.

## Design notes for the webpage

- Hero visual: an instructor profile card — photo placeholder, name, FTE/annual-hours, status badge, top three classes they teach, current utilization meter.
- Secondary visual: a roster grid with utilization heat-strip across the next 8 weeks per row.
- Treatment of "external trainers" deserves its own callout — it's a quiet differentiator most competing tools don't handle cleanly.
- Key phrase candidates: *"Every trainer, internal or external, in one roster."* — *"The team you actually have, not the one HR thinks you have."* — *"Onboarding-day-one visibility."*
- Audience: training managers/directors, and the senior educator who currently runs the schedule from memory.
