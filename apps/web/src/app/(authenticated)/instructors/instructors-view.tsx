"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon } from "@heroicons/react/20/solid";
import InstructorCard from "./instructor-card";
import InstructorFilters from "./instructor-filters";
import EmptyState from "@/components/ui/empty-state";
import {
  projectedAnnualized,
  type CapacityRow,
  type ForecastWeek,
  type Instructor,
  type Recommendation,
  type WorkloadSource,
} from "@arbor/shared";

type Tab = "roster" | "actual_vs_projected" | "recommendations";

const TABS: { id: Tab; label: string }[] = [
  { id: "roster", label: "Roster" },
  { id: "actual_vs_projected", label: "Actual vs Projected" },
  { id: "recommendations", label: "Smart Recommendations" },
];

type SourceBreakdown = Record<WorkloadSource, number>;

type Props = {
  instructors: Instructor[];
  departments: string[];
  capacityByInstructor: Map<string, CapacityRow>;
  sourceBreakdownByInstructor: Map<string, SourceBreakdown>;
  forecastByInstructor: Map<string, ForecastWeek[]>;
  recommendations: Recommendation[];
  showDeleted: boolean;
};

export default function InstructorsView(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tabParam = sp.get("tab");
  const tab: Tab =
    tabParam === "actual_vs_projected" || tabParam === "recommendations" ? tabParam : "roster";

  function setTab(next: Tab) {
    const params = new URLSearchParams(sp.toString());
    if (next === "roster") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div>
      <div className="border-border bg-background border-b px-6">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
              }}
              className={`shrink-0 border-b-2 pb-3 pt-3 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="space-y-4 p-6">
        {tab === "roster" && (
          <RosterTab
            instructors={props.instructors}
            departments={props.departments}
            capacityByInstructor={props.capacityByInstructor}
            sourceBreakdownByInstructor={props.sourceBreakdownByInstructor}
            showDeleted={props.showDeleted}
          />
        )}
        {tab === "actual_vs_projected" && (
          <ActualVsProjectedTab
            instructors={props.instructors}
            capacityByInstructor={props.capacityByInstructor}
            forecastByInstructor={props.forecastByInstructor}
          />
        )}
        {tab === "recommendations" && (
          <RecommendationsTab recommendations={props.recommendations} />
        )}
      </div>
    </div>
  );
}

// ── Roster ───────────────────────────────────────────────────────────────────

function RosterTab({
  instructors,
  departments,
  capacityByInstructor,
  sourceBreakdownByInstructor,
  showDeleted,
}: {
  instructors: Instructor[];
  departments: string[];
  capacityByInstructor: Map<string, CapacityRow>;
  sourceBreakdownByInstructor: Map<string, SourceBreakdown>;
  showDeleted: boolean;
}) {
  const sp = useSearchParams();
  const utilizationFilter = sp.get("utilization");

  // Apply utilization filter on the client (the server filters by status,
  // search, department, deleted; utilization comes from the capacity view).
  const filtered = useMemo(() => {
    if (!utilizationFilter) return instructors;
    return instructors.filter((i) => {
      const cap = capacityByInstructor.get(i.id);
      return cap?.utilization_status === utilizationFilter;
    });
  }, [instructors, capacityByInstructor, utilizationFilter]);

  if (instructors.length === 0) {
    return (
      <>
        <InstructorFilters departments={departments} />
        <EmptyState
          title={showDeleted ? "No archived instructors" : "No instructors yet"}
          description={
            showDeleted
              ? "Archived instructors will appear here."
              : "Add your first instructor to get started."
          }
        />
      </>
    );
  }

  return (
    <>
      <InstructorFilters departments={departments} />

      {filtered.length === 0 ? (
        <EmptyState
          title="No instructors match the current filter"
          description="Try clearing the utilization filter."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((instructor) => (
            <InstructorCard
              key={instructor.id}
              instructor={instructor}
              capacity={capacityByInstructor.get(instructor.id) ?? null}
              sourceBreakdown={sourceBreakdownByInstructor.get(instructor.id) ?? null}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── Actual vs Projected ──────────────────────────────────────────────────────

function ActualVsProjectedTab({
  instructors,
  capacityByInstructor,
  forecastByInstructor,
}: {
  instructors: Instructor[];
  capacityByInstructor: Map<string, CapacityRow>;
  forecastByInstructor: Map<string, ForecastWeek[]>;
}) {
  type Row = {
    id: string;
    name: string;
    actual: number;
    projected: number;
    capacity: number;
    delta: number; // projected - actual, positive means projected is higher
  };

  const rows: Row[] = instructors.map((i) => {
    const cap = capacityByInstructor.get(i.id);
    const actual = cap?.assigned_hours ?? 0;
    const projected = projectedAnnualized(forecastByInstructor.get(i.id) ?? []);
    return {
      id: i.id,
      name: i.full_name,
      actual,
      projected,
      capacity: i.annual_hours,
      delta: projected - actual,
    };
  });

  const sorted = [...rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return (
    <div className="space-y-4">
      <div className="border-border bg-background rounded-xl border p-4">
        <p className="text-foreground text-sm font-medium">Actual vs Projected</p>
        <p className="text-muted-foreground mt-1 text-xs">
          <strong>Actual</strong> = current{" "}
          <code className="bg-surface rounded px-1">assigned_hours</code> from the workload view.{" "}
          <strong>Projected</strong> = sum of the next 8 weeks of forecast × (52 / 8) annualized.
          We&apos;ll refine &ldquo;actual&rdquo; once we add a time-tracking story.
        </p>
      </div>

      <div className="border-border bg-background overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-border bg-surface border-b">
            <tr>
              <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                Instructor
              </th>
              <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                Capacity
              </th>
              <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                Actual (annual)
              </th>
              <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                Projected (annualized)
              </th>
              <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                Δ
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {sorted.map((r) => {
              const deltaCls =
                Math.abs(r.delta) < 1
                  ? "text-muted-foreground"
                  : r.delta > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400";
              return (
                <tr key={r.id} className="hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link
                      href={`/instructors/${r.id}`}
                      className="text-foreground text-sm font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="text-foreground px-4 py-3 text-right text-sm tabular-nums">
                    {r.capacity.toFixed(0)}
                  </td>
                  <td className="text-foreground px-4 py-3 text-right text-sm tabular-nums">
                    {r.actual.toFixed(0)}
                  </td>
                  <td className="text-foreground px-4 py-3 text-right text-sm tabular-nums">
                    {r.projected.toFixed(0)}
                  </td>
                  <td className={`px-4 py-3 text-right text-sm tabular-nums ${deltaCls}`}>
                    {r.delta > 0 ? "+" : ""}
                    {r.delta.toFixed(0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Smart Recommendations ───────────────────────────────────────────────────

function RecommendationsTab({ recommendations }: { recommendations: Recommendation[] }) {
  const [expandedKind, setExpandedKind] = useState<string | null>(null);

  if (recommendations.length === 0) {
    return (
      <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
        <CheckCircleIcon className="mx-auto h-8 w-8 text-emerald-500" />
        <p className="text-foreground mt-3 text-sm font-medium">All clear</p>
        <p className="text-muted-foreground mt-1 text-xs">
          No utilization, coverage, or bucket-consumption issues detected right now.
        </p>
      </div>
    );
  }

  const grouped: Record<Recommendation["kind"], Recommendation[]> = {
    instructor_over_allocated: [],
    class_single_qualified: [],
    bucket_over_consumed: [],
  };
  for (const r of recommendations) grouped[r.kind].push(r);

  const SECTIONS: { kind: Recommendation["kind"]; label: string }[] = [
    { kind: "instructor_over_allocated", label: "Over-allocated instructors" },
    { kind: "class_single_qualified", label: "Under-covered classes" },
    { kind: "bucket_over_consumed", label: "Over-consumed buckets" },
  ];

  return (
    <div className="space-y-3">
      <div className="border-border bg-background rounded-xl border p-4">
        <p className="text-foreground text-sm font-medium">Smart Recommendations</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Rule-based for v1. Each recommendation links to the relevant detail page so you can act.
        </p>
      </div>

      {SECTIONS.map(({ kind, label }) => {
        const items = grouped[kind];
        if (items.length === 0) return null;
        const isOpen = expandedKind === kind || expandedKind === null;
        return (
          <section key={kind} className="border-border bg-background rounded-xl border">
            <button
              type="button"
              onClick={() => {
                setExpandedKind(expandedKind === kind ? null : kind);
              }}
              className="hover:bg-surface flex w-full items-center justify-between px-4 py-3"
            >
              <span className="text-foreground text-sm font-semibold">
                {label} ({items.length})
              </span>
              <span className="text-muted-foreground text-xs">{isOpen ? "Hide" : "Show"}</span>
            </button>
            {isOpen && (
              <ul className="divide-border border-border divide-y border-t">
                {items.map((r) => {
                  const Icon = r.severity === "critical" ? XCircleIcon : ExclamationTriangleIcon;
                  const iconCls = r.severity === "critical" ? "text-destructive" : "text-amber-500";
                  return (
                    <li key={r.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconCls}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground text-sm font-medium">{r.title}</p>
                          <p className="text-muted-foreground mt-0.5 text-xs">{r.body}</p>
                          {r.link && (
                            <Link
                              href={r.link}
                              className="text-primary mt-1.5 inline-block text-xs font-medium hover:underline"
                            >
                              Open →
                            </Link>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
