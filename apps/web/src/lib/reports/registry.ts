// Server-side dispatcher: takes a slug + raw filters, returns the
// validated dataset. Both /reports/[slug] preview and the export endpoint
// call this — the report runs once per request, then preview-render and
// export-render share the result.

import {
  allocationReportFilters,
  coverageReportFilters,
  departmentComparisonReportFilters,
  projectStatusReportFilters,
  skillGapReportFilters,
  workloadReportFilters,
  type ReportDataset,
  type ReportSlug,
} from "@arbor/shared";
import { queryAllocationReport } from "./allocation";
import { queryWorkloadReport } from "./workload";
import { queryCoverageReport } from "./coverage";
import { queryProjectStatusReport } from "./project-status";
import { querySkillGapReport } from "./skill-gap";
import { queryDepartmentComparisonReport } from "./department-comparison";
import type { TypedSupabase } from "./types";

export async function runReport(
  slug: ReportSlug,
  supabase: TypedSupabase,
  orgId: string,
  rawFilters: unknown,
): Promise<ReportDataset> {
  // Each branch parses against the slug's own schema. The TS union of all
  // schemas is too wide for a single safeParse() above to narrow, so we
  // dispatch first, parse second.
  switch (slug) {
    case "allocation": {
      const parsed = allocationReportFilters.safeParse(rawFilters ?? {});
      if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Invalid filters");
      const data = await queryAllocationReport(supabase, orgId, parsed.data);
      return { slug, data };
    }
    case "workload": {
      const parsed = workloadReportFilters.safeParse(rawFilters ?? {});
      if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Invalid filters");
      const data = await queryWorkloadReport(supabase, orgId, parsed.data);
      return { slug, data };
    }
    case "coverage": {
      const parsed = coverageReportFilters.safeParse(rawFilters ?? {});
      if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Invalid filters");
      const data = await queryCoverageReport(supabase, orgId, parsed.data);
      return { slug, data };
    }
    case "project-status": {
      const parsed = projectStatusReportFilters.safeParse(rawFilters ?? {});
      if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Invalid filters");
      const data = await queryProjectStatusReport(supabase, orgId, parsed.data);
      return { slug, data };
    }
    case "skill-gap": {
      const parsed = skillGapReportFilters.safeParse(rawFilters ?? {});
      if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Invalid filters");
      const data = await querySkillGapReport(supabase, orgId, parsed.data);
      return { slug, data };
    }
    case "department-comparison": {
      const parsed = departmentComparisonReportFilters.safeParse(rawFilters ?? {});
      if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Invalid filters");
      const data = await queryDepartmentComparisonReport(supabase, orgId);
      return { slug, data };
    }
  }
}
