# Allocation & Capacity Management

## What it is

Arbor's allocation engine is the system of record for how every training-department instructor spends their year. Instead of guessing whether the team is over-committed, leaders set target percentages for categories of work ("Instruction," "Course Development," "Administrative," "Special Projects") and Arbor continuously rolls every assigned hour into those buckets and reports the variance.

It is **annual-hours accounting for human capacity**, modeled the same way finance teams budget dollars: define the buckets, set the targets, then let every operational decision (class taught, project assigned, recurring task added) automatically debit the right bucket.

## The problem it solves

Hospital training departments live with three chronic failures that allocation management eliminates:

1. **"Yes" by default.** A new request comes in — a unit director needs a one-off class, an executive wants a special project, an EMR cutover demands trainer support. The manager has no real-time view of who has room, so they say yes, distribute the work by gut feel, and discover six weeks later that two instructors are at 140% and three are at 45%.
2. **No language for trade-offs.** When the team is at capacity, "we can't do it" is a non-answer. Allocation gives the manager a structured trade: "We can do the EMR project, but instruction drops from 65% to 50% — which classes get cut?" Leadership can make an informed call instead of a political one.
3. **Annual planning is fiction.** Departments build annual training plans in spreadsheets that never reconcile with reality. Arbor's allocation model is the same model used for planning *and* execution, so the plan stays live all year.

## How it works

- **Custom allocation buckets** — Each org defines its own work categories with color coding. Common examples: Instruction (45%), Course Development (20%), Administrative (15%), Special Projects (15%), Education/PD (5%). Buckets and targets are fully editable per org.
- **Three-tier targets with automatic precedence** — Global defaults apply to everyone. Group-level overrides apply to a department or sub-team (e.g., simulation educators get 70% Instruction). Individual overrides apply to one named instructor (e.g., the new hire is 80% Course Development for year one). The system resolves which target wins for each person automatically.
- **Single source-of-truth workload view** — Every hour an instructor is assigned — recurring class offerings, ad-hoc tasks, project work, education request fulfillment, special projects — flows into one unified workload view. There is no second spreadsheet to reconcile.
- **Utilization status at a glance** — Each instructor carries a live status: `under_utilized`, `balanced`, `at_risk`, or `over_allocated`. The dashboard surfaces who has room and who is past 100% the instant assignments change.
- **Bucket consumption warnings** — When instruction-bucket work consumed across the team exceeds the instruction-bucket target, the system flags it. Managers see the misalignment between intent (the plan) and reality (the assignments) without doing the math.
- **Recurring & ad-hoc tasks** — Non-class work (committee meetings, charting time, mandatory training, vendor management) is logged as recurring tasks with frequency and a share-split across assignees, or as one-off ad-hoc tasks. These count against allocation the same way class hours do.

## Why it's valuable

- **Defensible capacity decisions.** When leadership asks "why can't we take on this project," the manager opens a screen instead of a defense.
- **Bucket-level governance.** Education leaders set strategy in terms of how time is spent (more development, less reactive instruction), and the system enforces it.
- **Onboarding-grade visibility.** A new manager inheriting the department can see exactly where the team's time is going on day one — no tribal knowledge required.
- **Replaces three to five spreadsheets.** Annual planning workbook, weekly capacity tracker, project staffing sheet, scheduling cross-check, leadership status report — all collapse into one live model.

## Design notes for the webpage

- Hero visual: a dashboard mockup showing 6–8 instructors with utilization bars (green/yellow/red), bucket distribution stacked alongside, and a "this week" delta.
- Secondary visual: a bucket donut chart showing target vs. consumed (e.g., Instruction target 45% / consumed 58% in red).
- Key phrase candidates: *"Capacity, not calendar."* — *"Budget your hours the way you budget your dollars."* — *"Know who has room before you say yes."*
- Audience: training department directors and managers at hospitals, 5–40 instructor teams.
