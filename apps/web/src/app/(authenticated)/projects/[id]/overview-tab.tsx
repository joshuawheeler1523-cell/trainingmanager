"use client";

import type { Instructor, Project, ProjectTeamMember, Task } from "@arbor/shared";

type TeamMember = ProjectTeamMember & { instructor: Instructor | null };

type Props = {
  project: Project;
  tasks: Task[];
  team: TeamMember[];
  percentComplete: number | null;
};

export default function OverviewTab({ project, tasks, team, percentComplete }: Props) {
  const taskStatusCounts = {
    not_started: tasks.filter((t) => t.status === "not_started").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    on_hold: tasks.filter((t) => t.status === "on_hold").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  const totalEstimatedFromTasks = tasks.reduce((acc, t) => acc + (t.estimated_hours ?? 0), 0);
  const totalActualFromTasks = tasks.reduce((acc, t) => acc + (t.actual_hours ?? 0), 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Progress card */}
      <div className="border-border bg-background rounded-lg border p-4">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Progress
        </p>
        {tasks.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">No tasks yet</p>
        ) : (
          <>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-foreground text-3xl font-semibold tabular-nums">
                {(percentComplete ?? 0).toString()}%
              </span>
              <span className="text-muted-foreground text-xs">
                across {tasks.length.toString()} tasks
              </span>
            </div>
            <div className="bg-surface mt-2 h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-all"
                style={{ width: `${(percentComplete ?? 0).toString()}%` }}
              />
            </div>
            <ul className="text-muted-foreground mt-3 grid grid-cols-2 gap-y-1 text-xs">
              <li>{taskStatusCounts.not_started.toString()} not started</li>
              <li>{taskStatusCounts.in_progress.toString()} in progress</li>
              <li>{taskStatusCounts.on_hold.toString()} on hold</li>
              <li>{taskStatusCounts.completed.toString()} completed</li>
            </ul>
          </>
        )}
      </div>

      {/* Hours card */}
      <div className="border-border bg-background rounded-lg border p-4">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Hours</p>
        <dl className="mt-2 space-y-1 text-sm">
          <Row label="Project estimate" value={formatHours(project.total_estimated_hours)} />
          <Row label="Sum of task estimates" value={formatHours(totalEstimatedFromTasks)} />
          <Row label="Logged actual" value={formatHours(totalActualFromTasks)} />
        </dl>
      </div>

      {/* Dates card */}
      <div className="border-border bg-background rounded-lg border p-4">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Key dates
        </p>
        <dl className="mt-2 space-y-1 text-sm">
          <Row label="Start" value={project.start_date ?? "—"} />
          <Row label="End" value={project.end_date ?? "—"} />
          <Row label="Created" value={new Date(project.created_at).toLocaleDateString()} />
          <Row label="Updated" value={new Date(project.updated_at).toLocaleDateString()} />
        </dl>
      </div>

      {/* Team list */}
      <div className="border-border bg-background rounded-lg border p-4 lg:col-span-2">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Team ({team.length.toString()})
        </p>
        {team.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">
            No team members yet. Add instructors from the Team tab.
          </p>
        ) : (
          <ul className="divide-border mt-2 divide-y">
            {team.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="text-foreground font-medium">
                    {m.instructor?.full_name ?? "Unknown"}
                  </span>
                  <span className="text-muted-foreground ml-2 text-xs capitalize">{m.role}</span>
                </div>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {m.allocated_hours.toFixed(0)}h allocated
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent tasks */}
      <div className="border-border bg-background rounded-lg border p-4">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          Recent tasks
        </p>
        {tasks.length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">No tasks yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {tasks.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span className="text-foreground truncate">{t.name}</span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {t.percent_complete.toString()}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-foreground text-sm tabular-nums">{value}</dd>
    </div>
  );
}

function formatHours(h: number | null | undefined): string {
  if (h == null) return "—";
  return `${h.toFixed(0)}h`;
}
