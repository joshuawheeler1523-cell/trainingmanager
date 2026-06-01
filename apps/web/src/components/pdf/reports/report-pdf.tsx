import { Document, Page, Text, View } from "@react-pdf/renderer";
import type {
  AllocationDataset,
  CoverageDataset,
  DepartmentComparisonDataset,
  ProjectStatusDataset,
  ReportDataset,
  SkillGapDataset,
  WorkloadDataset,
} from "@arbor/shared";
import { ReportHeader, periodSubtitle, reportStyles as s } from "./base";

// Single PDF entry point that switches on the dataset's slug. Each branch
// renders a small Document — kept compact since we want all five reports
// to share the same look-and-feel without 5 separate stylesheets.

export function ReportPdf({
  dataset,
  orgName,
  reportName,
}: {
  dataset: ReportDataset;
  orgName: string;
  reportName: string;
}) {
  switch (dataset.slug) {
    case "allocation":
      return <AllocationDoc data={dataset.data} orgName={orgName} reportName={reportName} />;
    case "workload":
      return <WorkloadDoc data={dataset.data} orgName={orgName} reportName={reportName} />;
    case "coverage":
      return <CoverageDoc data={dataset.data} orgName={orgName} reportName={reportName} />;
    case "project-status":
      return <ProjectStatusDoc data={dataset.data} orgName={orgName} reportName={reportName} />;
    case "skill-gap":
      return <SkillGapDoc data={dataset.data} orgName={orgName} reportName={reportName} />;
    case "department-comparison":
      return (
        <DepartmentComparisonDoc data={dataset.data} orgName={orgName} reportName={reportName} />
      );
  }
}

// ── Allocation ─────────────────────────────────────────────────────────────

