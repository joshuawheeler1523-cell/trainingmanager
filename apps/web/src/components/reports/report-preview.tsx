"use client";

import type { ReportDataset } from "@arbor/shared";
import AllocationView from "./allocation-view";
import WorkloadView from "./workload-view";
import CoverageView from "./coverage-view";
import ProjectStatusView from "./project-status-view";
import SkillGapView from "./skill-gap-view";
import DepartmentComparisonView from "./department-comparison-view";
import InstructorScorecardView from "./instructor-scorecard-view";

// Single dispatch component — renders the right per-slug view based on the
// dataset's discriminator. Both the live filter pane preview and the saved-
// report opener call this.

export default function ReportPreview({ dataset }: { dataset: ReportDataset }) {
  switch (dataset.slug) {
    case "allocation":
      return <AllocationView data={dataset.data} />;
    case "workload":
      return <WorkloadView data={dataset.data} />;
    case "coverage":
      return <CoverageView data={dataset.data} />;
    case "project-status":
      return <ProjectStatusView data={dataset.data} />;
    case "skill-gap":
      return <SkillGapView data={dataset.data} />;
    case "department-comparison":
      return <DepartmentComparisonView data={dataset.data} />;
    case "instructor-scorecard":
      return <InstructorScorecardView data={dataset.data} />;
  }
}
