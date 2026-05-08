"use client";

import { useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type Event } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import {
  type Milestone,
  type Project,
  type Task,
  type TaskActionItem,
  type TaskAssignment,
  type TaskDependency,
  type TaskStatus,
} from "@arbor/shared";
import TaskDrawer, { type TeamMemberWithInstructor } from "./task-drawer";

type Props = {
  project: Project;
  tasks: Task[];
  team: TeamMemberWithInstructor[];
  assignments: TaskAssignment[];
  actionItems: TaskActionItem[];
  dependencies: TaskDependency[];
  milestones: Milestone[];
};

type CalResource =
  | { kind: "task"; id: string; status: TaskStatus }
  | { kind: "milestone"; id: string };

// Note: react-big-calendar's Event.resource is typed `any`, so we use Omit
// to override it with our discriminated union — otherwise the intersection
// collapses back to `any` and the resource-narrowing breaks at lint time.
type CalEvent = Omit<Event, "resource"> & { resource: CalResource };

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const STATUS_COLOR: Record<TaskStatus, string> = {
  not_started: "#cbd5e1",
  in_progress: "#60a5fa",
  on_hold: "#fbbf24",
  completed: "#34d399",
};

export default function CalendarTab({
  project,
  tasks,
  team,
  assignments,
  actionItems,
  dependencies,
  milestones,
}: Props) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const events = useMemo<CalEvent[]>(() => {
    const out: CalEvent[] = [];
    for (const t of tasks) {
      if (!t.start_date) continue;
      const start = new Date(t.start_date + "T00:00:00");
      // Inclusive end: react-big-calendar treats end as exclusive, so add 1 day.
      const endIso = t.end_date ?? t.start_date;
      const end = new Date(endIso + "T00:00:00");
      end.setDate(end.getDate() + 1);
      out.push({
        title: t.name,
        start,
        end,
        allDay: true,
        resource: { kind: "task", id: t.id, status: t.status },
      });
    }
    for (const m of milestones) {
      const d = new Date(m.due_date + "T00:00:00");
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      out.push({
        title: `◆ ${m.name}`,
        start: d,
        end: next,
        allDay: true,
        resource: { kind: "milestone", id: m.id },
      });
    }
    return out;
  }, [tasks, milestones]);

  const openTask = openTaskId ? (tasks.find((t) => t.id === openTaskId) ?? null) : null;

  return (
    <div className="space-y-3">
      <div className="border-border bg-background rounded-lg border p-3" style={{ height: 700 }}>
        <Calendar<CalEvent>
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          views={["month", "week", "day"]}
          defaultView="month"
          eventPropGetter={(event: CalEvent) => {
            const resource = event.resource;
            if (resource.kind === "milestone") {
              return {
                style: {
                  backgroundColor: "#f59e0b",
                  borderColor: "#d97706",
                  color: "white",
                },
              };
            }
            const color = STATUS_COLOR[resource.status];
            return {
              style: {
                backgroundColor: color,
                borderColor: color,
                color: "#0f172a",
              },
            };
          }}
          onSelectEvent={(event: CalEvent) => {
            if (event.resource.kind === "task") {
              setOpenTaskId(event.resource.id);
            }
          }}
          style={{ height: "100%" }}
        />
      </div>

      {openTask && (
        <TaskDrawer
          project={project}
          task={openTask}
          allProjectTasks={tasks}
          team={team}
          assignments={assignments.filter((a) => a.task_id === openTask.id)}
          actionItems={actionItems.filter((a) => a.task_id === openTask.id)}
          dependencies={dependencies}
          milestones={milestones}
          onClose={() => {
            setOpenTaskId(null);
          }}
        />
      )}
    </div>
  );
}