function AllocationDoc({
  data,
  orgName,
  reportName,
}: {
  data: AllocationDataset;
  orgName: string;
  reportName: string;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <ReportHeader
          title={reportName}
          subtitle={periodSubtitle({ orgName, start: data.period.start, end: data.period.end })}
        />
        <Text style={s.sectionTitle}>Buckets</Text>
        <View style={s.table}>
          <View style={[s.row, s.rowHeader]}>
            <Text style={[s.cell, { width: "25%" }]}>Bucket</Text>
            <Text style={[s.cell, { width: "12%" }]}>Target %</Text>
            <Text style={[s.cell, { width: "12%" }]}>Actual %</Text>
            <Text style={[s.cell, { width: "12%" }]}>Variance</Text>
            <Text style={[s.cell, { width: "12%" }]}>Hours</Text>
            <Text style={[s.cellLast, { width: "27%" }]}>Top consumers</Text>
          </View>
          {data.buckets.map((b) => (
            <View style={s.row} key={b.bucket_id ?? "_none"}>
              <Text style={[s.cell, { width: "25%" }]}>{b.bucket_name}</Text>
              <Text style={[s.cell, { width: "12%" }]}>{round(b.target_percent).toString()}%</Text>
              <Text style={[s.cell, { width: "12%" }]}>{round(b.actual_percent).toString()}%</Text>
              <Text style={[s.cell, { width: "12%" }]}>
                {b.variance_percent >= 0 ? "+" : ""}
                {round(b.variance_percent).toString()}%
              </Text>
              <Text style={[s.cell, { width: "12%" }]}>{round(b.actual_hours).toString()}h</Text>
              <Text style={[s.cellLast, { width: "27%" }]}>
                {b.top_consumers
                  .map((c) => `${c.instructor_name} (${round(c.hours).toString()}h)`)
                  .join(", ") || "—"}
              </Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Utilization distribution</Text>
        <View style={s.table}>
          <View style={[s.row, s.rowHeader]}>
            <Text style={[s.cell, { width: "70%" }]}>Band</Text>
            <Text style={[s.cellLast, { width: "30%" }]}>Count</Text>
          </View>
          {data.utilization_histogram.map((h) => (
            <View style={s.row} key={h.band}>
              <Text style={[s.cell, { width: "70%" }]}>{h.band.replace(/_/g, " ")}</Text>
              <Text style={[s.cellLast, { width: "30%" }]}>{h.count.toString()}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Summary</Text>
        <Text style={s.meta}>
          Total assigned: {round(data.total_hours).toString()}h · High-priority share:{" "}
          {round(data.high_priority_percent).toString()}% · Unallocated:{" "}
          {round(data.unallocated_hours).toString()}h
        </Text>
      </Page>
    </Document>
  );
}

// ── Workload ───────────────────────────────────────────────────────────────

function WorkloadDoc({
  data,
  orgName,
  reportName,
}: {
  data: WorkloadDataset;
  orgName: string;
  reportName: string;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <ReportHeader title={reportName} subtitle={orgName} />
        <View style={s.table}>
          <View style={[s.row, s.rowHeader]}>
            <Text style={[s.cell, { width: "20%" }]}>Instructor</Text>
            <Text style={[s.cell, { width: "10%" }]}>Available</Text>
            <Text style={[s.cell, { width: "10%" }]}>Assigned</Text>
            <Text style={[s.cell, { width: "10%" }]}>Util %</Text>
            <Text style={[s.cell, { width: "10%" }]}>Classes</Text>
            <Text style={[s.cell, { width: "10%" }]}>Recurring</Text>
            <Text style={[s.cell, { width: "10%" }]}>Ad-hoc</Text>
            <Text style={[s.cell, { width: "10%" }]}>Requests</Text>
            <Text style={[s.cellLast, { width: "10%" }]}>Project</Text>
          </View>
          {data.rows.map((r) => (
            <View style={s.row} key={r.instructor_id}>
              <Text style={[s.cell, { width: "20%" }]}>{r.full_name}</Text>
              <Text style={[s.cell, { width: "10%" }]}>{round(r.annual_hours).toString()}h</Text>
              <Text style={[s.cell, { width: "10%" }]}>{round(r.assigned_hours).toString()}h</Text>
              <Text style={[s.cell, { width: "10%" }]}>
                {r.utilization_pct == null ? "—" : `${round(r.utilization_pct).toString()}%`}
              </Text>
              <Text style={[s.cell, { width: "10%" }]}>{round(r.sources.class).toString()}</Text>
              <Text style={[s.cell, { width: "10%" }]}>
                {round(r.sources.recurring_task).toString()}
              </Text>
              <Text style={[s.cell, { width: "10%" }]}>
                {round(r.sources.ad_hoc_task).toString()}
              </Text>
              <Text style={[s.cell, { width: "10%" }]}>
                {round(r.sources.education_request).toString()}
              </Text>
              <Text style={[s.cellLast, { width: "10%" }]}>
                {round(r.sources.project_task).toString()}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

// ── Coverage ───────────────────────────────────────────────────────────────

function CoverageDoc({
  data,
  orgName,
  reportName,
}: {
  data: CoverageDataset;
  orgName: string;
  reportName: string;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <ReportHeader title={reportName} subtitle={orgName} />
        <View style={s.table}>
          <View style={[s.row, s.rowHeader]}>
            <Text style={[s.cell, { width: "30%" }]}>Class</Text>
            <Text style={[s.cell, { width: "15%" }]}>Bucket</Text>
            <Text style={[s.cell, { width: "10%" }]}>Target</Text>
            <Text style={[s.cell, { width: "10%" }]}>Assigned</Text>
            <Text style={[s.cell, { width: "10%" }]}>Coverage %</Text>
            <Text style={[s.cell, { width: "10%" }]}>Qualified</Text>
            <Text style={[s.cellLast, { width: "15%" }]}>Flags</Text>
          </View>
          {data.rows.map((r) => (
            <View style={s.row} key={r.class_id}>
              <Text style={[s.cell, { width: "30%" }]}>{r.class_name}</Text>
              <Text style={[s.cell, { width: "15%" }]}>{r.bucket_name ?? "—"}</Text>
              <Text style={[s.cell, { width: "10%" }]}>{r.target_offerings.toString()}</Text>
              <Text style={[s.cell, { width: "10%" }]}>{r.assigned_offerings.toString()}</Text>
              <Text style={[s.cell, { width: "10%" }]}>{r.coverage_percent.toString()}%</Text>
              <Text style={[s.cell, { width: "10%" }]}>
                {r.qualified_instructor_count.toString()}
              </Text>
              <Text style={[s.cellLast, { width: "15%" }]}>
                {[r.has_no_assignee ? "no assignee" : "", r.has_skill_gap ? "skill gap" : ""]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

// ── Project Status ─────────────────────────────────────────────────────────

function ProjectStatusDoc({
  data,
  orgName,
  reportName,
}: {
  data: ProjectStatusDataset;
  orgName: string;
  reportName: string;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <ReportHeader title={reportName} subtitle={orgName} />
        <View style={s.table}>
          <View style={[s.row, s.rowHeader]}>
            <Text style={[s.cell, { width: "25%" }]}>Project</Text>
            <Text style={[s.cell, { width: "10%" }]}>Status</Text>
            <Text style={[s.cell, { width: "10%" }]}>Priority</Text>
            <Text style={[s.cell, { width: "20%" }]}>Dates</Text>
            <Text style={[s.cell, { width: "10%" }]}>% complete</Text>
            <Text style={[s.cell, { width: "8%" }]}>Tasks</Text>
            <Text style={[s.cell, { width: "8%" }]}>Overdue</Text>
            <Text style={[s.cellLast, { width: "9%" }]}>Milestones</Text>
          </View>
          {data.rows.map((r) => (
            <View style={s.row} key={r.project_id}>
              <Text style={[s.cell, { width: "25%" }]}>{r.name}</Text>
              <Text style={[s.cell, { width: "10%" }]}>{r.status}</Text>
              <Text style={[s.cell, { width: "10%" }]}>{r.priority}</Text>
              <Text style={[s.cell, { width: "20%" }]}>
                {r.start_date && r.end_date
                  ? `${r.start_date} → ${r.end_date}`
                  : (r.start_date ?? r.end_date ?? "—")}
              </Text>
              <Text style={[s.cell, { width: "10%" }]}>
                {r.percent_complete == null ? "—" : `${r.percent_complete.toString()}%`}
              </Text>
              <Text style={[s.cell, { width: "8%" }]}>{r.task_count.toString()}</Text>
              <Text style={[s.cell, { width: "8%" }]}>{r.overdue_task_count.toString()}</Text>
              <Text style={[s.cellLast, { width: "9%" }]}>
                {r.milestones_complete.toString()} / {r.milestone_count.toString()}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

// ── Skill Gap ──────────────────────────────────────────────────────────────

function SkillGapDoc({
  data,
  orgName,
  reportName,
}: {
  data: SkillGapDataset;
  orgName: string;
  reportName: string;
}) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <ReportHeader title={reportName} subtitle={orgName} />

        <Text style={s.sectionTitle}>
          Insufficient coverage ({data.insufficient_coverage.length.toString()})
        </Text>
        <View style={s.table}>
          <View style={[s.row, s.rowHeader]}>
            <Text style={[s.cell, { width: "60%" }]}>Skill</Text>
            <Text style={[s.cell, { width: "20%" }]}>Qualified</Text>
            <Text style={[s.cellLast, { width: "20%" }]}>Threshold</Text>
          </View>
          {data.insufficient_coverage.map((r) => (
            <View style={s.row} key={r.skill_id}>
              <Text style={[s.cell, { width: "60%" }]}>{r.skill_name}</Text>
              <Text style={[s.cell, { width: "20%" }]}>{r.qualified_count.toString()}</Text>
              <Text style={[s.cellLast, { width: "20%" }]}>{r.threshold.toString()}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>
          Expiring certifications ({data.expiring_certs.length.toString()})
        </Text>
        <View style={s.table}>
          <View style={[s.row, s.rowHeader]}>
            <Text style={[s.cell, { width: "30%" }]}>Instructor</Text>
            <Text style={[s.cell, { width: "30%" }]}>Skill</Text>
            <Text style={[s.cell, { width: "20%" }]}>Expires</Text>
            <Text style={[s.cellLast, { width: "20%" }]}>Days</Text>
          </View>
          {data.expiring_certs.map((r, i) => (
            <View style={s.row} key={`${r.instructor_id}-${r.skill_id}-${i.toString()}`}>
              <Text style={[s.cell, { width: "30%" }]}>{r.instructor_name}</Text>
              <Text style={[s.cell, { width: "30%" }]}>{r.skill_name}</Text>
              <Text style={[s.cell, { width: "20%" }]}>{r.expires_at}</Text>
              <Text style={[s.cellLast, { width: "20%" }]}>{r.days_remaining.toString()}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Over-coverage ({data.over_coverage.length.toString()})</Text>
        <View style={s.table}>
          <View style={[s.row, s.rowHeader]}>
            <Text style={[s.cell, { width: "70%" }]}>Skill</Text>
            <Text style={[s.cellLast, { width: "30%" }]}>Qualified</Text>
          </View>
          {data.over_coverage.map((r) => (
            <View style={s.row} key={r.skill_id}>
              <Text style={[s.cell, { width: "70%" }]}>{r.skill_name}</Text>
              <Text style={[s.cellLast, { width: "30%" }]}>{r.qualified_count.toString()}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

// ── Department Comparison ──────────────────────────────────────────────────

function DepartmentComparisonDoc({
  data,
  orgName,
  reportName,
}: {
  data: DepartmentComparisonDataset;
  orgName: string;
  reportName: string;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <ReportHeader title={reportName} subtitle={orgName} />
        <View style={s.table}>
          <View style={[s.row, s.rowHeader]}>
            <Text style={[s.cell, { width: "28%" }]}>Department</Text>
            <Text style={[s.cell, { width: "12%" }]}>Instructors</Text>
            <Text style={[s.cell, { width: "12%" }]}>Available</Text>
            <Text style={[s.cell, { width: "12%" }]}>Assigned</Text>
            <Text style={[s.cell, { width: "12%" }]}>Avg util</Text>
            <Text style={[s.cell, { width: "12%" }]}>Projects</Text>
            <Text style={[s.cellLast, { width: "12%" }]}>Open intake</Text>
          </View>
          {data.rows.map((r) => (
            <View style={s.row} key={r.department_id}>
              <Text style={[s.cell, { width: "28%" }]}>{r.department_name}</Text>
              <Text style={[s.cell, { width: "12%" }]}>{r.instructor_count.toString()}</Text>
              <Text style={[s.cell, { width: "12%" }]}>
                {round(r.total_annual_hours).toString()}h
              </Text>
              <Text style={[s.cell, { width: "12%" }]}>
                {round(r.total_assigned_hours).toString()}h
              </Text>
              <Text style={[s.cell, { width: "12%" }]}>
                {r.avg_utilization_pct == null
                  ? "—"
                  : `${round(r.avg_utilization_pct).toString()}%`}
              </Text>
              <Text style={[s.cell, { width: "12%" }]}>{r.active_project_count.toString()}</Text>
              <Text style={[s.cellLast, { width: "12%" }]}>{r.open_intake_count.toString()}</Text>
            </View>
          ))}
          <View style={[s.row, s.rowHeader]}>
            <Text style={[s.cell, { width: "28%" }]}>All departments</Text>
            <Text style={[s.cell, { width: "12%" }]}>
              {data.totals.instructor_count.toString()}
            </Text>
            <Text style={[s.cell, { width: "12%" }]}>
              {round(data.totals.total_annual_hours).toString()}h
            </Text>
            <Text style={[s.cell, { width: "12%" }]}>
              {round(data.totals.total_assigned_hours).toString()}h
            </Text>
            <Text style={[s.cell, { width: "12%" }]}>
              {data.totals.avg_utilization_pct == null
                ? "—"
                : `${round(data.totals.avg_utilization_pct).toString()}%`}
            </Text>
            <Text style={[s.cell, { width: "12%" }]}>
              {data.totals.active_project_count.toString()}
            </Text>
            <Text style={[s.cellLast, { width: "12%" }]}>
              {data.totals.open_intake_count.toString()}
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
