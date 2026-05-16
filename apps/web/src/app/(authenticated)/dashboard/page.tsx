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
import { isManager } from "@/lib/auth/role";
import { Label } from "@/components/labels";
import SetupChecklist from "./setup-checklist";
import type { CapacityRow, Instructor } from "@arbor/shared";

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

  const orgAdmin = await isManager(orgId);
  const todayIso = new Date().toISOString().slice(0, 10);

  // Single query each for tras/projects — returning rows with id +
  // department_id + status. The widgets needing counts compute them
  // client-side; the org-admin rollup uses the same rows. Saves 2-3
  // round-trips compared to separate count + rollup queries.
  const [
    { data: instructors },
    { data: capacityRows },
    { data: trasOpenRows },
    { data: activeProjectRows },
    { data: overdueMilestoneRows },
    { data: conflictSessionRows },
    { data: classRows },
    { data: classAssignmentRows },
    { data: departments },
  ] = await Promise.all([
    supabase
      .from("instructors")
      .select("id, full_name, department, department_id, annual_hours, status")
      .eq("org_id", orgId)
      .eq("is_external", false)
      .is("deleted_at", null)
      .eq("status", "active"),
    supabase.from("v_instructor_capacity").select("*").eq("org_id", orgId),
    supabase
      .from("tras")
      .select("id, department_id, status")
      .eq("org_id", orgId)
      .in("status", ["submitted", "approved"]),
    supabase
      .from("projects")
      .select("id, department_id, status")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .in("status", ["planning", "active"]),
    supabase
      .from("milestones")
      .select("id, name, due_date, project:projects!inner(id, name, status, deleted_at)")
      .eq("org_id", orgId)
      .eq("is_complete", false)
      .lt("due_date", todayIso)
      .order("due_date", { ascending: true })
      .limit(20),
    supabase
      .from("impl_sessions")
      .select(
        "id, conflict_status, scheduled_start, implementation:implementations!inner(id, name, status)",
      )
      .eq("org_id", orgId)
      .neq("conflict_status", "none")
      .order("scheduled_start", { ascending: true })
      .limit(20),
    supabase
      .from("classes")
      .select("id, name, offerings_per_year")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .eq("status", "active"),
    supabase
      .from("class_instructor_assignments")
      .select("class_id, assigned_offerings")
      .eq("org_id", orgId),
    // Departments table is only used by the org-admin rollup. Skip the
    // round-trip when the viewer isn't an admin.
    orgAdmin
      ? supabase.from("departments").select("id, name").eq("org_id", orgId).order("name")
      : Promise.resolve({ data: null }),
  ]);

  // Member count drives the setup checklist (need >1 to be considered
  // "team invited"). Cheap head count; skip when not an admin since the
  // checklist only renders for managers anyway.
  const { count: memberCount } = orgAdmin
    ? await supabase
        .from("org_memberships")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .not("accepted_at", "is", null)
    : { count: null };

  // Compute counts from the fetched rows instead of separate count queries.
  const trasOpenList = (trasOpenRows ?? []) as {
    id: string;
    department_id: string;
    status: string;
  }[];
  const trasToReview = trasOpenList.filter((t) => t.status === "submitted").length;
  const trasApproved = trasOpenList.filter((t) => t.status === "approved").length;
  const activeProjectList = (activeProjectRows ?? []) as {
    id: string;
    department_id: string;
    status: string;
  }[];
  const activeProjectCount = activeProjectList.length;
  // Rollup uses the same rows.
  const projectsForRollup = activeProjectList;
  const trasForRollup = trasOpenList;

  const activeInstructors = (instructors ?? []) as Instructor[];
  const capacities = (capacityRows ?? []) as CapacityRow[];

  const instructorCount = activeInstructors.length;
  const avgUtilization = (() => {
    const withVal = capacities.filter((c) => c.utilization_pct != null);
    if (withVal.length === 0) return 0;
    return withVal.reduce((acc, c) => acc + (c.utilization_pct ?? 0), 0) / withVal.length;
  })();
  const trasNeedingAttention = trasToReview + trasApproved;

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

  // ── At-risk commitments ────────────────────────────────────────────────
  type OverdueMilestone = {
    id: string;
    name: string;
    due_date: string;
    project: { id: string; name: string; status: string; deleted_at: string | null } | null;
  };
  const overdueMilestones = ((overdueMilestoneRows ?? []) as OverdueMilestone[]).filter((m) => {
    const p = m.project;
    if (!p || p.deleted_at) return false;
    return p.status === "planning" || p.status === "active";
  });

  type ConflictSession = {
    id: string;
    conflict_status: string;
    scheduled_start: string;
    implementation: { id: string; name: string; status: string } | null;
  };
  const conflictSessions = (conflictSessionRows ?? []) as ConflictSession[];
  // Roll up to one row per implementation with a count of conflicting sessions.
  const conflictsByImpl = new Map<
    string,
    { id: string; name: string; count: number; severity: string }
  >();
  for (const s of conflictSessions) {
    const impl = s.implementation;
    if (!impl) continue;
    const cur = conflictsByImpl.get(impl.id);
    const severity = s.conflict_status === "full" ? "full" : "partial";
    if (cur) {
      cur.count += 1;
      if (severity === "full") cur.severity = "full";
    } else {
      conflictsByImpl.set(impl.id, { id: impl.id, name: impl.name, count: 1, severity });
    }
  }
  const conflictRollups = Array.from(conflictsByImpl.values()).sort((a, b) =>
    a.severity === b.severity ? b.count - a.count : a.severity === "full" ? -1 : 1,
  );

  type ClassRow = { id: string; name: string; offerings_per_year: number };
  type AssignmentRow = { class_id: string; assigned_offerings: number };
  const classRowsTyped = (classRows ?? []) as ClassRow[];
  const assignmentRowsTyped = (classAssignmentRows ?? []) as AssignmentRow[];
  const assignedByClassId = new Map<string, number>();
  for (const a of assignmentRowsTyped) {
    assignedByClassId.set(
      a.class_id,
      (assignedByClassId.get(a.class_id) ?? 0) + a.assigned_offerings,
    );
  }
  const coverageGaps = classRowsTyped
    .map((c) => ({
      id: c.id,
      name: c.name,
      target: c.offerings_per_year,
      assigned: assignedByClassId.get(c.id) ?? 0,
    }))
    .filter((c) => c.assigned < c.target)
    .map((c) => ({ ...c, gap: c.target - c.assigned }))
    .sort((a, b) => b.gap - a.gap);

  function daysOverdue(iso: string): number {
    const due = new Date(iso).getTime();
    const now = new Date(todayIso).getTime();
    return Math.max(0, Math.round((now - due) / 86_400_000));
  }

  // ── Department capacity totals ─────────────────────────────────────────
  // Sum across active instructors visible to the user (RLS already scopes
  // to current department for non-admins; for org admins it's org-wide).
  const totalAvailableHours = capacities.reduce((s, c) => s + c.annual_hours, 0);
  const totalAssignedHours = capacities.reduce((s, c) => s + c.assigned_hours, 0);
  const freeHours = Math.max(0, totalAvailableHours - totalAssignedHours);
  const overflowHours = Math.max(0, totalAssignedHours - totalAvailableHours);
  const utilizationPct =
    totalAvailableHours > 0 ? (totalAssignedHours / totalAvailableHours) * 100 : 0;

  // ── Per-department rollup (org admins only) ────────────────────────────
  type DeptRollup = {
    id: string;
    name: string;
    instructorCount: number;
    projectCount: number;
    traCount: number;
    avgUtilization: number | null;
  };
  const deptRollups: DeptRollup[] = orgAdmin
    ? ((departments ?? []) as { id: string; name: string }[]).map((d) => {
        const deptInstructors = activeInstructors.filter((i) => i.department_id === d.id);
        const deptCapacities = capacities.filter(
          (c) =>
            deptInstructors.some((di) => di.id === c.instructor_id) && c.utilization_pct != null,
        );
        const avg =
          deptCapacities.length > 0
            ? deptCapacities.reduce((s, c) => s + (c.utilization_pct ?? 0), 0) /
              deptCapacities.length
            : null;
        const projects = projectsForRollup.filter((p) => p.department_id === d.id).length;
        const tras = trasForRollup.filter((t) => t.department_id === d.id).length;
        return {
          id: d.id,
          name: d.name,
          instructorCount: deptInstructors.length,
          projectCount: projects,
          traCount: tras,
          avgUtilization: avg,
        };
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your organization's training capacity."
      />

      <div className="space-y-6 p-6">
        {/* Setup checklist — shows only for managers on brand-new orgs.
            Disappears as items are completed. */}
        {orgAdmin && (
          <SetupChecklist
            hasMembers={(memberCount ?? 0) > 1}
            hasInstructors={(instructors ?? []).length > 0}
            hasDepartments={(departments ?? []).length > 1}
            hasClasses={(classRows ?? []).length > 0}
          />
        )}

        {/* Quick actions — top of page so common starts are one click away */}
        <section className="border-border bg-background rounded-xl border p-4">
          <h3 className="text-foreground mb-3 text-sm font-semibold">Quick actions</h3>
          <div className="flex flex-wrap gap-2">
            <QuickAction
              href="/instructors"
              icon={<UserPlusIcon className="h-4 w-4" />}
              label={
                <>
                  Add <Label kind="entity.instructor" />
                </>
              }
            />
            <QuickAction
              href="/tras"
              icon={<DocumentPlusIcon className="h-4 w-4" />}
              label="New Work Intake"
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

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            href="/tras"
            icon={<ClipboardDocumentCheckIcon className="h-4 w-4" />}
            label="Work intake needing attention"
            value={trasNeedingAttention.toString()}
            sub={
              trasNeedingAttention === 0
                ? "All caught up"
                : `${String(trasToReview)} to review · ${String(trasApproved)} ready to convert`
            }
            tone={trasNeedingAttention >= 5 ? "warning" : trasNeedingAttention > 0 ? "info" : "ok"}
          />
          <KpiCard
            href="/projects"
            icon={<BriefcaseIcon className="h-4 w-4" />}
            label="Active projects"
            value={activeProjectCount.toString()}
            sub="planning or in flight"
            tone="ok"
          />
          <KpiCard
            href="/instructors"
            icon={<UserGroupIcon className="h-4 w-4" />}
            label={
              <>
                Active <Label kind="entity.instructor" plural lower />
              </>
            }
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

        {/* Department capacity — total available vs assigned vs free */}
        <CapacityChartCard
          totalAvailableHours={totalAvailableHours}
          totalAssignedHours={totalAssignedHours}
          freeHours={freeHours}
          overflowHours={overflowHours}
          utilizationPct={utilizationPct}
          instructorCount={instructorCount}
        />

        {/* Capacity health — full width */}
        <section className="border-border bg-background rounded-xl border p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-foreground text-base font-bold tracking-tight">
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
            <Label kind="entity.instructor" plural={balancedCount !== 1} lower /> in the balanced
            range (40–79%).
          </p>
        </section>

        {/* At-risk commitments — full width */}
        <section className="border-border bg-background rounded-xl border p-5">
          <div className="mb-4">
            <h3 className="text-foreground text-base font-bold tracking-tight">
              At-risk commitments
            </h3>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Deadlines slipping, schedule conflicts, and coverage gaps that need a decision.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-3">
            {/* Overdue milestones */}
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-semibold">
                Overdue milestones{" "}
                <span className="text-muted-foreground font-normal normal-case tracking-normal">
                  ({overdueMilestones.length})
                </span>
              </p>
              {overdueMilestones.length === 0 ? (
                <p className="text-muted-foreground py-3 text-sm italic">
                  Nothing overdue right now.
                </p>
              ) : (
                <ul className="divide-border divide-y">
                  {overdueMilestones.slice(0, 5).map((m) => {
                    const days = daysOverdue(m.due_date);
                    return (
                      <li key={m.id} className="py-2.5">
                        <Link
                          href={`/projects/${m.project?.id ?? ""}`}
                          className="text-foreground hover:text-primary block text-sm font-medium"
                        >
                          {m.project?.name ?? "Project"}
                        </Link>
                        <p className="text-muted-foreground truncate text-xs">{m.name}</p>
                        <p
                          className="mt-0.5 text-xs font-medium"
                          style={{ color: "var(--destructive)" }}
                        >
                          {days} day{days === 1 ? "" : "s"} overdue
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Schedule conflicts */}
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-semibold">
                Schedule conflicts{" "}
                <span className="text-muted-foreground font-normal normal-case tracking-normal">
                  ({conflictRollups.length})
                </span>
              </p>
              {conflictRollups.length === 0 ? (
                <p className="text-muted-foreground py-3 text-sm italic">All sessions clear.</p>
              ) : (
                <ul className="divide-border divide-y">
                  {conflictRollups.slice(0, 5).map((c) => (
                    <li key={c.id} className="py-2.5">
                      <Link
                        href={`/training-planner/${c.id}/schedule`}
                        className="text-foreground hover:text-primary block text-sm font-medium"
                      >
                        {c.name}
                      </Link>
                      <p
                        className="mt-0.5 text-xs font-medium"
                        style={{
                          color:
                            c.severity === "full"
                              ? "var(--destructive)"
                              : // Darkened amber so it passes WCAG AA on the cream background.
                                "color-mix(in oklab, var(--highlight) 35%, var(--foreground))",
                        }}
                      >
                        {c.count} session{c.count === 1 ? "" : "s"} ·{" "}
                        {c.severity === "full" ? "full conflict" : "partial conflict"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Coverage gaps */}
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-semibold">
                Coverage gaps{" "}
                <span className="text-muted-foreground font-normal normal-case tracking-normal">
                  ({coverageGaps.length})
                </span>
              </p>
              {coverageGaps.length === 0 ? (
                <p className="text-muted-foreground py-3 text-sm italic">
                  Every class is fully staffed.
                </p>
              ) : (
                <ul className="divide-border divide-y">
                  {coverageGaps.slice(0, 5).map((c) => (
                    <li key={c.id} className="py-2.5">
                      <Link
                        href={`/classes/${c.id}`}
                        className="text-foreground hover:text-primary block text-sm font-medium"
                      >
                        {c.name}
                      </Link>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        <span className="text-foreground font-medium tabular-nums">
                          {c.assigned}
                        </span>
                        <span className="tabular-nums"> / {c.target}</span> offerings staffed{" "}
                        <span style={{ color: "var(--destructive)" }}>(−{c.gap})</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Org-admin rollup — only renders for org admins; one row per
            department in the org with quick counts. Lets a CMO/director
            see the whole org without leaving the dashboard. */}
        {orgAdmin && deptRollups.length > 1 && (
          <section className="border-border bg-background rounded-xl border p-5">
            <div className="mb-4">
              <h3 className="text-foreground text-base font-bold tracking-tight">
                Departments overview
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Org-wide rollup. Visible to org admins only.{" "}
                <Link href="/admin/departments" className="text-primary hover:underline">
                  Manage departments →
                </Link>
              </p>
            </div>

            <div className="border-border overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-border bg-surface border-b">
                  <tr>
                    <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                      Department
                    </th>
                    <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                      <Label kind="entity.instructor" plural />
                    </th>
                    <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                      Active projects
                    </th>
                    <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                      Open intake
                    </th>
                    <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
                      Avg utilization
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {deptRollups.map((d) => {
                    const utilColor =
                      d.avgUtilization == null
                        ? "var(--muted-foreground)"
                        : d.avgUtilization >= 95
                          ? "var(--destructive)"
                          : d.avgUtilization >= 80
                            ? "var(--highlight)"
                            : "var(--foreground)";
                    return (
                      <tr key={d.id} className="hover:bg-surface">
                        <td className="text-foreground px-4 py-3 font-medium">{d.name}</td>
                        <td className="text-foreground px-4 py-3 text-right tabular-nums">
                          {d.instructorCount}
                        </td>
                        <td className="text-foreground px-4 py-3 text-right tabular-nums">
                          {d.projectCount}
                        </td>
                        <td className="text-foreground px-4 py-3 text-right tabular-nums">
                          {d.traCount}
                        </td>
                        <td
                          className="px-4 py-3 text-right text-sm font-semibold tabular-nums"
                          style={{ color: utilColor }}
                        >
                          {d.avgUtilization == null ? "—" : `${d.avgUtilization.toFixed(0)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Recent activity moved to /admin/audit-log; not on the dashboard. */}
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
  label: React.ReactNode;
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
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <span
          aria-hidden="true"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: styles.iconBg, color: styles.iconFg }}
        >
          {icon}
        </span>
      </div>
      <p
        className="mt-2 text-3xl font-bold tabular-nums tracking-tight"
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
  label: React.ReactNode;
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
        <p className="text-muted-foreground text-xs font-semibold">
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

/**
 * Aggregate capacity for the visible scope (current department, or org-wide
 * for org admins). Shows total available, total assigned, and free hours
 * with a horizontal stacked bar so a manager can see at a glance how much
 * room remains to take on more work.
 */
function CapacityChartCard({
  totalAvailableHours,
  totalAssignedHours,
  freeHours,
  overflowHours,
  utilizationPct,
  instructorCount,
}: {
  totalAvailableHours: number;
  totalAssignedHours: number;
  freeHours: number;
  overflowHours: number;
  utilizationPct: number;
  instructorCount: number;
}) {
  // Bar width: assigned portion (up to 100%) + an overflow bar tacked on
  // beyond that for over-allocation. Capped at 130% so the rendering
  // doesn't run off the card.
  const assignedClamped = Math.min(utilizationPct, 100);
  const overflowPct = utilizationPct > 100 ? Math.min(utilizationPct - 100, 30) : 0;

  const headlineColor =
    utilizationPct >= 95
      ? "var(--destructive)"
      : utilizationPct >= 80
        ? "var(--highlight)"
        : "var(--foreground)";

  return (
    <section className="border-border bg-background rounded-xl border p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-foreground text-base font-bold tracking-tight">
            Department capacity
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Annual hours across {instructorCount.toString()} active instructor
            {instructorCount === 1 ? "" : "s"}.
          </p>
        </div>
        <p
          className="text-2xl font-bold tabular-nums tracking-tight"
          style={{ color: headlineColor }}
        >
          {utilizationPct.toFixed(0)}% utilized
        </p>
      </div>

      {/* Stacked bar — assigned (primary) + overflow (destructive) on the
          background canvas of total available capacity. */}
      <div
        className="relative h-3 overflow-hidden rounded-full"
        style={{ backgroundColor: "color-mix(in oklab, var(--border) 70%, transparent)" }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-y-0 left-0 h-full rounded-l-full"
          style={{
            width: `${String(assignedClamped)}%`,
            backgroundColor: "var(--primary)",
          }}
        />
        {overflowPct > 0 && (
          <div
            className="absolute inset-y-0 h-full"
            style={{
              left: "100%",
              width: `${String(overflowPct)}%`,
              backgroundColor: "var(--destructive)",
              transform: "translateX(-1px)",
            }}
          />
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CapacityStat
          label="Total available"
          value={totalAvailableHours}
          dotColor="color-mix(in oklab, var(--border) 70%, transparent)"
        />
        <CapacityStat label="Assigned" value={totalAssignedHours} dotColor="var(--primary)" />
        <CapacityStat
          label={overflowHours > 0 ? "Over-assigned" : "Free to assign"}
          value={overflowHours > 0 ? overflowHours : freeHours}
          dotColor={overflowHours > 0 ? "var(--destructive)" : "var(--accent)"}
          highlight={overflowHours > 0}
        />
      </div>
    </section>
  );
}

function CapacityStat({
  label,
  value,
  dotColor,
  highlight,
}: {
  label: string;
  value: number;
  dotColor: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
      </div>
      <p
        className="mt-1 text-xl font-bold tabular-nums"
        style={{ color: highlight ? "var(--destructive)" : "var(--foreground)" }}
      >
        {Math.round(value).toLocaleString()}
        <span className="text-muted-foreground ml-1 text-xs font-normal">h</span>
      </p>
    </div>
  );
}
