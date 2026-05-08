import type { HelpArticle } from "../index";

export const addingInstructors: HelpArticle = {
  slug: "adding-instructors",
  title: "Adding instructors",
  summary:
    "Create instructor profiles, set FTE / annual hours, and tag with department + location.",
  keywords: ["instructor", "trainer", "fte", "annual hours", "department", "roster"],
  render: () => (
    <div className="space-y-3">
      <p>
        Instructors are the people who deliver training — anyone whose hours you want to track in
        Arbor. They don&apos;t have to be platform users themselves; you can add an instructor
        without inviting them.
      </p>
      <p className="font-medium">To add an instructor:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Open the <strong>Instructors</strong> page from the sidebar.
        </li>
        <li>
          Click <strong>+ Add Instructor</strong>.
        </li>
        <li>
          Fill in name + email + <strong>annual hours</strong> (the budget the workload engine
          measures against — defaults to 2,080 for 1.0 FTE).
        </li>
        <li>Optional: department, location, job title, status.</li>
      </ol>
      <p className="font-medium">After they exist, the most useful next steps:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Skills tab</strong> — record which skills they have at what level, plus
          certification expiry dates.
        </li>
        <li>
          <strong>Allocations</strong> — if their target time split differs from the org default,
          override on the individual page.
        </li>
        <li>
          <strong>Class assignments</strong> — drag them onto the classes they should teach in
          /classes.
        </li>
      </ul>
      <p className="text-muted-foreground text-xs">
        See the Workload page once skills + assignments exist — utilization should reflect the new
        instructor immediately.
      </p>
    </div>
  ),
};
