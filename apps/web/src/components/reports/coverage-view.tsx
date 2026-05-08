"use client";

import type { CoverageDataset } from "@arbor/shared";

export default function CoverageView({ data }: { data: CoverageDataset }) {
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-surface text-muted-foreground text-xs">
          <tr>
            <Th className="w-1/4">Class</Th>
            <Th>Bucket</Th>
            <Th>Target</Th>
            <Th>Assigned</Th>
            <Th>Coverage</Th>
            <Th>Qualified instructors</Th>
            <Th>Flags</Th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {data.rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-muted-foreground px-3 py-6 text-center text-xs">
                No classes match.
              </td>
            </tr>
          ) : (
            data.rows.map((r) => (
              <tr key={r.class_id}>
                <td className="text-foreground px-3 py-2 font-medium">{r.class_name}</td>
                <td className="text-muted-foreground px-3 py-2 text-xs">{r.bucket_name ?? "—"}</td>
                <td className="text-muted-foreground px-3 py-2 tabular-nums">
                  {r.target_offerings.toString()}
                </td>
                <td className="text-foreground px-3 py-2 tabular-nums">
                  {r.assigned_offerings.toString()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-surface h-2 w-24 overflow-hidden rounded">
                      <div
                        className={`h-full ${
                          r.coverage_percent >= 100
                            ? "bg-emerald-500"
                            : r.coverage_percent >= 80
                              ? "bg-amber-400"
                              : "bg-rose-500"
                        }`}
                        style={{ width: `${Math.min(100, r.coverage_percent).toString()}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {r.coverage_percent.toString()}%
                    </span>
                  </div>
                </td>
                <td className="text-muted-foreground px-3 py-2 tabular-nums">
                  {r.qualified_instructor_count.toString()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {r.has_no_assignee && <Pill color="amber">No assignee</Pill>}
                    {r.has_skill_gap && <Pill color="rose">Skill gap</Pill>}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Pill({ color, children }: { color: "amber" | "rose"; children: React.ReactNode }) {
  const cls = {
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
  }[color];
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{children}</span>
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
