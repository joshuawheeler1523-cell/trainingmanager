"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PlusIcon } from "@heroicons/react/20/solid";
import EmptyState from "@/components/ui/empty-state";
import { Badge, Eyebrow, type BadgeVariant } from "@/components/ui";
import { cn } from "@/lib/utils";
import TraFormDialog from "./tra-form-dialog";
import { TRA_PRIORITY_VALUES, TRA_STATUS_VALUES } from "@arbor/shared";
import type { Tra, TraPriority, TraStatus } from "@arbor/shared";

type Props = {
  tras: Tra[];
  departments: string[];
};

const STATUS_VARIANT: Record<TraStatus, BadgeVariant> = {
  draft: "neutral",
  documented: "info",
  converted: "warning",
  completed: "success",
  cancelled: "danger",
};

const STATUS_LABEL: Record<TraStatus, string> = {
  draft: "Drafting",
  documented: "Documented",
  converted: "Converted",
  completed: "Complete",
  cancelled: "Cancelled",
};

const PRIORITY_LABEL: Record<TraPriority, string> = {
  nice_to_have: "Nice to have",
  important: "Important",
  regulatory: "Regulatory",
};

const PRIORITY_VARIANT: Record<TraPriority, BadgeVariant> = {
  nice_to_have: "neutral",
  important: "info",
  regulatory: "danger",
};

type StatusFilter = TraStatus | "all";

export default function TrasView({ tras, departments }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<TraPriority | "all">("all");
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    return tras.filter((t) => {
      const archived = t.archived_at != null;
      if (showArchived !== archived) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (departmentFilter !== "all") {
        if (departmentFilter === "_none" && t.requesting_department !== null) return false;
        if (departmentFilter !== "_none" && t.requesting_department !== departmentFilter)
          return false;
      }
      return true;
    });
  }, [tras, statusFilter, priorityFilter, departmentFilter, showArchived]);

  const archivedCount = useMemo(() => tras.filter((t) => t.archived_at != null).length, [tras]);

  // Editorial-style footer summary, matching the mock's "X open · Y h in
  // flight" line under the triage inbox.
  const summary = useMemo(() => {
    const open = filtered.filter((t) => t.status === "draft" || t.status === "documented").length;
    const hours = filtered.reduce((acc, t) => acc + (t.total_estimated_hours || 0), 0);
    const converted = filtered.filter((t) => t.status === "converted").length;
    return { open, hours, converted };
  }, [filtered]);

  const statusChips: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    ...TRA_STATUS_VALUES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
  ];

  return (
    <div className="space-y-5 p-6">
      {/* Status chip row + new-intake action */}
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

        <TraFormDialog
          trigger={
            <button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
            >
              <PlusIcon className="h-4 w-4" />
              New work intake
            </button>
          }
        />
      </div>

      {/* Secondary filters — kept compact; priority/department/archived */}
      <div className="border-border flex flex-wrap items-end gap-3 border-t pt-4">
        <div className="flex flex-col gap-1.5">
          <Eyebrow variant="section">Priority</Eyebrow>
          <select
            aria-label="Filter by priority"
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value as TraPriority | "all");
            }}
            className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-xs"
          >
            <option value="all">All</option>
            {TRA_PRIORITY_VALUES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Eyebrow variant="section">Department</Eyebrow>
          <select
            aria-label="Filter by department"
            value={departmentFilter}
            onChange={(e) => {
              setDepartmentFilter(e.target.value);
            }}
            className="border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-xs"
          >
            <option value="all">All</option>
            <option value="_none">— Unassigned —</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
            }}
            className="border-input rounded"
          />
          Show archived ({archivedCount})
        </label>
      </div>

      {tras.length === 0 ? (
        <EmptyState
          title="No work intake yet"
          description='Click "New work intake" to capture a training request and produce an estimate.'
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No work intake matches the current filters"
          description="Clear the filters to see everything."
        />
      ) : (
        <div className="border-border bg-background rounded-xl border">
          <ul className="divide-border divide-y">
            {filtered.map((t) => {
              const sub = [
                t.requesting_department,
                t.requestor_name,
                new Date(t.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                }),
              ]
                .filter((x): x is string => typeof x === "string" && x.length > 0)
                .join(" · ");

              return (
                <li key={t.id}>
                  <Link
                    href={`/tras/${t.id}`}
                    className="hover:bg-surface group grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-display text-foreground group-hover:text-primary truncate text-base font-medium leading-tight">
                        {t.project_name}
                      </p>
                      {sub && (
                        <p className="text-muted-foreground mt-1 truncate font-mono text-[10.5px] tracking-[0.02em]">
                          {sub}
                        </p>
                      )}
                    </div>
                    {t.priority ? (
                      <Badge variant={PRIORITY_VARIANT[t.priority]}>
                        {PRIORITY_LABEL[t.priority]}
                      </Badge>
                    ) : (
                      <span />
                    )}
                    <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                    <div className="min-w-[60px] text-right font-mono text-[11.5px] leading-tight tracking-[0.02em]">
                      <div className="text-foreground tabular-nums">
                        {t.total_estimated_hours.toFixed(0)} h
                      </div>
                      <div className="text-muted-foreground mt-0.5 text-[9.5px] uppercase tracking-[0.04em]">
                        est.
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Editorial footer summary line */}
          <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-t border-dashed px-5 py-3 font-mono text-[10.5px] tracking-[0.04em]">
            <span>
              {filtered.length} shown ·{" "}
              <b className="text-foreground font-medium">{summary.hours.toFixed(0)} h</b> in flight
              {summary.open > 0 && <> · {summary.open} open</>}
            </span>
            {summary.converted > 0 && (
              <span>
                <b className="text-foreground font-medium">{summary.converted}</b> converted to
                project
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
