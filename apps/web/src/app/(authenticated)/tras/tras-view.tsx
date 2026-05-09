"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PlusIcon } from "@heroicons/react/20/solid";
import EmptyState from "@/components/ui/empty-state";
import TraFormDialog from "./tra-form-dialog";
import { TRA_PRIORITY_VALUES, TRA_STATUS_VALUES } from "@arbor/shared";
import type { Tra, TraPriority, TraStatus } from "@arbor/shared";

type Props = {
  tras: Tra[];
  departments: string[];
};

const STATUS_BADGE: Record<TraStatus, string> = {
  draft: "bg-surface text-muted-foreground",
  submitted: "bg-primary/10 text-primary",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  converted: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  rejected: "bg-destructive/10 text-destructive",
};

const PRIORITY_BADGE: Record<TraPriority, string> = {
  nice_to_have: "bg-surface text-muted-foreground",
  important: "bg-primary/10 text-primary",
  regulatory: "bg-destructive/10 text-destructive",
};

const PRIORITY_LABEL: Record<TraPriority, string> = {
  nice_to_have: "Nice to have",
  important: "Important",
  regulatory: "Regulatory",
};

export default function TrasView({ tras, departments }: Props) {
  const [statusFilter, setStatusFilter] = useState<TraStatus | "all">("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<TraPriority | "all">("all");

  const filtered = useMemo(() => {
    return tras.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (departmentFilter !== "all") {
        if (departmentFilter === "_none" && t.requesting_department !== null) return false;
        if (departmentFilter !== "_none" && t.requesting_department !== departmentFilter)
          return false;
      }
      return true;
    });
  }, [tras, statusFilter, priorityFilter, departmentFilter]);

  const inputCls =
    "border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-xs";

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Status</p>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as TraStatus | "all");
              }}
              className={`${inputCls} capitalize`}
            >
              <option value="all">All</option>
              {TRA_STATUS_VALUES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Priority</p>
            <select
              aria-label="Filter by priority"
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value as TraPriority | "all");
              }}
              className={inputCls}
            >
              <option value="all">All</option>
              {TRA_PRIORITY_VALUES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium">Department</p>
            <select
              aria-label="Filter by department"
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value);
              }}
              className={inputCls}
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
        </div>

        <TraFormDialog
          trigger={
            <button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
            >
              <PlusIcon className="h-4 w-4" />
              New TRA
            </button>
          }
        />
      </div>

      {tras.length === 0 ? (
        <EmptyState
          title="No TRAs yet"
          description='Click "New TRA" to capture a training request and produce an estimate.'
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No TRAs match the current filters"
          description="Clear the filters to see all TRAs."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <Link
              key={t.id}
              href={`/tras/${t.id}`}
              className="border-border bg-background group block rounded-xl border p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-foreground group-hover:text-primary truncate text-sm font-semibold">
                  {t.project_name}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[t.status]}`}
                >
                  {t.status}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                {t.priority && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[t.priority]}`}
                  >
                    {PRIORITY_LABEL[t.priority]}
                  </span>
                )}
                {t.requesting_department && (
                  <p className="text-muted-foreground truncate text-xs">
                    {t.requesting_department}
                  </p>
                )}
              </div>
              <div className="border-border mt-4 flex items-baseline justify-between border-t pt-3">
                <span className="text-muted-foreground text-xs">Estimated</span>
                <span className="text-foreground text-base font-semibold tabular-nums">
                  {t.total_estimated_hours.toFixed(0)} h
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                Created {new Date(t.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
