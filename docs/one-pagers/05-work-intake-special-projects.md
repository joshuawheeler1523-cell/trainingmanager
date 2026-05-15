# Work Intake & Special Projects

## What it is

Arbor's work intake is the front door for everything the training department is asked to do that isn't already in the catalog. It captures requests from stakeholders — a unit director who needs a custom class, a quality team that wants a new competency, an executive who wants a system-wide rollout — and turns each one into a tracked, sized, and assignable piece of work.

**Special Projects** is the home for that work once it's accepted: the project workspace where deliverables get scoped, hours get estimated using industry-standard ratios, tasks get assigned, and the time those tasks consume gets reflected in the same allocation model that governs the rest of the department.

It is **the channel that converts ambient demand into a managed pipeline** without imposing approval bureaucracy on a team that doesn't have time for it.

## The problem it solves

Every training department gets stopped in the hallway, copied on the email, and pinged in Teams with requests that don't fit the catalog. The chronic failures:

1. **Verbal requests vanish.** A clinical director asks for "a quick training" on the new policy. Three weeks later nobody remembers who agreed to what, and the director is angry that nothing happened.
2. **Estimation is theater.** When a request *is* logged, someone guesses how many hours it'll take, the guess is wrong, and the team blows the deadline. There's no shared model for what a one-hour ILT class actually costs to build, vs. a 30-minute eLearning module, vs. a video.
3. **Approved-then-orphaned.** The request gets a thumbs-up from the director but never makes it onto anyone's plate, because there's no link between "yes, we'll do this" and "this is now allocated to Jamie for 12 hours."
4. **Special projects compete invisibly with catalog work.** The team takes on the special project, instructors quietly fall behind on regular classes, and nobody can show the trade-off because the systems don't talk.
5. **Workflow gates make it worse.** Many tools answer this with multi-step approval flows, queues, and triage stages. For a department of 8 educators, that's overhead that kills adoption. Arbor deliberately doesn't do that — status is informational, not gatekeeping.

## How it works

- **Education requests (the intake form)** — Stakeholders submit requests via a public form (anyone with the link, including non-Arbor users) or an internal form. Each request captures title, business justification, target audience, urgency, target completion date, and contact info. Requests carry a status (`new` / `under_review` / `approved` / `assigned` / `in_progress` / `completed`) that tracks where the work is — without forcing anyone to click through formal approval gates.
- **Training Request Analysis (TRA) — industry-standard sizing** — For requests significant enough to warrant a real estimate, Arbor uses the ATD (Association for Talent Development) development-to-seat-time ratios as built-in deliverable types. Specify the deliverable (1-hour ILT class, 30-minute eLearning module, 5-minute video, a job aid, a simulation), the seat-time hours, the quantity, and a complexity multiplier — Arbor computes the estimated development hours automatically (e.g., 1 hr of ILT = ~43 hrs to build at standard complexity).
- **Conversion to a Project** — Approved education requests and TRAs convert to a Project: status (`planning` / `active` / `on_hold` / `completed` / `cancelled`), priority (`low` / `medium` / `high` / `critical`), date range, estimated total hours, and a link back to the originating request. Projects own tasks; tasks have milestones, dependencies, and assigned instructors with estimated and actual hours.
- **Allocation integration** — When a project task is assigned, its hours flow into the assigned instructor's workload alongside class teaching, recurring tasks, and ad-hoc work. The work shows up in the allocation dashboard, the 8-week forecast, and the bucket consumption view. There is no separate project-tracking universe.
- **Implementations can link to projects** — If a special project grows into a full rollout (a new system go-live, a wave of training events), it can connect to a Training Planner implementation so the rollout schedule and the project both reference the same originating intake.
- **No mandatory approval gates** — Status fields exist for tracking, but Arbor intentionally does not enforce request → triage → approve → assign workflows. Single-manager departments don't need bureaucracy; the manager just moves work through the states.

## Why it's valuable

- **Nothing falls off the radar.** Verbal asks become tracked requests. The director who asks for "a quick training" gets a request ID and a status, and the manager has a defensible record of what was committed and when.
- **Honest sizing changes the conversation.** When a stakeholder learns that the "quick eLearning" they want is 80 hours of development work, they often refine the scope or settle for an ILT — not because the manager said no, but because the math is on the table.
- **Special projects become visible against catalog work.** The trade-off between taking on a new project and keeping up with regular classes is no longer invisible — it's a bar on the same allocation dashboard.
- **Lightweight by design.** Arbor refuses to bolt on workflow gates that don't fit a small-team reality. Status is communication, not control.
- **Reusable templates.** TRA deliverable types are pre-loaded with industry ratios, so estimation is faster than building from scratch every time.

## Design notes for the webpage

- Hero visual: a split — a clean, public-facing intake form on one side, the project workspace on the other (request title up top, deliverables sized below with their hour estimates, instructors assigned with their hours).
- Secondary visual: the TRA deliverable sizing screen with the ratio multiplier and resulting hours — this is the "aha" moment for a buyer.
- Show the connection: a small diagram that traces *Stakeholder request → TRA sizing → Project → Tasks → Allocation dashboard*.
- Address workflow-fatigue head-on: a callout that explicitly says "no approval queues, no triage stages — status is for visibility, not gates." This is a differentiator against enterprise project tools.
- Key phrase candidates: *"Catch every ask. Skip the bureaucracy."* — *"Industry-ratio estimates, in one click."* — *"Where requests become real plans."*
- Audience: training directors handling demand from clinical units, quality, compliance, and executive stakeholders; consulting agencies whose hospitals need a request channel without a Jira-grade workflow.
