"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import { type Project, type Task, type TaskDependency } from "@arbor/shared";
import { createDependency, deleteDependency } from "../actions";

type Props = {
  project: Project;
  tasks: Task[];
  dependencies: TaskDependency[];
};

export default function DependenciesTab({ project, tasks, dependencies }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [predecessor, setPredecessor] = useState("");
  const [successor, setSuccessor] = useState("");

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  function handleCreate() {
    if (!predecessor || !successor || predecessor === successor) return;
    startTransition(async () => {
      const result = await createDependency(project.id, {
        predecessor_id: predecessor,
        successor_id: successor,
      });
      if (result.ok) {
        toast.success("Dependency added");
        setPredecessor("");
        setSuccessor("");
        router.refresh();
      } else {
        // Cycle violations come back as the SQL trigger's check_violation
        if (result.error.message.toLowerCase().includes("cycle")) {
          toast.error("That dependency would create a cycle.");
        } else {
          toast.error(result.error.message);
        }
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteDependency(id, project.id);
      if (result.ok) {
        toast.success("Dependency removed");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      {dependencies.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No dependencies yet</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Add finish-to-start links so the Gantt can draw arrows between predecessor and
            successor.
          </p>
        </div>
      ) : (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {dependencies.map((d) => {
            const pred = taskById.get(d.predecessor_id);
            const succ = taskById.get(d.successor_id);
            return (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="text-foreground flex-1 truncate">{pred?.name ?? "Unknown"}</span>
                <ArrowRightIcon className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="text-foreground flex-1 truncate">{succ?.name ?? "Unknown"}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    handleDelete(d.id);
                  }}
                  aria-label="Delete dependency"
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-border bg-background flex items-end gap-2 rounded-lg border p-3">
        <div className="flex-1">
          <p className="text-muted-foreground mb-1 text-xs font-medium">
            Predecessor (must finish first)
          </p>
          <select
            value={predecessor}
            onChange={(e) => {
              setPredecessor(e.target.value);
            }}
            className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
          >
            <option value="">Select task…</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <ArrowRightIcon className="text-muted-foreground mb-2 h-4 w-4 shrink-0" />
        <div className="flex-1">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Successor (waits for it)</p>
          <select
            value={successor}
            onChange={(e) => {
              setSuccessor(e.target.value);
            }}
            className="border-input bg-background text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
          >
            <option value="">Select task…</option>
            {tasks
              .filter((t) => t.id !== predecessor)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </div>
        <button
          type="button"
          disabled={pending || !predecessor || !successor || predecessor === successor}
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
