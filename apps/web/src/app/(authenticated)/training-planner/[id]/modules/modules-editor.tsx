"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BarsArrowDownIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/20/solid";
import type { ImplModule } from "@arbor/shared";
import { createModule, deleteModule, setStep, updateModule } from "../../actions";

type Props = {
  implementationId: string;
  modules: ImplModule[];
};

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function ModulesEditor({ implementationId, modules }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [optimisticModules, applyModulePatch] = useOptimistic(
    modules,
    (state, action: { kind: "upsert"; row: ImplModule } | { kind: "delete"; id: string }) => {
      if (action.kind === "delete") return state.filter((m) => m.id !== action.id);
      const existing = state.findIndex((m) => m.id === action.row.id);
      if (existing >= 0) {
        const next = state.slice();
        next[existing] = action.row;
        return next;
      }
      return [...state, action.row];
    },
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function handleAdd() {
    const n = name.trim();
    if (!n) return;
    startTransition(async () => {
      const result = await createModule(implementationId, {
        name: n,
        description: description || null,
        sort_order: modules.length,
      });
      if (result.ok) {
        setName("");
        setDescription("");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleUpdate(m: ImplModule, patch: Record<string, unknown>) {
    startTransition(async () => {
      applyModulePatch({
        kind: "upsert",
        row: { ...m, ...(patch as Partial<ImplModule>), updated_at: new Date().toISOString() },
      });
      const result = await updateModule(m.id, implementationId, patch);
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteModule(id, implementationId);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  function handleNext() {
    startTransition(async () => {
      await setStep(implementationId, 5);
      router.push(`/training-planner/${implementationId}/classes`);
    });
  }

  // Alphabetize by name (case-insensitive). Computes the new sort_order
  // values, fires updateModule in parallel for any row whose position
  // changed, then refreshes so the server-ordered list reflects the new
  // sequence. Modules that are already in alphabetical order skip the
  // round trip.
  function handleSort() {
    const sorted = modules
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const changed = sorted
      .map((m, i) => ({ id: m.id, newOrder: i, oldOrder: m.sort_order }))
      .filter((x) => x.newOrder !== x.oldOrder);
    if (changed.length === 0) {
      toast.info("Already in alphabetical order");
      return;
    }
    startTransition(async () => {
      const results = await Promise.all(
        changed.map((x) => updateModule(x.id, implementationId, { sort_order: x.newOrder })),
      );
      const failed = results.filter((res) => !res.ok);
      if (failed.length > 0) {
        toast.error(`${failed.length.toString()} modules failed to re-order`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          A <strong>module</strong> is a unit of curriculum — a related set of classes that together
          form a body of training. Examples: &ldquo;Inpatient Nursing EMR Module&rdquo;,
          &ldquo;Provider EMR Module&rdquo;. Most implementations have 2–6 modules.
        </p>
        <button
          type="button"
          disabled={pending || optimisticModules.length < 2}
          onClick={handleSort}
          title="Reorder modules alphabetically by name"
          className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.04em] disabled:opacity-50"
        >
          <BarsArrowDownIcon className="h-3.5 w-3.5" />
          Sort A–Z
        </button>
      </div>

      {optimisticModules.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No modules yet</p>
        </div>
      ) : (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {optimisticModules.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="text-muted-foreground w-6 shrink-0 text-right text-xs tabular-nums">
                {(i + 1).toString()}.
              </span>
              <input
                defaultValue={m.name}
                disabled={pending}
                onBlur={(e) => {
                  if (e.target.value !== m.name) handleUpdate(m, { name: e.target.value });
                }}
                className={fieldClass + " w-56 shrink-0"}
              />
              <input
                defaultValue={m.description ?? ""}
                disabled={pending}
                onBlur={(e) => {
                  if (e.target.value !== (m.description ?? "")) {
                    handleUpdate(m, { description: e.target.value || null });
                  }
                }}
                placeholder="Description"
                className={fieldClass + " min-w-0 flex-1"}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  handleDelete(m.id);
                }}
                aria-label="Delete module"
                className="text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-border bg-background flex items-end gap-2 rounded-lg border p-3">
        <div className="w-1/4">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Module name</p>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            className={fieldClass + " w-full"}
          />
        </div>
        <div className="flex-1">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Description</p>
          <input
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
            }}
            className={fieldClass + " w-full"}
          />
        </div>
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={handleAdd}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          <PlusIcon className="h-4 w-4" />
          Add
        </button>
      </div>

      <div className="border-border flex items-center justify-between border-t pt-4">
        <button
          type="button"
          onClick={() => {
            router.push(`/training-planner/${implementationId}/trainers`);
          }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleNext}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          Save & continue
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
