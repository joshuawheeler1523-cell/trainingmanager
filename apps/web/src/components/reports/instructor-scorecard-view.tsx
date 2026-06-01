"use client";

import type { InstructorScorecardDataset } from "@arbor/shared";

const BAND_LABEL: Record<string, string> = {
  under_utilized: "Under",
  balanced: "Balanced",
  at_risk: "At risk",
  over_allocated: "Over",
};

function bandColor(band: string | null): string {
  switch (band) {
    case "over_allocated":
      return "var(--red)";
    case "at_risk":
      return "var(--persimmon-deep)";
    case "balanced":
      return "var(--forest)";
    default:
      return "var(--muted-foreground)";
  }
}

export default function InstructorScorecardView({ data }: { data: InstructorScorecardDataset }) {
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-surface text-muted-foreground text-xs">
          <tr>
            <Th className="w-1/4">Instructor</Th>
            <Th>Department</Th>
            <Th className="text-right">Utilization</Th>
            <Th className="text-right">Qualified</Th>
            <Th className="text-right">Assigned</Th>
            <Th className="text-right">Skills</Th>
            <Th className="text-right">Certs ≤90d</Th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {data.rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-muted-foreground px-3 py-6 text-center text-xs">
                No instructors match.
              </td>
            </tr>
          ) : (
            data.rows.map((r) => (
              <tr key={r.instructor_id}>
                <td className="text-foreground px-3 py-2 font-medium">{r.full_name}</td>
                <td className="text-muted-foreground px-3 py-2 text-xs">{r.department ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: bandColor(r.utilization_band) }}
                  >
                    {r.utilization_pct == null ? "—" : `${r.utilization_pct.toFixed(0)}%`}
                  </span>
                  {r.utilization_band && (
                    <span className="text-muted-foreground ml-1 text-[10px]">
                      {BAND_LABEL[r.utilization_band]}
                    </span>
                  )}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {r.classes_qualified}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {r.classes_assigned}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {r.skills_count}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.expiring_cert_count > 0
                      ? "font-semibold text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {r.expiring_cert_count}
                </td>
              </tr>
            ))
          )}
        </tbody>
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
