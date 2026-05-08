"use client";

import type { WorkloadDataset } from "@arbor/shared";

const BAND_BADGE: Record<
  NonNullable<WorkloadDataset["rows"][number]["utilization_band"]>,
  string
> = {
  under_utilized: "bg-slate-200 text-slate-700",
  balanced: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  at_risk: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  over_allocated: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
};

export default function WorkloadView({ data }: { data: WorkloadDataset }) {
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-surface text-muted-foreground text-xs">
          <tr>
            <Th className="w-1/5">Instructor</Th>
            <Th>Available</Th>
            <Th>Assigned</Th>
            <Th>Utilization</Th>
            <Th>Classes</Th>
            <Th>Recurring</Th>
            <Th>Ad-hoc</Th>
            <Th>Requests</Th>
            <Th>Project tasks</Th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {data.rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="text-muted-foreground px-3 py-6 text-center text-xs">
                No matching instructors.
              </td>
            </tr>
          ) : (
            data.rows.map((r) => (
              <tr key={r.instructor_id}>
                <td className="text-foreground px-3 py-2 font-medium">{r.full_name}</td>
                <td className="text-muted-foreground px-3 py-2 tabular-nums">
                  {round(r.annual_hours).toString()}h
                </td>
                <td className="text-foreground px-3 py-2 tabular-nums">
                  {round(r.assigned_hours).toString()}h
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground w-12 text-right text-xs tabular-nums">
                      {r.utilization_pct == null ? "—" : `${round(r.utilization_pct).toString()}%`}
                    </span>
                    {r.utilization_band && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${BAND_BADGE[r.utilization_band]}`}
                      >
                        {r.utilization_band.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                </td>
                <NumCell value={r.sources.class} />
                <NumCell value={r.sources.recurring_task} />
                <NumCell value={r.sources.ad_hoc_task} />
                <NumCell value={r.sources.education_request} />
                <NumCell value={r.sources.project_task} />
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function NumCell({ value }: { value: number }) {
  return (
    <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
      {value > 0 ? `${round(value).toString()}h` : "—"}
    </td>
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

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
