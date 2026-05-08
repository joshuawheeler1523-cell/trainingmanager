import type { HelpArticle } from "../index";

export const settingUpAllocations: HelpArticle = {
  slug: "setting-up-allocations",
  title: "Setting up allocations",
  summary:
    "Define buckets (Direct Training, Admin, Curriculum, etc.), set org-wide target percentages, then override per group or instructor as needed.",
  keywords: ["allocation", "bucket", "target", "percent", "global", "per-instructor", "group"],
  render: () => (
    <div className="space-y-3">
      <p>
        Buckets are the categories your team&apos;s time falls into. The platform compares target %
        vs actual hours for each one so you can see whether you&apos;re investing time the way you
        said you would.
      </p>
      <p className="font-medium">Recommended setup order:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          <strong>Buckets tab</strong> — create the categories your org cares about. Most start with
          4–6 (Direct Training, Curriculum Development, Admin, Special Projects).
        </li>
        <li>
          <strong>Global tab</strong> — set the org-wide target percentages. They should sum to 100%
          (the editor warns when they don&apos;t).
        </li>
        <li>
          <strong>Groups tab</strong> — if a group has a different target mix (Onboarding team = 80%
          Direct Training), override here.
        </li>
        <li>
          <strong>Individuals tab</strong> — override single instructors only when truly needed.
        </li>
      </ol>
      <p>
        Recurring + ad-hoc tasks pull from buckets too — flagging them with a bucket means the
        Workload + Allocation reports show <em>where</em> the hours are going.
      </p>
    </div>
  ),
};
