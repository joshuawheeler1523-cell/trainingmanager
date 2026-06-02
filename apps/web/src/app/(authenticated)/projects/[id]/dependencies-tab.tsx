"use client";

import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
  EXTERNAL_DEP_STATUS_VALUES,
  EXTERNAL_DEP_TYPE_VALUES,
  type ExternalDependency,
  type ExternalDepStatus,
  type ExternalDepType,
  type Project,
} from "@arbor/shared";
import { createExternalDep, deleteExternalDep, updateExternalDep } from "../actions";

type Props = {
  project: Project;
  dependencies: ExternalDependency[];
};

const STATUS_BADGE: Record<ExternalDepStatus, string> = {
  open: "bg-surface text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  resolved: "bg-success-bg text-success",
  blocked: "bg-destructive/10 text-destructive",
};

export default function DependenciesTab({ project, dependencies }: Props) {
  const [pending, startTransition] = useTransition();

  const [optimisticDeps, applyDepOp] = useOptimistic(
    dependencies,
    (
      state,
      op:
        | { kind: "status"; id: string; status: ExternalDepStatus }
        | { kind: "remove"; id: string },
    ) =>
      op.kind === "remove"
        ? state.filter((d) => d.id !== op.id)
        : state.map((d) => (d.id === op.id ? { ...d, status: op.status } : d)),
  );

  const [name, setName] = useState("");
  const [depType, setDepType] = useState<ExternalDepType>("external");
  const [owner, setOwner] = useState("");
  const [targetDate, setTargetDate] = useState("");

  function handleCreate() {
    const n = name.trim();
    if (!n) return;
    startTransition(async () => {
      const result = await createExternalDep(project.id, {
        name: n,
        dep_type: depType,
        owner: owner || null,
        target_resolution_date: targetDate || null,
      });
      if (result.ok) {
        toast.success("Dependency added");
        setName("");
        setOwner("");
        setTargetDate("");
        setDepType("external");
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleStatus(d: ExternalDependency, s: ExternalDepStatus) {
    startTransition(async () => {
      applyDepOp({ kind: "status", id: d.id, status: s });
      const result = await updateExternalDep(d.id, project.id, { status: s });
      if (!result.ok) toast.error(result.error.message);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      applyDepOp({ kind: "remove", id });
      const result = await deleteExternalDep(id, project.id);
      if (result.ok) toast.success("Removed");
      else toast.error(result.error.message);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        External / technical / vendor dependencies that block this project. Task→task arrows are
        managed inside each task drawer.
      </p>

      {optimisticDeps.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No external dependencies</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Add anything outside this project that has to land before work can finish.
          </p>
        </div>
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th className="w-1/3">Name</Th>
                <Th>Type</Th>
                <Th>Owner</Th>
                <Th>Target</Th>
                <Th>Status</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {optimisticDeps.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2">
                    <p className="text-foreground font-medium">{d.name}</p>
                    {d.description && (
                      <p className="text-muted-foreground line-clamp-1 text-xs">{d.description}</p>
                    )}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs capitalize">
                    {d.dep_type}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs">{d.owner ?? "—"}</td>
                  <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                    {d.target_resolution_date ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={d.status}
                      disabled={pending}
                      onChange={(e) => {
                        handleStatus(d, e.target.value as ExternalDepStatus);
                      }}
                      className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[d.status]}`}
                    >
                      {EXTERNAL_DEP_STATUS_VALUES.map((s) => (
                        <option key={s} value={s} className="capitalize">
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add row */}
      <div className="border-border bg-background space-y-2 rounded-lg border p-3">
        <p className="text-foreground text-xs font-semibold">Add dependency</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            placeholder="Name (e.g. Vendor X delivery)"
            className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm md:col-span-2"
          />
          <select
            value={depType}
            onChange={(e) => {
              setDepType(e.target.value as ExternalDepType);
            }}
            className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm capitalize"
          >
            {EXTERNAL_DEP_TYPE_VALUES.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => {
              setTargetDate(e.target.value);
            }}
            className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-end gap-2">
          <input
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
            }}
            placeholder="Owner (optional)"
            className="border-input bg-background text-foreground flex-1 rounded-md border px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={handleCreate}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>
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
