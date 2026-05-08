import Link from "next/link";
import {
  UserPlusIcon,
  DocumentPlusIcon,
  FolderPlusIcon,
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  BriefcaseIcon,
  UserGroupIcon,
  ChartPieIcon,
} from "@heroicons/react/20/solid";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { CapacityRow, Instructor } from "@arbor/shared";

type AuditEntry = {
  id: number;
  operation: string;
  table_name: string;
  record_id: string;
  changed_fields: string[] | null;
  occurred_at: string;
  actor_id: string | null;
};

const RECORD_LINK: Record<string, (id: string) => string> = {
  instructors: (id) => `/instructors/${id}`,
  classes: (id) => `/classes/${id}`,
  skills: () => `/skills`,
  allocation_buckets: () => `/allocations`,
  global_allocations: () => `/allocations`,
  allocation_groups: () => `/allocations`,
  group_allocations: () => `/allocations`,
  individual_allocations: () => `/allocations`,
  recurring_tasks: () => `/allocations`,
  ad_hoc_tasks: () => `/allocations`,
};

function recordLink(table: string, id: string): string | null {
  return RECORD_LINK[table]?.(id) ?? null;
}

function describeOperation(table: string, op: string): string {
  const verb = op === "INSERT" ? "added" : op === "UPDATE" ? "updated" : "deleted";
  // Pretty-print table name (instructors → instructor)
  const noun = table.replace(/_/g, " ").replace(/s$/, "");
  return `${verb} ${noun}`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${String(min)}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${String(hr)}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${String(day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function DashboardPage() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);

  if (!orgId) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Overview of your organization." />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  const [
    { data: instructors },
    { data: capacityRows },
    { data: auditRows },
    { count: trasToReview },
    { count: trasApproved },
    { count: activeProjectCount },
  ] = await Promise.all([
    supabase
      .from("instructors")
      .select("*")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .eq("status", "active"),
    supabase.from("v_instructor_capacity").select("*").eq("org_id", orgId),
    supabase
      .from("audit_log")
      .select("id, operation, table_name, record_id, changed_fields, occurred_at, actor_id")
      .eq("org_id", orgId)
      .order("occurred_at", { ascending: false })
      .limit(10),
    supabase
      .from("tras")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "submitted"),
    supabase
      .from("tras")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "approved"),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .in("status", ["planning", "active"]),
  ]);

  const activeInstructors = (instructors ?? []) as Instructor[];
  const capacities = (capacityRows ?? []) as CapacityRow[];
  const recentActivity = (auditRows ?? []) as AuditEntry[];

  const instructorCount = activeInstructors.length;
  const avgUtilization = (() => {
    const withVal = capacities.filter((c) => c.utilization_pct != null);
    if (withVal.length === 0) return 0;
    return withVal.reduce((acc, c) => acc + (c.utilization_pct ?? 0), 0) / withVal.length;
  })();
  const trasNeedingAttention = (trasToReview ?? 0) + (trasApproved ?? 0);

  // Department lookup so the capacity widget can show context per row.
  const deptByInstructorId = new Map(activeInstructors.map((i) => [i.id, i.department ?? null]));

  // Capacity bands (thresholds match v_instructor_capacity in the DB):
  //   over_allocated  ≥ 95
  //   at_risk         80–94
  //   balanced        40–79
  //   under_utilized  < 40
  type RowWithDept = CapacityRow & { department: string | null };
  const withDept: RowWithDept[] = capacities
    .filter((c) => c.utilization_pct != null)
    .map((c) => ({ ...c, department: deptByInstructorId.get(c.instructor_id) ?? null }));

  const overAllocated = withDept
    .filter((c) => (c.utilization_pct ?? 0) >= 80)
    .sort((a, b) => (b.utilization_pct ?? 0) - (a.utilization_pct ?? 0));
  const underUtilized = withDept
    .filter((c) => (c.utilization_pct ?? 0) < 40)
    .sort((a, b) => (a.utilization_pct ?? 0) - (b.utilization_pct ?? 0));
  const balancedCount = withDept.filter(
    (c) => (c.utilization_pct ?? 0) >= 40 && (c.utilization_pct ?? 0) < 80,
  ).length;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your organization's training capacity."
      />

      <div className="space-y-6 p-6">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            href="/tras"
            icon={<ClipboardDocumentCheckIcon className="h-4 w-4" />}
            label="TRAs needing attention"
            value={trasNeedingAttention.toString()}
            sub={
              trasNeedingAttention === 0
                ? "All caught up"
                : `${String(trasToReview ?? 0)} to review · ${String(trasApproved ?? 0)} ready to convert`
            }
            tone={trasNeedingAttention >= 5 ? "warning" : trasNeedingAttention > 0 ? "info" : "ok"}
          />
          <KpiCard
            href="/projects"
            icon={<BriefcaseIcon className="h-4 w-4" />}
            label="Active projects"
            value={(activeProjectCount ?? 0).toString()}
            sub="planning or in flight"
            tone="ok"
          />
          <KpiCard
            href="/instructors"
            icon={<UserGroupIcon className="h-4 w-4" />}
            label="Active instructors"
            value={instructorCount.toString()}
            sub="across all departments"
            tone="ok"
          />
          <KpiCard
            href="/instructors"
            icon={<ChartPieIcon className="h-4 w-4" />}
            label="Average utilization"
            value={`${avgUtilization.toFixed(1)}%`}
            sub={
              avgUtilization >= 95
                ? "Over — at risk of burnout"
                : avgUtilization >= 80
                  ? "Watch — approaching cap"
                  : avgUtilization >= 40
                    ? "Healthy range"
                    : "Light — capacity available"
            }
            tone={avgUtilization >= 95 ? "danger" : avgUtilization >= 80 ? "warning" : "ok"}
          />
        </div>

        {/* Quick actions */}
        <section className="border-border bg-background rounded-xl border p-4">
          <h3 className="text-foreground mb-3 text-sm font-semibold">Quick actions</h3>
          <div className="flex flex-wrap gap-2">
            <QuickAction
              href="/instructors"
              icon={<UserPlusIcon className="h-4 w-4" />}
              label="Add Instructor"
            />
            <QuickAction
              href="/tras"
              icon={<DocumentPlusIcon className="h-4 w-4" />}
              label="New TRA"
            />
            <QuickAction
              href="/projects"
              icon={<FolderPlusIcon className="h-4 w-4" />}
              label="New Project"
            />
            <QuickAction
              href="/training-planner"
              icon={<CalendarDaysIcon className="h-4 w-4" />}
              label="New Implementation"
            />
          </div>
        </section>

        {/* Capacity health — full width */}
        <section className="border-border bg-background rounded-xl border p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-foreground font-serif text-base tracking-tight">
                Capacity health
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Where to rebalance assignments first.
              </p>
            </div>
            <Link href="/instructors" className="text-primary text-xs font-medium hover:underline">
              View all instructors →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
            <CapacityColumn
              title="Over-allocated"
              caption="80% and above — at risk of burnout"
              rows={overAllocated}
              emptyMessage="Nobody is over 80% utilization right now."
            />
            <CapacityColumn
              title="Under-utilized"
              caption="Below 40% — available for new work"
              rows={underUtilized}
              emptyMessage="Nobody is under 40% utilization right now."
            />
          </div>

          <p className="text-muted-foreground border-border mt-5 border-t pt-3 text-xs">
            <span className="text-foreground font-medium tabular-nums">{balancedCount}</span>{" "}
            instructor{balancedCount === 1 ? "" : "s"} in the balanced range (40–79%).
          </p>
        </section>

        <div className="grid grid-cols-1 gap-6">
          {/* Recent activity */}
          <section className="border-border bg-background rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-foreground text-sm font-semibold">Recent activity</h3>
              <Link
                href="/admin/audit-log"
                className="text-primary text-xs font-medium hover:underline"
              >
                View all →
              </Link>
            </div>
            {recentActivity.length === 0 ? (
              <p className="text-muted-foreground text-sm">No recent changes.</p>
            ) : (
              <ul className="divide-border divide-y">
                {recentActivity.map((e) => {
                  const link = recordLink(e.table_name, e.record_id);
                  const description = describeOperation(e.table_name, e.operation);
                  return (
                    <li key={e.id} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-foreground text-sm">
                          Someone {description}{" "}
                          {link ? (
                            <Link href={link} className="text-primary font-medium hover:underline">
                              read more
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-xs">({e.table_name})</span>
                          )}
                        </p>
                        {e.changed_fields && e.changed_fields.length > 0 && (
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            Fields: {e.changed_fields.join(", ")}
                          </p>
                        )}
                      </div>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {formatRelative(e.occurred_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

type KpiTone = "ok" | "info" | "warning" | "danger";

function kpiToneStyles(tone: KpiTone): { value: string; iconBg: string; iconFg: string } {
  switch (tone) {
    case "danger":
      return {
        value: "var(--destructive)",
        iconBg: "color-mix(in oklab, var(--destructive) 14%, transparent)",
        iconFg: "var(--destructive)",
      };
    case "warning":
      return {
        value: "var(--highlight)",
        iconBg: "color-mix(in oklab, var(--highlight) 25%, transparent)",
        iconFg: "color-mix(in oklab, var(--highlight) 90%, var(--foreground))",
      };
    case "info":
      return {
        value: "var(--primary)",
        iconBg: "color-mix(in oklab, var(--primary) 14%, transparent)",
        iconFg: "var(--primary)",
      };
    case "ok":
    default:
      return {
        value: "var(--foreground)",
        iconBg: "color-mix(in oklab, var(--accent) 22%, transparent)",
        iconFg: "color-mix(in oklab, var(--accent) 90%, var(--foreground))",
      };
  }
}

function KpiCard({
  href,
  icon,
  label,
  value,
  sub,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: KpiTone;
}) {
  const styles = kpiToneStyles(tone);
  return (
    <Link
      href={href}
      className="border-border bg-background hover:border-primary group block rounded-xl border p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-[0.06em]">
          {label}
        </p>
        <span
          aria-hidden="true"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: styles.iconBg, color: styles.iconFg }}
        >
          {icon}
        </span>
      </div>
      <p
        className="mt-2 font-serif text-3xl tabular-nums tracking-tight"
        style={{ color: styles.value }}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">{sub}</p>
    </Link>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
    >
      {icon}
      {label}
    </Link>
  );
}

type CapacityRowWithDept = CapacityRow & { department: string | null };

function CapacityColumn({
  title,
  caption,
  rows,
  emptyMessage,
}: {
  title: string;
  caption: string;
  rows: CapacityRowWithDept[];
  emptyMessage: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-foreground text-xs font-semibold uppercase tracking-[0.08em]">
          {title}{" "}
          <span className="text-muted-foreground font-normal normal-case tracking-normal">
            ({rows.length})
          </span>
        </p>
        <p className="text-muted-foreground text-[11px]">{caption}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-3 text-sm italic">{emptyMessage}</p>
      ) : (
        <ul className="divide-border divide-y">
          {rows.slice(0, 6).map((r) => (
            <li key={r.instructor_id} className="py-2.5">
              <CapacityRowItem row={r} />
            </li>
          ))}
        </ul>
      )}
      {rows.length > 6 && (
        <p className="text-muted-foreground mt-2 text-[11px]">
          +{rows.length - 6} more — see the instructors page
        </p>
      )}
    </div>
  );
}

function bandFor(pct: number): {
  label: string;
  fg: string;
  bg: string;
} {
  if (pct >= 95) {
    return {
      label: "Over",
      fg: "var(--destructive)",
      bg: "color-mix(in oklab, var(--destructive) 18%, transparent)",
    };
  }
  if (pct >= 80) {
    return {
      label: "At risk",
      fg: "var(--highlight)",
      bg: "color-mix(in oklab, var(--highlight) 30%, transparent)",
    };
  }
  if (pct < 40) {
    return {
      label: "Light",
      fg: "var(--accent)",
      bg: "color-mix(in oklab, var(--accent) 30%, transparent)",
    };
  }
  return {
    label: "Healthy",
    fg: "var(--primary)",
    bg: "color-mix(in oklab, var(--primary) 18%, transparent)",
  };
}

function CapacityRowItem({ row }: { row: CapacityRowWithDept }) {
  const pct = row.utilization_pct ?? 0;
  const band = bandFor(pct);
  // Cap the bar at 110% of the track so over-allocated rows still show
  // a visible overflow without breaking layout.
  const fillPct = Math.min(pct, 110);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(120px,160px)_3.25rem] items-center gap-3">
      <div className="min-w-0">
        <Link
          href={`/instructors/${row.instructor_id}`}
          className="text-foreground hover:text-primary block truncate text-sm font-medium"
        >
          {row.full_name}
        </Link>
        {row.department && (
          <p className="text-muted-foreground truncate text-xs">{row.department}</p>
        )}
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full"
        style={{ backgroundColor: "color-mix(in oklab, var(--border) 70%, transparent)" }}
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${String(fillPct)}%`, backgroundColor: band.fg }}
        />
      </div>
      <span className="text-right text-sm font-semibold tabular-nums" style={{ color: band.fg }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}
