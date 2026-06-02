"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  CheckCircleIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  Squares2X2Icon,
  TableCellsIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";
import InstructorCard from "./instructor-card";
import InstructorFilters from "./instructor-filters";
import EmptyState from "@/components/ui/empty-state";
import { Label } from "@/components/labels";
import {
  type CapacityRow,
  type Instructor,
  type Recommendation,
  type WorkloadSource,
} from "@arbor/shared";

type Tab = "roster" | "capacity" | "recommendations";

const TABS: { id: Tab; label: string }[] = [
  { id: "roster", label: "Roster" },
  { id: "capacity", label: "Capacity" },
  { id: "recommendations", label: "Smart Recommendations" },
];

type SourceBreakdown = Record<WorkloadSource, number>;

type Props = {
  instructors: Instructor[];
  departments: string[];
  capacityByInstructor: Map<string, CapacityRow>;
  sourceBreakdownByInstructor: Map<string, SourceBreakdown>;
  recommendations: Recommendation[];
  showDeleted: boolean;
  activeInstructorCount: number;
};

export default function InstructorsView(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tabParam = sp.get("tab");
  // Old "actual_vs_projected" param maps to the simplified "capacity" tab so
  // existing bookmarks keep working.
  const tab: Tab =
    tabParam === "capacity" || tabParam === "actual_vs_projected"
      ? "capacity"
      : tabParam === "recommendations"
        ? "recommendations"
        : "roster";

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
            activeInstructorCount={props.activeInstructorCount}
          />
        )}
        {tab === "capacity" && (
          <ActualVsProjectedTab
            instructors={props.instructors}
            capacityByInstructor={props.capacityByInstructor}
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

type View = "cards" | "rows";
type SortKey = "name" | "department" | "status" | "capacity" | "assigned" | "utilization";
type SortDir = "asc" | "desc";

function RosterTab({
  instructors,
  departments,
  capacityByInstructor,
  sourceBreakdownByInstructor,
  showDeleted,
  activeInstructorCount,
}: {
  instructors: Instructor[];
  departments: string[];
  capacityByInstructor: Map<string, CapacityRow>;
  sourceBreakdownByInstructor: Map<string, SourceBreakdown>;
  showDeleted: boolean;
  activeInstructorCount: number;
}) {
  const sp = useSearchParams();
  const utilizationFilter = sp.get("utilization");

  // View / sort are pure presentation — toggling them shouldn't trigger
  // a server round-trip, so keep them in local state. We seed from the
  // URL on first render and persist back via history.replaceState so the
  // URL stays shareable without re-running the page server component.
  const [view, setViewState] = useState<View>(() => (sp.get("view") === "rows" ? "rows" : "cards"));
  const [sortKey, setSortKeyState] = useState<SortKey>(
    () => (sp.get("sort") as SortKey | null) ?? "name",
  );
  const [sortDir, setSortDirState] = useState<SortDir>(() =>
    sp.get("dir") === "desc" ? "desc" : "asc",
  );

  function syncUrl(updates: { view?: View; sort?: SortKey; dir?: SortDir }) {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (updates.view !== undefined) {
      if (updates.view === "cards") params.delete("view");
      else params.set("view", updates.view);
    }
    if (updates.sort !== undefined) params.set("sort", updates.sort);
    if (updates.dir !== undefined) params.set("dir", updates.dir);
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }

  function setView(next: View) {
    setViewState(next);
    syncUrl({ view: next });
  }

  function setSort(key: SortKey) {
    const nextDir: SortDir = sortKey === key && sortDir === "asc" ? "desc" : "asc";
    setSortKeyState(key);
    setSortDirState(nextDir);
    syncUrl({ sort: key, dir: nextDir });
  }

  const filtered = useMemo(() => {
    if (!utilizationFilter) return instructors;
    return instructors.filter((i) => {
      const cap = capacityByInstructor.get(i.id);
      return cap?.utilization_status === utilizationFilter;
    });
  }, [instructors, capacityByInstructor, utilizationFilter]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      const ca = capacityByInstructor.get(a.id);
      const cb = capacityByInstructor.get(b.id);
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
        case "department":
          av = a.department ?? "";
          bv = b.department ?? "";
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        case "capacity":
          av = a.annual_hours;
          bv = b.annual_hours;
          break;
        case "assigned":
          av = ca?.assigned_hours ?? 0;
          bv = cb?.assigned_hours ?? 0;
          break;
        case "utilization":
          av = ca?.utilization_pct ?? -1;
          bv = cb?.utilization_pct ?? -1;
          break;
        default:
          av = a.full_name.toLowerCase();
          bv = b.full_name.toLowerCase();
      }
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filtered, capacityByInstructor, sortKey, sortDir]);

  if (instructors.length === 0) {
    return (
      <>
        <InstructorFilters
          departments={departments}
          activeInstructorCount={activeInstructorCount}
        />
        <EmptyState
          title={
            showDeleted ? (
              <>
                No archived <Label kind="entity.instructor" plural lower />
              </>
            ) : (
              <>
                No <Label kind="entity.instructor" plural lower /> yet
              </>
            )
          }
          description={
            showDeleted ? (
              <>
                Archived <Label kind="entity.instructor" plural lower /> will appear here.
              </>
            ) : (
              <>
                Add your first <Label kind="entity.instructor" lower /> to get started.
              </>
            )
          }
        />
      </>
    );
  }

  return (
    <>
      <InstructorFilters departments={departments} activeInstructorCount={activeInstructorCount} />

      {/* View toggle */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          {sorted.length} of {instructors.length}{" "}
          <Label kind="entity.instructor" plural={instructors.length !== 1} lower />
        </p>
        <div className="border-input inline-flex overflow-hidden rounded-md border">
          <button
            type="button"
            onClick={() => {
              setView("cards");
            }}
            aria-pressed={view === "cards"}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "cards"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface"
            }`}
          >
            <Squares2X2Icon className="h-4 w-4" />
            Cards
          </button>
          <button
            type="button"
            onClick={() => {
              setView("rows");
            }}
            aria-pressed={view === "rows"}
            className={`border-input inline-flex items-center gap-1.5 border-l px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "rows"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-surface"
            }`}
          >
            <TableCellsIcon className="h-4 w-4" />
            Rows
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title={
            <>
              No <Label kind="entity.instructor" plural lower /> match the current filter
            </>
          }
          description="Try clearing the utilization filter."
        />
      ) : view === "cards" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((instructor) => (
            <InstructorCard
              key={instructor.id}
              instructor={instructor}
              capacity={capacityByInstructor.get(instructor.id) ?? null}
              sourceBreakdown={sourceBreakdownByInstructor.get(instructor.id) ?? null}
            />
          ))}
        </div>
      ) : (
        <RosterRowView
          instructors={sorted}
          capacityByInstructor={capacityByInstructor}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={setSort}
        />
      )}
    </>
  );
}

function RosterRowView({
  instructors,
  capacityByInstructor,
  sortKey,
  sortDir,
  onSort,
}: {
  instructors: Instructor[];
  capacityByInstructor: Map<string, CapacityRow>;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const STATUS_LABELS: Record<string, string> = {
    active: "Active",
    inactive: "Inactive",
    on_leave: "On leave",
  };

  return (
    <div className="border-border bg-background overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="border-border bg-surface border-b">
          <tr>
            <SortHeader
              k="name"
              label="Instructor"
              align="left"
              current={sortKey}
              dir={sortDir}
              onSort={onSort}
            />
            <SortHeader
              k="department"
              label="Department"
              align="left"
              current={sortKey}
              dir={sortDir}
              onSort={onSort}
            />
            <SortHeader
              k="status"
              label="Status"
              align="left"
              current={sortKey}
              dir={sortDir}
              onSort={onSort}
            />
            <SortHeader
              k="capacity"
              label="Capacity"
              align="right"
              current={sortKey}
              dir={sortDir}
              onSort={onSort}
            />
            <SortHeader
              k="assigned"
              label="Assigned"
              align="right"
              current={sortKey}
              dir={sortDir}
              onSort={onSort}
            />
            <SortHeader
              k="utilization"
              label="Utilization"
              align="right"
              current={sortKey}
              dir={sortDir}
              onSort={onSort}
            />
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {instructors.map((i) => {
            const cap = capacityByInstructor.get(i.id);
            const pct = cap?.utilization_pct ?? null;
            const utilColor =
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
              <tr key={i.id} className="hover:bg-surface">
                <td className="px-4 py-3">
                  <Link
                    href={`/instructors/${i.id}`}
                    className="text-foreground hover:text-primary text-sm font-medium"
                  >
                    {i.full_name}
                  </Link>
                  {i.job_title && (
                    <p className="text-muted-foreground mt-0.5 text-xs">{i.job_title}</p>
                  )}
                </td>
                <td className="text-foreground px-4 py-3 text-xs">{i.department ?? "—"}</td>
                <td className="text-muted-foreground px-4 py-3 text-xs capitalize">
                  {STATUS_LABELS[i.status] ?? i.status}
                </td>
                <td className="text-foreground px-4 py-3 text-right text-sm tabular-nums">
                  {i.annual_hours.toLocaleString()}
                </td>
                <td className="text-foreground px-4 py-3 text-right text-sm tabular-nums">
                  {(cap?.assigned_hours ?? 0).toFixed(0)}
                </td>
                <td
                  className="px-4 py-3 text-right text-sm font-semibold tabular-nums"
                  style={{ color: utilColor }}
                >
                  {pct == null ? "—" : `${pct.toFixed(0)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  k,
  label,
  align,
  current,
  dir,
  onSort,
}: {
  k: SortKey;
  label: string;
  align: "left" | "right";
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = k === current;
  const Icon = active ? (dir === "asc" ? ChevronUpIcon : ChevronDownIcon) : ChevronUpDownIcon;
  return (
    <th
      className={`px-4 py-2.5 text-xs font-medium ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => {
          onSort(k);
        }}
        className={`hover:text-foreground inline-flex items-center gap-1 transition-colors ${
          active ? "text-foreground" : "text-muted-foreground"
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span>{label}</span>
        <Icon className="text-muted-foreground h-3.5 w-3.5" />
      </button>
    </th>
  );
}

// ── Capacity ─────────────────────────────────────────────────────────────────

function ActualVsProjectedTab({
  instructors,
  capacityByInstructor,
}: {
  instructors: Instructor[];
  capacityByInstructor: Map<string, CapacityRow>;
}) {
  type Row = {
    id: string;
    name: string;
    capacity: number;
    assigned: number;
    free: number;
    pct: number | null;
  };

  const rows: Row[] = instructors.map((i) => {
    const cap = capacityByInstructor.get(i.id);
    const assigned = cap?.assigned_hours ?? 0;
    return {
      id: i.id,
      name: i.full_name,
      capacity: i.annual_hours,
      assigned,
      free: Math.max(0, i.annual_hours - assigned),
      pct: cap?.utilization_pct ?? null,
    };
  });

  // Default sort: highest utilization first (where attention is needed).
  const sorted = [...rows].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));

  return (
    <div className="space-y-4">
      <div className="border-border bg-background rounded-xl border p-4">
        <p className="text-foreground text-sm font-medium">Capacity vs assigned</p>
        <p className="text-muted-foreground mt-1 text-xs">
          <strong>Capacity</strong> is each instructor&apos;s annual hours.{" "}
          <strong>Assigned</strong> sums their classes, recurring tasks, ad-hoc work, and project
          tasks. <strong>Free</strong> is what&apos;s left for new work.
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
                Assigned
              </th>
              <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                Free
              </th>
              <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                Utilization
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {sorted.map((r) => {
              const color =
                r.pct == null
                  ? "var(--muted-foreground)"
                  : r.pct >= 95
                    ? "var(--destructive)"
                    : r.pct >= 80
                      ? "var(--highlight)"
                      : r.pct < 40
                        ? "var(--accent)"
                        : "var(--primary)";
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
                    {r.capacity.toLocaleString()}
                  </td>
                  <td className="text-foreground px-4 py-3 text-right text-sm tabular-nums">
                    {r.assigned.toFixed(0)}
                  </td>
                  <td className="text-foreground px-4 py-3 text-right text-sm tabular-nums">
                    {r.free.toFixed(0)}
                  </td>
                  <td
                    className="px-4 py-3 text-right text-sm font-semibold tabular-nums"
                    style={{ color }}
                  >
                    {r.pct == null ? "—" : `${r.pct.toFixed(0)}%`}
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
  if (recommendations.length === 0) {
    return (
      <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
        <CheckCircleIcon className="text-success mx-auto h-8 w-8" />
        <p className="text-foreground mt-3 text-sm font-medium">All clear</p>
        <p className="text-muted-foreground mt-1 text-xs">
          No <Label kind="entity.instructor" plural lower /> are over-allocated right now.
          Class-coverage and bucket-consumption warnings live on the Classes and Allocations pages.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="border-border bg-background rounded-xl border p-4">
        <p className="text-foreground text-sm font-medium">
          Over-allocated <Label kind="entity.instructor" plural />
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          <Label kind="entity.instructor" plural /> at 95%+ utilization. Class-coverage and
          bucket-consumption warnings live on the Classes and Allocations pages.
        </p>
      </div>
      <ul className="border-border bg-background divide-border divide-y rounded-xl border">
        {recommendations.map((r) => {
          const Icon = r.severity === "critical" ? XCircleIcon : ExclamationTriangleIcon;
          const iconCls = r.severity === "critical" ? "text-destructive" : "text-warning";
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
    </div>
  );
}
