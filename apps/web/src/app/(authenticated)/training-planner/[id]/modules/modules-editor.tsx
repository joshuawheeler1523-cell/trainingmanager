"use client";

import { useState, useTransition } from "react";
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

// Fields flushed on Save & continue. sort_order is also persistable but
// is handled separately by the Sort A-Z action so it goes through right
// away rather than being deferred.
const PATCH_FIELDS = ["name", "description"] as const satisfies readonly (keyof ImplModule)[];

export default function ModulesEditor({ implementationId, modules: initialModules }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Local-first state — same pattern as the rooms editor. Edits never
  // round-trip until Save & continue / Back fires flushDirty.
  const [rows, setRows] = useState<ImplModule[]>(initialModules);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  function patchLocal(id: string, patch: Partial<ImplModule>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirtyIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function handleAdd() {
    const n = newName.trim();
    if (!n) return;
    startTransition(async () => {
      const result = await createModule(implementationId, {
        name: n,
        description: newDescription || null,
        sort_order: rows.length,
      });
      if (result.ok) {
        setRows((prev) => [...prev, result.data]);
        setNewName("");
        setNewDescription("");
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteModule(id, implementationId);
      if (result.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        setDirtyIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        toast.error(result.error.message);
      }
    });
  }

  async function flushDirty(): Promise<boolean> {
    if (dirtyIds.size === 0) return true;
    const dirty = rows.filter((r) => dirtyIds.has(r.id));
    const results = await Promise.all(
      dirty.map((r) => {
        const patch: Partial<ImplModule> = {};
        for (const k of PATCH_FIELDS) {
          (patch as Record<string, unknown>)[k] = r[k];
        }
        return updateModule(r.id, implementationId, patch);
      }),
    );
    const failed = results.filter((res): res is Extract<typeof res, { ok: false }> => !res.ok);
    if (failed.length > 0) {
      const firstMsg = failed[0]?.error.message ?? "Save failed";
      toast.error(
        `${failed.length.toString()} of ${dirty.length.toString()} saves failed: ${firstMsg}`,
      );
      return false;
    }
    setDirtyIds(new Set());
    return true;
  }

  function handleBack() {
    startTransition(async () => {
      const ok = await flushDirty();
      if (!ok) return;
      router.push(`/training-planner/${implementationId}/trainers`);
    });
  }

  function handleNext() {
    startTransition(async () => {
      const ok = await flushDirty();
      if (!ok) return;
      await setStep(implementationId, 5);
      router.push(`/training-planner/${implementationId}/classes`);
    });
  }

  // Alphabetize. Persists immediately (not via the deferred flush) so the
  // order reflects on disk and the next render returns the rows sorted.
  function handleSort() {
    const sorted = rows
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
      // Flush any pending field edits first so we don't lose them when the
      // server returns the re-ordered rows and clobbers local state.
      const ok = await flushDirty();
      if (!ok) return;
      const results = await Promise.all(
        changed.map((x) => updateModule(x.id, implementationId, { sort_order: x.newOrder })),
      );
      const failed = results.filter((res) => !res.ok);
      if (failed.length > 0) {
        toast.error(`${failed.length.toString()} modules failed to re-order`);
        return;
      }
      // Local re-order so the user sees the new sequence without a refetch.
      setRows((prev) => {
        const byId = new Map(prev.map((r) => [r.id, r]));
        return sorted.map((m, i) => {
          const live = byId.get(m.id);
          return live ? { ...live, sort_order: i } : m;
        });
      });
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
          disabled={pending || rows.length < 2}
          onClick={handleSort}
          title="Reorder modules alphabetically by name"
          className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.04em] disabled:opacity-50"
        >
          <BarsArrowDownIcon className="h-3.5 w-3.5" />
          Sort A–Z
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No modules yet</p>
        </div>
      ) : (
        <ul className="border-border divide-border divide-y rounded-lg border">
          {rows.map((m, i) => (
            <li
              key={m.id}
              className={`flex items-center gap-2 px-3 py-2 text-sm ${
                dirtyIds.has(m.id) ? "bg-[var(--cream,transparent)]" : ""
              }`}
            >
              <span className="text-muted-foreground w-6 shrink-0 text-right text-xs tabular-nums">
                {(i + 1).toString()}.
              </span>
              <input
                key={`${m.id}-name`}
                defaultValue={m.name}
                onBlur={(e) => {
                  if (e.target.value !== m.name) patchLocal(m.id, { name: e.target.value });
                }}
                className={fieldClass + " w-56 shrink-0"}
              />
              <input
                key={`${m.id}-desc`}
                defaultValue={m.description ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (m.description ?? "")) {
                    patchLocal(m.id, { description: e.target.value || null });
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
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
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
            value={newDescription}
            onChange={(e) => {
              setNewDescription(e.target.value);
            }}
            className={fieldClass + " w-full"}
          />
        </div>
        <button
          type="button"
          disabled={pending || !newName.trim()}
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
          disabled={pending}
          onClick={handleBack}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm disabled:opacity-50"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-center gap-3">
          {dirtyIds.size > 0 && (
            <span className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[0.04em]">
              {dirtyIds.size.toString()} unsaved
            </span>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={handleNext}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save & continue"}
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
