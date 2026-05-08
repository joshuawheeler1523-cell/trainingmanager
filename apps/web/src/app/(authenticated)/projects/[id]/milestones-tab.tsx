"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import { type Milestone, type Project } from "@arbor/shared";
import { createMilestone, deleteMilestone, updateMilestone } from "../actions";

type Props = {
  project: Project;
  milestones: Milestone[];
};

export default function MilestonesTab({ project, milestones }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");

  function handleCreate() {
    const n = name.trim();
    if (!n || !dueDate) return;
    startTransition(async () => {
      const result = await createMilestone(project.id, { name: n, due_date: dueDate });
      if (result.ok) {
        toast.success("Milestone added");
        setName("");
        setDueDate("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleToggle(m: Milestone) {
    startTransition(async () => {
      const result = await updateMilestone(m.id, project.id, { is_complete: !m.is_complete });
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteMilestone(id, project.id);
      if (result.ok) {
        toast.success("Milestone deleted");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const sorted = [...milestones].sort((a, b) => a.due_date.localeCompare(b.due_date));

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No milestones yet</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Milestones show as diamonds on the Gantt and as markers in the Calendar.
          </p>
        </div>
      ) : (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {sorted.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                checked={m.is_complete}
                disabled={pending}
                onChange={() => {
                  handleToggle(m);
                }}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-foreground text-sm font-medium ${m.is_complete ? "text-muted-foreground line-through" : ""}`}
                >
                  ◆ {m.name}
                </p>
                {m.description && (
                  <p className="text-muted-foreground mt-0.5 text-xs">{m.description}</p>
                )}
              </div>
              <span className="text-muted-foreground text-xs tabular-nums">
                {new Date(m.due_date + "T00:00:00").toLocaleDateString()}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  handleDelete(m.id);
                }}
                aria-label="Delete milestone"
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-border bg-background flex items-end gap-2 rounded-lg border p-3">
        <div className="flex-1">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Name</p>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            placeholder="e.g. Pilot kickoff"
            className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </div>
        <div className="w-44">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Due date</p>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
            }}
            className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={pending || !name.trim() || !dueDate}
          onClick={handleCreate}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" />
          Add
        </button>
      </div>
    </div>
  );
}
