"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DocumentDuplicateIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import EmptyState from "@/components/ui/empty-state";
import { Badge, Eyebrow, type BadgeVariant } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  IMPL_STATUS_VALUES,
  type AllocationBucket,
  type Implementation,
  type ImplStatus,
} from "@arbor/shared";
import { archiveImplementation, createImplementation, duplicateImplementation } from "./actions";
import { ManagerOnly } from "@/components/auth/role-gate";

type PlannerRow = Implementation & {
  class_count: number;
  session_count: number;
  completion_pct: number | null;
};

type Props = { implementations: PlannerRow[]; buckets: AllocationBucket[] };

// Best-fit pick for the new-implementation dropdown's initial value. Mirrors
// the heuristic the bucket_id migration uses for backfill — prefer a bucket
// named like "Direct Training"/"Instruction"/"Teach", then fall back to the
// first non-archived bucket by display order.
function pickDefaultImplBucket(buckets: AllocationBucket[]): string {
  const match = buckets.find((b) => {
    const n = b.name.toLowerCase();
    return n.includes("direct") || n.includes("instruction") || n.includes("teach");
  });
  return match?.id ?? buckets[0]?.id ?? "";
}

const STATUS_VARIANT: Record<ImplStatus, BadgeVariant> = {
  draft: "neutral",
  active: "info",
  completed: "success",
  archived: "neutral",
  cancelled: "danger",
};

const STATUS_LABEL: Record<ImplStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Complete",
  archived: "Archived",
  cancelled: "Cancelled",
};

export default function TrainingPlannerView({ implementations, buckets }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<ImplStatus | "all">("all");
  const [name, setName] = useState("");
  const [bucketId, setBucketId] = useState<string>(() => pickDefaultImplBucket(buckets));

  // Keep default in sync if the bucket list changes after revalidate.
  useEffect(() => {
    if (!bucketId && buckets.length > 0) {
      setBucketId(pickDefaultImplBucket(buckets));
    }
  }, [buckets, bucketId]);

  function handleCreate() {
    const n = name.trim();
    if (!n) return;
    if (!bucketId) {
      toast.error("Create an allocation bucket before adding an implementation.");
      return;
    }
    startTransition(async () => {
      const result = await createImplementation({ name: n, bucket_id: bucketId });
      if (result.ok) {
        toast.success("Implementation created");
        setName("");
        router.push(`/training-planner/${result.data.id}/setup`);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDuplicate(i: PlannerRow) {
    startTransition(async () => {
      const result = await duplicateImplementation(i.id);
      if (result.ok) {
        toast.success(`Duplicated "${i.name}"`);
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

  // Editorial footer summary, matches the planner mock's "62 sessions
  // placed · 2 conflicts" style line under the schedule view.
  const summary = useMemo(() => {
    const sessions = filtered.reduce((s, i) => s + i.session_count, 0);
    const active = filtered.filter((i) => i.status === "active").length;
    const drafts = filtered.filter((i) => i.status === "draft").length;
    return { sessions, active, drafts };
  }, [filtered]);

  const statusChips: { value: ImplStatus | "all"; label: string }[] = [
    { value: "all", label: "All" },
    ...IMPL_STATUS_VALUES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
  ];

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Eyebrow variant="section">Filter</Eyebrow>
          <div className="flex flex-wrap items-center gap-1.5">
            {statusChips.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => {
                  setStatusFilter(c.value);
                }}
                aria-pressed={statusFilter === c.value}
                className={cn(
                  "rounded-[3px] px-2 py-1 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.06em] transition-colors",
                  statusFilter === c.value
                    ? "bg-[var(--ink,var(--foreground))] text-[var(--cream,var(--background))]"
                    : "bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <ManagerOnly>
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
            <select
              aria-label="Allocation bucket"
              value={bucketId}
              onChange={(e) => {
                setBucketId(e.target.value);
              }}
              disabled={buckets.length === 0}
              className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm disabled:opacity-50"
            >
              {buckets.length === 0 ? (
                <option value="">No buckets yet</option>
              ) : (
                buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              disabled={pending || !name.trim() || !bucketId}
              onClick={handleCreate}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              New implementation
            </button>
          </div>
        </ManagerOnly>
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
        <div className="border-border bg-background overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border border-b border-dashed">
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
                <tr key={i.id} className="hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link
                      href={`/training-planner/${i.id}/setup`}
                      className="font-display text-foreground text-base font-medium leading-tight hover:underline"
                    >
                      {i.name}
                    </Link>
                    {i.description && (
                      <p className="text-muted-foreground mt-0.5 line-clamp-1 font-mono text-[10.5px] tracking-[0.02em]">
                        {i.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                  </td>
                  <td className="text-muted-foreground px-4 py-3 font-mono text-[10.5px] tabular-nums">
                    {formatRange(i.window_start_date, i.window_end_date)}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 font-mono text-[10.5px] tabular-nums">
                    {i.go_live_date ?? "—"}
                  </td>
                  <td className="text-foreground px-4 py-3 font-mono text-[11.5px] tabular-nums">
                    {i.class_count.toString()}
                  </td>
                  <td className="text-foreground px-4 py-3 font-mono text-[11.5px] tabular-nums">
                    {i.session_count.toString()}
                  </td>
                  <td className="px-4 py-3">
                    <CompletionBar percent={i.completion_pct} />
                  </td>
                  <td className="px-4 py-3">
                    <ManagerOnly>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            handleDuplicate(i);
                          }}
                          aria-label={`Duplicate ${i.name}`}
                          title="Duplicate (copies rooms, trainers, classes, modules, prereqs — no sessions)"
                          className="text-muted-foreground hover:text-foreground rounded p-1 disabled:opacity-50"
                        >
                          <DocumentDuplicateIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            handleDelete(i);
                          }}
                          aria-label={`Delete ${i.name}`}
                          title="Delete"
                          className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </ManagerOnly>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Editorial footer summary line */}
          <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t border-dashed px-4 py-3 font-mono text-[10.5px] tracking-[0.04em]">
            <span>
              {filtered.length} shown ·{" "}
              <b className="text-foreground font-medium">{summary.sessions}</b> sessions placed
              {summary.active > 0 && <> · {summary.active} active</>}
            </span>
            {summary.drafts > 0 && (
              <span>
                <b className="text-foreground font-medium">{summary.drafts}</b> in draft
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "text-muted-foreground px-4 py-3 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em]",
        className,
      )}
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
      <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-[var(--hair-soft,rgba(28,31,28,0.06))]">
        <div
          className="h-full bg-[var(--forest,var(--primary))]"
          style={{ width: `${percent.toString()}%` }}
        />
      </div>
      <span className="text-muted-foreground w-9 shrink-0 text-right font-mono text-[10.5px] tabular-nums">
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
