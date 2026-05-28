"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import {
  type Instructor,
  type Project,
  type ProjectTeamMember,
  type Task,
  type TaskActionItem,
} from "@arbor/shared";
import { updateActionItem } from "../actions";

type TeamMember = ProjectTeamMember & { instructor: Instructor | null };

type Props = {
  project: Project;
  tasks: Task[];
  team: TeamMember[];
  actionItems: TaskActionItem[];
};

export default function ActionItemsTab({ project, tasks, team, actionItems }: Props) {
  const [pending, startTransition] = useTransition();
  const [optimisticItems, applyItemPatch] = useOptimistic(
    actionItems,
    (state, op: { id: string; is_complete: boolean }) =>
      state.map((i) => (i.id === op.id ? { ...i, is_complete: op.is_complete } : i)),
  );

  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const memberMap = new Map(team.map((m) => [m.id, m]));

  function handleToggle(item: TaskActionItem) {
    startTransition(async () => {
      applyItemPatch({ id: item.id, is_complete: !item.is_complete });
      const result = await updateActionItem(item.id, project.id, {
        is_complete: !item.is_complete,
      });
      if (!result.ok) toast.error(result.error.message);
    });
  }

  if (optimisticItems.length === 0) {
    return (
      <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
        <p className="text-foreground text-sm font-medium">No action items yet</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Open a task and add action items to break work down.
        </p>
      </div>
    );
  }

  const open = optimisticItems.filter((a) => !a.is_complete);
  const done = optimisticItems.filter((a) => a.is_complete);

  return (
    <div className="space-y-6">
      <Section
        title={`Open (${open.length.toString()})`}
        items={open}
        taskMap={taskMap}
        memberMap={memberMap}
        onToggle={handleToggle}
        pending={pending}
      />
      <Section
        title={`Completed (${done.length.toString()})`}
        items={done}
        taskMap={taskMap}
        memberMap={memberMap}
        onToggle={handleToggle}
        pending={pending}
      />
    </div>
  );
}

function Section({
  title,
  items,
  taskMap,
  memberMap,
  onToggle,
  pending,
}: {
  title: string;
  items: TaskActionItem[];
  taskMap: Map<string, Task>;
  memberMap: Map<string, ProjectTeamMember & { instructor: Instructor | null }>;
  onToggle: (item: TaskActionItem) => void;
  pending: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
        {title}
      </h3>
      <ul className="border-border divide-border divide-y rounded-lg border">
        {items.map((item) => {
          const task = taskMap.get(item.task_id);
          const member = item.assigned_to_team_member_id
            ? memberMap.get(item.assigned_to_team_member_id)
            : null;
          return (
            <li key={item.id} className="flex items-start gap-3 px-3 py-2">
              <input
                type="checkbox"
                checked={item.is_complete}
                disabled={pending}
                onChange={() => {
                  onToggle(item);
                }}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-foreground text-sm ${item.is_complete ? "text-muted-foreground line-through" : ""}`}
                >
                  {item.description}
                </p>
                <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
                  {task && <span>Task: {task.name}</span>}
                  {member?.instructor && <span>· {member.instructor.full_name}</span>}
                  {item.due_date && <span>· Due {item.due_date}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
