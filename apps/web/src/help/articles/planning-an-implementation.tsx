import type { HelpArticle } from "../index";

export const planningImplementation: HelpArticle = {
  slug: "planning-an-implementation",
  title: "Planning an implementation",
  summary:
    "Use the Training Planner for large rollouts (e.g. EMR cutover): define rooms, trainers, modules, classes, then auto-generate a conflict-aware schedule.",
  keywords: [
    "implementation",
    "training planner",
    "rollout",
    "schedule",
    "rooms",
    "trainers",
    "module",
    "session",
    "conflict",
  ],
  render: () => (
    <div className="space-y-3">
      <p>
        The Training Planner is built for rollouts where dozens-to-hundreds of people need training
        inside a fixed window with constrained rooms and trainers. Each rollout is one
        &ldquo;implementation&rdquo;.
      </p>
      <p className="font-medium">The 7-step wizard:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          <strong>Setup</strong> — name, window dates, go-live date, optional links to a Project /
          Work Intake.
        </li>
        <li>
          <strong>Rooms</strong> — capacity, hours/day, days available, equipment notes.
        </li>
        <li>
          <strong>Trainers</strong> — pick from your roster or add external. Set hours dedicated to
          this implementation (not their total weekly hours).
        </li>
        <li>
          <strong>Modules</strong> — group classes into a unit of curriculum.
        </li>
        <li>
          <strong>Classes</strong> — hours/session, expected per session, total people.
          Sessions-needed auto-calculates.
        </li>
        <li>
          <strong>Calculate</strong> — runs the greedy scheduler. Surfaces capacity gaps when
          trainer/room hours don&apos;t cover the work.
        </li>
        <li>
          <strong>Schedule</strong> — drag bars to reschedule. Conflicts re-flag live. Publish to
          roll the sessions into trainer workload.
        </li>
      </ol>
      <p className="text-muted-foreground text-xs">
        Conflict colors: <span className="text-emerald-600">green</span> = clear,{" "}
        <span className="text-amber-600">amber</span> = one resource busy,{" "}
        <span className="text-rose-600">red</span> = both busy or prereq unmet.
      </p>
    </div>
  ),
};
