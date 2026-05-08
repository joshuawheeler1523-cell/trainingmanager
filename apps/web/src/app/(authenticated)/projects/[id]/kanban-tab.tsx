"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  TASK_STATUS_VALUES,
  type Milestone,
  type Project,
  type Task,
  type TaskActionItem,
  type TaskAssignment,
  type TaskDependency,
  type TaskPriority,
  type TaskStatus,
} from "@arbor/shared";
import { updateTask } from "../actions";
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

const COLUMN_LABELS: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
};

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: "bg-surface text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  critical: "bg-destructive/10 text-destructive",
};

export default function KanbanTab({
  project,
  tasks,
  team,
  assignments,
  actionItems,
  dependencies,
  milestones,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [statusOverride, setStatusOverride] = useState<Record<string, TaskStatus>>({});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const assignmentsByTask = useMemo(() => {
    const m = new Map<string, TaskAssignment[]>();
    for (const a of assignments) {
      const list = m.get(a.task_id) ?? [];
      list.push(a);
      m.set(a.task_id, list);
    }
    return m;
  }, [assignments]);

  const teamById = useMemo(() => new Map(team.map((m) => [m.id, m])), [team]);

  const byColumn = useMemo(() => {
    const m: Record<TaskStatus, Task[]> = {
      not_started: [],
      in_progress: [],
      on_hold: [],
      completed: [],
    };
    for (const t of tasks) {
      const status = statusOverride[t.id] ?? t.status;
      m[status].push(t);
    }
    return m;
  }, [tasks, statusOverride]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const targetStatus = String(over.id) as TaskStatus;
    const cur = tasks.find((t) => t.id === taskId);
    if (!cur) return;
    const currentStatus = statusOverride[taskId] ?? cur.status;
    if (currentStatus === targetStatus) return;

    setStatusOverride((s) => ({ ...s, [taskId]: targetStatus }));
    startTransition(async () => {
      const patch: Record<string, unknown> = { status: targetStatus };
      if (targetStatus === "completed") patch["percent_complete"] = 100;
      const result = await updateTask(taskId, project.id, patch);
      if (!result.ok) {
        toast.error(result.error.message);
        setStatusOverride((s) => {
          const next = { ...s };
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete next[taskId];
          return next;
        });
      } else {
        toast.success(`Moved to ${COLUMN_LABELS[targetStatus]}`);
        router.refresh();
      }
    });
  }

  const openTask = openTaskId ? (tasks.find((t) => t.id === openTaskId) ?? null) : null;

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {TASK_STATUS_VALUES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              label={COLUMN_LABELS[status]}
              tasks={byColumn[status]}
              assignmentsByTask={assignmentsByTask}
              teamById={teamById}
              onOpen={(id) => {
                setOpenTaskId(id);
              }}
              pending={pending}
            />
          ))}
        </div>
      </DndContext>

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

function KanbanColumn({
  status,
  label,
  tasks,
  assignmentsByTask,
  teamById,
  onOpen,
  pending,
}: {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  assignmentsByTask: Map<string, TaskAssignment[]>;
  teamById: Map<string, TeamMemberWithInstructor>;
  onOpen: (id: string) => void;
  pending: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`border-border bg-surface flex h-full min-h-[200px] flex-col rounded-xl border ${
        isOver ? "border-primary ring-primary/30 ring-2" : ""
      }`}
    >
      <div className="border-border bg-background flex items-center justify-between rounded-t-xl border-b px-3 py-2">
        <span className="text-foreground text-xs font-semibold">{label}</span>
        <span className="bg-surface text-muted-foreground rounded-full px-1.5 text-xs tabular-nums">
          {tasks.length.toString()}
        </span>
      </div>
      <div className="flex-1 space-y-2 p-2">
        {tasks.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-xs">No tasks</p>
        ) : (
          tasks.map((t) => (
            <KanbanCard
              key={t.id}
              task={t}
              assignments={assignmentsByTask.get(t.id) ?? []}
              teamById={teamById}
              onOpen={() => {
                onOpen(t.id);
              }}
              disabled={pending}
            />
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  task,
  assignments,
  teamById,
  onOpen,
  disabled,
}: {
  task: Task;
  assignments: TaskAssignment[];
  teamById: Map<string, TeamMemberWithInstructor>;
  onOpen: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x.toString()}px, ${transform.y.toString()}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  // Initials of first 3 assignees
  const avatars = assignments.slice(0, 3).map((a) => {
    const m = teamById.get(a.project_team_member_id);
    const name = m?.instructor?.full_name ?? "?";
    const initials = name
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
    return { id: a.id, name, initials };
  });
  const overflow = assignments.length - avatars.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border-border bg-background rounded-lg border p-3 shadow-sm ${
        disabled ? "cursor-wait opacity-70" : ""
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={-1}
        className="cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-foreground line-clamp-2 text-sm font-medium">{task.name}</p>
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium capitalize ${PRIORITY_BADGE[task.priority]}`}
          >
            {task.priority}
          </span>
        </div>
        {task.description && (
          <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{task.description}</p>
        )}
      </div>
      <div className="border-border mt-2 flex items-center justify-between gap-2 border-t pt-2">
        <div className="flex -space-x-2">
          {avatars.map((a) => (
            <div
              key={a.id}
              title={a.name}
              className="border-background bg-primary/20 text-primary flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-medium"
            >
              {a.initials}
            </div>
          ))}
          {overflow > 0 && (
            <div className="border-background bg-surface text-muted-foreground flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-medium">
              +{overflow.toString()}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.end_date && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {new Date(task.end_date + "T00:00:00").toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
          <button type="button" onClick={onOpen} className="text-primary text-xs hover:underline">
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
