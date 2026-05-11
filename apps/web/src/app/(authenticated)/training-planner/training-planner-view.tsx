"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import EmptyState from "@/components/ui/empty-state";
import { IMPL_STATUS_VALUES, type Implementation, type ImplStatus } from "@arbor/shared";
import { archiveImplementation, createImplementation } from "./actions";

type PlannerRow = Implementation & {
  class_count: number;
  session_count: number;
  completion_pct: number | null;
};

type Props = { implementations: PlannerRow[] };

const STATUS_BADGE: Record<ImplStatus, string> = {
  draft: "bg-surface text-muted-foreground",
  active: "bg-primary/10 text-primary",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  archived: "bg-surface text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export default function TrainingPlannerView({ implementations }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<ImplStatus | "all">("all");
  const [name, setName] = useState("");

  function handleCreate() {
    const n = name.trim();
    if (!n) return;
    startTransition(async () => {
      const result = await createImplementation({ name: n });
      if (result.ok) {
        toast.success("Implementation created");
        setName("");
        router.push(`/training-planner/${result.data.id}/setup`);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDelete(i: PlannerRow) {
    if (
      !confirm(
        `Delete implementation "${i.name}"? It will be archived and removed from this list. Sessions, rooms, trainers, and classes inside it stay in the database (soft delete).`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await archiveImplementation(i.id);
      if (result.ok) {
        toast.success(`"${i.name}" deleted`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const filtered = implementations.filter((i) => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">Status</p>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as ImplStatus | "all");
            }}
            className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-xs capitalize"
          >
            <option value="all">All</option>
            {IMPL_STATUS_VALUES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2">
          <input
            aria-label="New implementation name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            placeholder="New implementation name"
            className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={handleCreate}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            New implementation
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={
            implementations.length === 0
              ? "No implementations yet"
              : "No implementations match this filter"
          }
          description={
            implementations.length === 0
              ? "Create one to plan a large training rollout — name it (e.g., 'EMR Cutover Wave 2'), then walk through the 7-step wizard."
              : "Try changing the status filter."
          }
        />
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th className="w-1/3">Implementation</Th>
                <Th>Status</Th>
                <Th>Window</Th>
                <Th>Go-live</Th>
                <Th>Classes</Th>
                <Th>Sessions</Th>
                <Th className="w-32">Completion</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-surface/50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/training-planner/${i.id}/setup`}
                      className="text-primary font-medium hover:underline"
                    >
                      {i.name}
                    </Link>
                    {i.description && (
                      <p className="text-muted-foreground line-clamp-1 text-xs">{i.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[i.status]}`}
                    >
                      {i.status}
                    </span>
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                    {formatRange(i.window_start_date, i.window_end_date)}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                    {i.go_live_date ?? "—"}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                    {i.class_count.toString()}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                    {i.session_count.toString()}
                  </td>
                  <td className="px-3 py-2">
                    <CompletionBar percent={i.completion_pct} />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        handleDelete(i);
                      }}
                      aria-label={`Delete ${i.name}`}
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

function CompletionBar({ percent }: { percent: number | null }) {
  if (percent == null) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div className="bg-surface h-2 flex-1 overflow-hidden rounded-full">
        <div className="bg-primary h-full" style={{ width: `${percent.toString()}%` }} />
      </div>
      <span className="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums">
        {percent.toString()}%
      </span>
    </div>
  );
}

function formatRange(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  if (start && end) return `${start} → ${end}`;
  return start ?? end ?? "—";
}
