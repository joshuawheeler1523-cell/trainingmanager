"use client";

import Link from "next/link";
import { MapPinIcon, EnvelopeIcon, BuildingOffice2Icon } from "@heroicons/react/20/solid";
import type { Instructor } from "@arbor/shared";

type CapacityRow = {
  instructor_id: string;
  assigned_hours: number;
  utilization_pct: number | null;
  utilization_status: string | null;
};

type SourceBreakdown = {
  class: number;
  recurring_task: number;
  ad_hoc_task: number;
  education_request: number;
  project_task: number;
};

type Props = {
  instructor: Instructor;
  capacity?: CapacityRow | null;
  sourceBreakdown?: SourceBreakdown | null;
};

const SOURCE_LABELS = {
  class: "Classes",
  recurring_task: "Recurring",
  ad_hoc_task: "Ad-hoc",
  education_request: "Requests",
  project_task: "Projects",
} as const;

const STATUS_STYLES: Record<string, string> = {
  active: "bg-capacity-green-bg text-capacity-green",
  inactive: "bg-status-gray-bg text-status-gray",
  on_leave: "bg-capacity-yellow-bg text-capacity-yellow",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  on_leave: "On leave",
};

export default function InstructorCard({ instructor, capacity, sourceBreakdown }: Props) {
  const utilizationPct = capacity?.utilization_pct != null ? capacity.utilization_pct / 100 : null;

  const tooltipText = (() => {
    if (!sourceBreakdown) return undefined;
    const parts: string[] = [];
    for (const k of [
      "class",
      "recurring_task",
      "ad_hoc_task",
      "education_request",
      "project_task",
    ] as const) {
      const v = sourceBreakdown[k];
      if (v > 0) parts.push(`${SOURCE_LABELS[k]}: ${v.toFixed(0)}h`);
    }
    return parts.length > 0 ? parts.join(" · ") : "No assigned hours";
  })();

  return (
    <Link
      href={`/instructors/${instructor.id}`}
      className="border-border bg-background group block rounded-xl border p-5 transition-shadow hover:shadow-md"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-foreground group-hover:text-primary truncate text-sm font-semibold">
            {instructor.full_name}
          </p>
          {instructor.job_title && (
            <p className="text-muted-foreground mt-0.5 truncate text-xs">{instructor.job_title}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[instructor.status] ?? "bg-status-gray-bg text-status-gray"}`}
        >
          {STATUS_LABELS[instructor.status] ?? instructor.status}
        </span>
      </div>

      {/* Meta rows */}
      <div className="mt-3 space-y-1">
        {instructor.email && (
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <EnvelopeIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{instructor.email}</span>
          </div>
        )}
        {instructor.department && (
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <BuildingOffice2Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{instructor.department}</span>
          </div>
        )}
        {instructor.location && (
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{instructor.location}</span>
          </div>
        )}
      </div>

      {/* Capacity row */}
      <div className="border-border mt-4 flex items-center justify-between gap-3 border-t pt-3">
        <div className="min-w-0 text-xs">
          <p className="text-foreground tabular-nums">
            <span className="font-medium">{capacity?.assigned_hours.toFixed(0) ?? "0"}</span>
            <span className="text-muted-foreground"> / {instructor.annual_hours}</span>
            <span className="text-muted-foreground"> h assigned</span>
          </p>
          {capacity != null && (
            <p className="text-muted-foreground mt-0.5 tabular-nums">
              {Math.max(0, instructor.annual_hours - capacity.assigned_hours).toFixed(0)} h free
            </p>
          )}
        </div>
        <CapacityDonut
          pct={utilizationPct != null ? utilizationPct * 100 : null}
          tooltip={tooltipText}
        />
      </div>
    </Link>
  );
}

/**
 * Small SVG donut showing utilization. Track underneath, progress arc on top
 * coloured by the same utilization bands the rest of the dashboard uses.
 */
function CapacityDonut({ pct, tooltip }: { pct: number | null; tooltip?: string | undefined }) {
  const SIZE = 56;
  const STROKE = 6;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * RADIUS;
  const display = pct ?? 0;
  // Cap visible arc at 100% — over-allocation is signalled by the colour.
  const arcPct = Math.min(display, 100);
  const offset = CIRC - (arcPct / 100) * CIRC;

  const color =
    pct == null
      ? "var(--muted-foreground)"
      : pct >= 95
        ? "var(--destructive)"
        : pct >= 80
          ? "var(--highlight)"
          : pct < 40
            ? "var(--accent)"
            : "var(--primary)";

  return (
    <span title={tooltip} className="relative inline-flex shrink-0 items-center justify-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`} aria-hidden>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="color-mix(in oklab, var(--border) 70%, transparent)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${String(SIZE / 2)} ${String(SIZE / 2)})`}
        />
      </svg>
      <span
        className="absolute text-xs font-bold tabular-nums"
        style={{ color: pct == null ? "var(--muted-foreground)" : color }}
      >
        {pct == null ? "—" : `${pct.toFixed(0)}%`}
      </span>
    </span>
  );
}
