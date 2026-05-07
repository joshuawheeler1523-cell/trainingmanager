import Link from "next/link";
import {
  UserPlusIcon,
  DocumentPlusIcon,
  FolderPlusIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
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

  const [{ data: instructors }, { data: capacityRows }, { data: auditRows }] = await Promise.all([
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
  ]);

  const activeInstructors = (instructors ?? []) as Instructor[];
  const capacities = (capacityRows ?? []) as CapacityRow[];
  const recentActivity = (auditRows ?? []) as AuditEntry[];

  const instructorCount = activeInstructors.length;
  const totalAllocationHours = activeInstructors.reduce((acc, i) => acc + i.annual_hours, 0);
  const avgUtilization = (() => {
    const withVal = capacities.filter((c) => c.utilization_pct != null);
    if (withVal.length === 0) return 0;
    return withVal.reduce((acc, c) => acc + (c.utilization_pct ?? 0), 0) / withVal.length;
  })();

  // At-risk: utilization_pct >= 80 (covers at_risk + over_allocated)
  const atRisk = capacities
    .filter((c) => c.utilization_pct != null && c.utilization_pct >= 80)
    .sort((a, b) => (b.utilization_pct ?? 0) - (a.utilization_pct ?? 0));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your organization's training capacity."
      />

      <div className="space-y-6 p-6">
        {/* Stats row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Active instructors"
            value={instructorCount.toString()}
            sub="across all departments"
          />
          <StatCard
            label="Total allocation hours"
            value={totalAllocationHours.toLocaleString()}
            sub="annual capacity (active only)"
          />
          <StatCard
            label="Average utilization"
            value={`${avgUtilization.toFixed(1)}%`}
            sub={
              avgUtilization >= 80
                ? "Watch — approaching cap"
                : avgUtilization >= 40
                  ? "Healthy"
                  : "Light"
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* At-risk instructors */}
          <section className="border-border bg-background rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-foreground text-sm font-semibold">At-risk instructors</h3>
              <span className="text-muted-foreground text-xs">
                {atRisk.length} {atRisk.length === 1 ? "person" : "people"} at 80%+
              </span>
            </div>
            {atRisk.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No one is over 80% utilization right now.
              </p>
            ) : (
              <ul className="divide-border divide-y">
                {atRisk.slice(0, 8).map((c) => {
                  const pct = c.utilization_pct ?? 0;
                  const color =
                    pct >= 95 ? "text-destructive" : "text-amber-600 dark:text-amber-400";
                  return (
                    <li key={c.instructor_id} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <ExclamationTriangleIcon className={`h-4 w-4 ${color}`} />
                        <Link
                          href={`/instructors/${c.instructor_id}`}
                          className="text-foreground text-sm font-medium hover:underline"
                        >
                          {c.full_name}
                        </Link>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ${color}`}>
                        {pct.toFixed(0)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

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

function StatCard({
  label,
  value,
  sub,
  tone = "ok",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warning" | "danger";
}) {
  const valueCls =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  return (
    <div className="border-border bg-background rounded-xl border p-4">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueCls}`}>{value}</p>
      {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
    </div>
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
