import type { HelpArticle } from "../index";

export const creatingFirstTra: HelpArticle = {
  slug: "creating-your-first-tra",
  title: "Creating your first TRA",
  summary:
    "A Training Request Assessment is a 4-step wizard that captures scope, deliverables, hours, and stakeholder approval — converts to a project on accept.",
  keywords: ["tra", "assessment", "estimate", "stakeholder", "approval", "wizard"],
  render: () => (
    <div className="space-y-3">
      <p>
        A TRA (Training Request Assessment) is the structured way to estimate a chunk of work before
        committing resources to it. The wizard collects everything an approver needs to say yes (or
        push back) in one place.
      </p>
      <p className="font-medium">The four steps:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          <strong>Project info</strong> — name, requesting department, stakeholder, urgency, target
          dates.
        </li>
        <li>
          <strong>Deliverables</strong> — pick from the catalog of deliverable types (eLearning
          module, classroom session, job aid, etc.) and dial complexity. Hours auto-calculate.
        </li>
        <li>
          <strong>Adjustments</strong> — narrative on what makes this engagement different; adjust
          the totals if the auto-calc doesn&apos;t fit.
        </li>
        <li>
          <strong>Review &amp; submit</strong> — the read-only summary your stakeholder sees. Submit
          for approval; on approval the TRA can convert to a Special Project.
        </li>
      </ol>
      <p>
        TRAs render as PDF for distribution. The <em>AI Assistant</em> panel (Module 8.4, opt-in)
        suggests deliverables + complexity from a free-text description when enabled.
      </p>
    </div>
  ),
};
