"use client";

import type { DepartmentComparisonDataset } from "@arbor/shared";

function utilColor(pct: number | null): string {
  if (pct == null) return "var(--muted-foreground)";
  if (pct >= 95) return "var(--red)";
  if (pct >= 80) return "var(--persimmon-deep)";
  return "var(--forest)";
}

export default function DepartmentComparisonView({ data }: { data: DepartmentComparisonDataset }) {
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-surface text-muted-foreground text-xs">
          <tr>
            <Th className="w-1/4">Department</Th>
            <Th className="text-right">Instructors</Th>
            <Th className="text-right">Available (h)</Th>
            <Th className="text-right">Assigned (h)</Th>
            <Th className="text-right">Avg utilization</Th>
            <Th className="text-right">Active projects</Th>
            <Th className="text-right">Open intake</Th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {data.rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-muted-foreground px-3 py-6 text-center text-xs">
                No departments yet.
              </td>
            </tr>
          ) : (
            data.rows.map((r) => (
              <tr key={r.department_id}>
                <td className="text-foreground px-3 py-2 font-medium">{r.department_name}</td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {r.instructor_count}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {Math.round(r.total_annual_hours).toLocaleString()}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {Math.round(r.total_assigned_hours).toLocaleString()}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold tabular-nums"
                  style={{ color: utilColor(r.avg_utilization_pct) }}
                >
                  {r.avg_utilization_pct == null ? "—" : `${r.avg_utilization_pct.toFixed(0)}%`}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {r.active_project_count}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {r.open_intake_count}
                </td>
              </tr>
            ))
          )}
        </tbody>
        {data.rows.length > 0 && (
          <tfoot className="border-border bg-surface border-t-2">
            <tr className="font-medium">
              <td className="text-foreground px-3 py-2">All departments</td>
              <td className="text-foreground px-3 py-2 text-right tabular-nums">
                {data.totals.instructor_count}
              </td>
              <td className="text-foreground px-3 py-2 text-right tabular-nums">
                {Math.round(data.totals.total_annual_hours).toLocaleString()}
              </td>
              <td className="text-foreground px-3 py-2 text-right tabular-nums">
                {Math.round(data.totals.total_assigned_hours).toLocaleString()}
              </td>
              <td
                className="px-3 py-2 text-right font-semibold tabular-nums"
                style={{ color: utilColor(data.totals.avg_utilization_pct) }}
              >
                {data.totals.avg_utilization_pct == null
                  ? "—"
                  : `${data.totals.avg_utilization_pct.toFixed(0)}%`}
              </td>
              <td className="text-foreground px-3 py-2 text-right tabular-nums">
                {data.totals.active_project_count}
              </td>
              <td className="text-foreground px-3 py-2 text-right tabular-nums">
                {data.totals.open_intake_count}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wide ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
