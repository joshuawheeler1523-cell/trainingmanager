"use client";

import type { ProjectStatusDataset } from "@arbor/shared";

const STATUS_BADGE: Record<string, string> = {
  planning: "bg-surface text-muted-foreground",
  active: "bg-primary/10 text-primary",
  on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  cancelled: "bg-destructive/10 text-destructive",
};

export default function ProjectStatusView({ data }: { data: ProjectStatusDataset }) {
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-surface text-muted-foreground text-xs">
          <tr>
            <Th className="w-1/4">Project</Th>
            <Th>Status</Th>
            <Th>Priority</Th>
            <Th>Dates</Th>
            <Th>% complete</Th>
            <Th>Tasks</Th>
            <Th>Overdue</Th>
            <Th>Milestones</Th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {data.rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="text-muted-foreground px-3 py-6 text-center text-xs">
                No projects match.
              </td>
            </tr>
          ) : (
            data.rows.map((r) => (
              <tr key={r.project_id}>
                <td className="text-foreground px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[r.status] ?? "bg-surface text-muted-foreground"}`}
                  >
                    {r.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="text-muted-foreground px-3 py-2 text-xs capitalize">{r.priority}</td>
                <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                  {r.start_date && r.end_date
                    ? `${r.start_date} → ${r.end_date}`
                    : (r.start_date ?? r.end_date ?? "—")}
                </td>
                <td className="text-foreground px-3 py-2 tabular-nums">
                  {r.percent_complete == null ? "—" : `${r.percent_complete.toString()}%`}
                </td>
                <td className="text-muted-foreground px-3 py-2 tabular-nums">
                  {r.task_count.toString()}
                </td>
                <td
                  className={`px-3 py-2 tabular-nums ${r.overdue_task_count > 0 ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}
                >
                  {r.overdue_task_count.toString()}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                  {r.milestones_complete.toString()} / {r.milestone_count.toString()}
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
