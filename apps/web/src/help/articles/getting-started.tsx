import type { HelpArticle } from "../index";

export const gettingStarted: HelpArticle = {
  slug: "getting-started",
  title: "Getting started",
  summary: "A 5-minute orientation: what Arbor is, where to start, and the order most teams take.",
  keywords: ["intro", "onboarding", "tour", "overview"],
  render: () => (
    <div className="space-y-3">
      <p>
        Arbor is a training capacity platform. The same view of who&apos;s available, who&apos;s
        skilled, and what work is queued powers every operational and reporting screen.
      </p>
      <p className="font-medium">Most teams onboard in this order:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          <strong>Add your instructors</strong> — names, FTE, departments. (Module 4.2)
        </li>
        <li>
          <strong>Define your skills + classes</strong> — and tie skills to the classes that require
          them. (Modules 5–6)
        </li>
        <li>
          <strong>Set up allocations</strong> — buckets and per-instructor splits. (Module 7)
        </li>
        <li>
          <strong>Pull up the Workload page</strong> — confirm everyone&apos;s utilization looks
          right.
        </li>
        <li>
          <strong>Open up requests</strong> — generate a public intake link or start logging
          internal requests. (Module 9)
        </li>
      </ol>
      <p>
        Larger rollouts (EMR, Epic, etc.) live in the <strong>Training Planner</strong>. Special
        Projects holds custom non-rollout work (initiatives, cross-team programs).
      </p>
      <p className="text-muted-foreground text-xs">
        Press <kbd className="bg-surface rounded border px-1 py-0.5">?</kbd> from anywhere to
        re-open this help drawer.
      </p>
    </div>
  ),
};
