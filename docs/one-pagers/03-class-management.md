# Class Management

## What it is

Arbor's class management is the durable catalog of every training course your department offers, with the structural detail (hours, days, offerings per year, prep time, logistics overhead) and the **competency roadmap** (what gets taught, in what modality, for how many minutes) needed to staff it, schedule it, and prove what's in it.

It is **the curriculum-meets-capacity layer**: a class isn't just a calendar entry, it's a defined commodity with a known cost in instructor hours and a documented learning design.

## The problem it solves

Training catalogs in hospitals tend to rot in predictable ways:

1. **The "what's in this class?" question has no good answer.** A class called "Orientation Day Two" has been delivered 200 times, but the actual curriculum lives in the head of whoever taught it last week. When that person leaves, the course quietly drifts.
2. **Hours are guessed, not budgeted.** A four-hour class isn't really a four-hour class — it's four hours of teaching plus two hours of prep plus an hour of room setup plus a debrief. Departments routinely under-count and end up explaining why instructors are over capacity.
3. **Offerings per year are aspirational.** "We offer this monthly" gets written once and never reconciled with how many times it actually ran, who taught each offering, and whether anyone is signed up to teach the next one.
4. **Curriculum design is divorced from scheduling.** The instructional designers maintain a separate document about what's *taught* in the class; the schedule has no idea. The two artifacts contradict each other and nobody notices.

Arbor folds curriculum, hours, and scheduling into one canonical record.

## How it works

- **Structured class definition** — Each class carries: name, single-day or multi-day flag, hours per day (uniform or custom day-by-day for asymmetric classes), offerings per year, prep hours per offering, and logistics hours per offering. The system computes total annual instructor hours per class from these numbers — no manual math.
- **Linked to an allocation bucket** — Every class maps to one bucket (typically Instruction, but specialty courses can map to Education, Onboarding, etc.). When an instructor is assigned to teach offerings of the class, those hours roll into that bucket automatically.
- **Instructor assignment with offering counts** — Per class, mark instructors as eligible, primary, or backup, and assign each one a specific count of offerings (0 through the annual offering total). The system prevents over-booking the class beyond its own offerings-per-year cap.
- **Competency roadmap** — An ordered, structured outline of what the class teaches: each step has a competency name, a modality (`ILT`, `vILT`, `eLearning`, `video`, `reading`, `simulation`, `OJT`, `assessment`, `blended`), and a duration in minutes. Curriculum lives next to the hours it claims to fill.
- **Roadmap-vs-hours sanity check** — If the sum of roadmap step durations doesn't match the class's hours-per-day, the UI surfaces a warning. It's a nudge, not a blocker — but it catches drift between "what we say the class is" and "what the class actually contains."
- **Modality awareness** — Because every roadmap step is tagged with delivery modality, leadership can answer questions like "what percentage of our curriculum is ILT vs. self-paced?" without a manual audit.

## Why it's valuable

- **Hours-honest scheduling.** When prep and logistics are first-class inputs, the capacity model finally reflects what teaching actually costs.
- **Curriculum is durable.** The roadmap survives staffing turnover — the next instructor inherits a written outline, not a verbal handoff.
- **Audit-ready.** When a regulator, accreditation body, or executive asks "what is taught in this course, in what format, for how long?" the answer is one click, not one week.
- **Drives every downstream surface.** The class catalog feeds allocation, instructor workload, the training planner, and reporting. Define a class once; every other surface uses it.

## Design notes for the webpage

- Hero visual: a class detail screen showing structural fields on the left (4 hrs/day × 2 days × 8 offerings/year + 2 prep + 1 logistics = 56 hrs/year) and a vertical roadmap timeline on the right with modality-colored steps.
- Secondary visual: the roadmap-vs-hours warning banner — a soft callout, not a red error — illustrating Arbor's "guide, don't gate" philosophy.
- Show modalities as colored pills or icons so the design communicates that delivery format is a structured concept.
- Key phrase candidates: *"Curriculum and capacity in the same record."* — *"Your catalog, hours-honest."* — *"Define a class once. Everything else uses it."*
- Audience: training managers, instructional designers, and any department that has tried to maintain a curriculum binder.
