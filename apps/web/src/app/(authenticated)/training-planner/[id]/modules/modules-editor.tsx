"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
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
      const result = await updateModule(m.id, implementationId, patch);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
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

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        A <strong>module</strong> is a unit of curriculum — a related set of classes that together
        form a body of training. Examples: &ldquo;Inpatient Nursing EMR Module&rdquo;,
        &ldquo;Provider EMR Module&rdquo;. Most implementations have 2–6 modules.
      </p>

      {modules.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No modules yet</p>
        </div>
      ) : (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {modules.map((m, i) => (
            <li key={m.id} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
              <span className="text-muted-foreground col-span-1 text-xs tabular-nums">
                {(i + 1).toString()}.
              </span>
              <input
                defaultValue={m.name}
                disabled={pending}
                onBlur={(e) => {
                  if (e.target.value !== m.name) handleUpdate(m, { name: e.target.value });
                }}
                className={fieldClass + " col-span-3"}
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
                className={fieldClass + " col-span-7"}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  handleDelete(m.id);
                }}
                aria-label="Delete module"
                className="text-muted-foreground hover:text-destructive col-span-1 justify-self-end disabled:opacity-50"
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
