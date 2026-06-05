import Link from "next/link";
import PageHeader from "@/components/ui/page-header";
import { Eyebrow } from "@/components/ui";
import { REPORT_METADATA, REPORT_SLUGS } from "@arbor/shared";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getDepartmentScope } from "@/lib/auth/current-department";
import { runReport } from "@/lib/reports/registry";

const CATEGORY_LABEL = {
  capacity: "Capacity",
  delivery: "Delivery",
  competency: "Competency",
} as const;

type Tone = "ok" | "info" | "warning" | "danger";

export default async function ReportsPage() {
  const [supabase, orgId, scope] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getDepartmentScope(),
  ]);
  const departmentId = scope.all ? null : scope.id;

  // Run all five canonical reports with default filters, in parallel. Each is
  // best-effort: a throw becomes null and its KPI card shows "—".
  const results = orgId
    ? await Promise.all([
        runReport("allocation", supabase, orgId, departmentId, {}).catch(() => null),
        runReport("workload", supabase, orgId, departmentId, {}).catch(() => null),
        runReport("coverage", supabase, orgId, departmentId, {}).catch(() => null),
        runReport("project-status", supabase, orgId, departmentId, {}).catch(() => null),
        runReport("skill-gap", supabase, orgId, departmentId, {}).catch(() => null),
      ])
    : [null, null, null, null, null];

  // Discriminated-union narrowing: each result is the dataset for the slug we
  // ran it with, or null if it threw (so one failing report can't blank the page).
  const r = results;
  const allocation = r[0] && r[0].slug === "allocation" ? r[0].data : null;
  const workload = r[1] && r[1].slug === "workload" ? r[1].data : null;
  const coverage = r[2] && r[2].slug === "coverage" ? r[2].data : null;
  const projectStatus = r[3] && r[3].slug === "project-status" ? r[3].data : null;
  const skillGap = r[4] && r[4].slug === "skill-gap" ? r[4].data : null;

  // ── Derive headline KPIs ──────────────────────────────────────────────────
  const utilRows = (workload?.rows ?? []).filter((r) => r.utilization_pct != null);
  const avgUtil =
    utilRows.length > 0
      ? utilRows.reduce((s, r) => s + (r.utilization_pct ?? 0), 0) / utilRows.length
      : null;
  const overAllocated = (workload?.rows ?? []).filter(
    (r) => r.utilization_band === "over_allocated",
  ).length;

  const unallocatedHours = allocation?.unallocated_hours ?? null;

  const coverageGaps = (coverage?.rows ?? []).filter(
    (r) => r.assigned_offerings < r.target_offerings || r.has_no_assignee || r.has_skill_gap,
  ).length;

  const atRiskProjects = (projectStatus?.rows ?? []).filter((r) => r.overdue_task_count > 0).length;
  const totalProjects = (projectStatus?.rows ?? []).length;

  const expiringCerts = skillGap?.expiring_certs.length ?? null;

  const histogram = allocation?.utilization_histogram ?? [];
  const histTotal = histogram.reduce((s, b) => s + b.count, 0);

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        description="Live snapshot across capacity, delivery, and competency — drill into any metric for the full report with filters and PDF / Excel / CSV export."
      />

      <div className="space-y-8 p-6">
        {/* ── KPI strip ──────────────────────────────────────────────────── */}
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <Eyebrow>At a glance</Eyebrow>
            <Link
              href="/reports/saved"
              className="text-muted-foreground hover:text-foreground font-mono text-[10.5px] uppercase tracking-[0.04em]"
            >
              Saved reports →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              href="/reports/workload"
              label="Avg utilization"
              value={avgUtil == null ? "—" : `${avgUtil.toFixed(0)}%`}
              sub={
                avgUtil == null
                  ? "No instructor data"
                  : avgUtil >= 95
                    ? "Over — burnout risk"
                    : avgUtil >= 80
                      ? "Watch — near cap"
                      : avgUtil >= 40
                        ? "Healthy range"
                        : "Light — room to spare"
              }
              tone={
                avgUtil == null ? "ok" : avgUtil >= 95 ? "danger" : avgUtil >= 80 ? "warning" : "ok"
              }
            />
            <KpiCard
              href="/reports/workload"
              label="Over-allocated"
              value={workload ? String(overAllocated) : "—"}
              sub="instructors ≥ 95%"
              tone={overAllocated > 0 ? "warning" : "ok"}
            />
            <KpiCard
              href="/reports/allocation"
              label="Unallocated hours"
              value={unallocatedHours == null ? "—" : Math.round(unallocatedHours).toLocaleString()}
              sub="free annual capacity"
              tone="info"
            />
            <KpiCard
              href="/reports/coverage"
              label="Coverage gaps"
              value={coverage ? String(coverageGaps) : "—"}
              sub="classes under target"
              tone={coverageGaps > 0 ? "warning" : "ok"}
            />
            <KpiCard
              href="/reports/project-status"
              label="At-risk projects"
              value={projectStatus ? String(atRiskProjects) : "—"}
              sub={`of ${String(totalProjects)} with overdue work`}
              tone={atRiskProjects > 0 ? "danger" : "ok"}
            />
            <KpiCard
              href="/reports/skill-gap"
              label="Expiring certs"
              value={expiringCerts == null ? "—" : String(expiringCerts)}
              sub="next 90 days"
              tone={expiringCerts && expiringCerts > 0 ? "warning" : "ok"}
            />
          </div>
        </section>

        {/* ── Utilization distribution mini-chart ──────────────────────────── */}
        {histTotal > 0 && (
          <section className="border-border bg-background rounded-xl border p-5">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <Eyebrow>Utilization distribution</Eyebrow>
              <Link
                href="/reports/workload"
                className="text-muted-foreground hover:text-foreground font-mono text-[10.5px] uppercase tracking-[0.04em]"
              >
                Full workload report →
              </Link>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
              {BANDS.map((b) => {
                const count = histogram.find((h) => h.band === b.key)?.count ?? 0;
                const pct = (count / histTotal) * 100;
                if (pct === 0) return null;
                return (
                  <div
                    key={b.key}
                    style={{ width: `${String(pct)}%`, backgroundColor: b.color }}
                    title={`${b.label}: ${String(count)}`}
                  />
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {BANDS.map((b) => {
                const count = histogram.find((h) => h.band === b.key)?.count ?? 0;
                return (
                  <span
                    key={b.key}
                    className="text-muted-foreground inline-flex items-center gap-1.5 text-xs"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: b.color }}
                      aria-hidden="true"
                    />
                    {b.label}
                    <b className="text-foreground tabular-nums">{count}</b>
                  </span>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Report catalog ───────────────────────────────────────────────── */}
        <section>
          <Eyebrow className="mb-3">All reports</Eyebrow>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {REPORT_SLUGS.map((slug) => {
              const meta = REPORT_METADATA[slug];
              return (
                <Link
                  key={slug}
                  href={`/reports/${slug}`}
                  className="border-border bg-background hover:border-foreground/30 group block rounded-xl border p-5 transition-colors"
                >
                  <Eyebrow variant="mute">{CATEGORY_LABEL[meta.category]}</Eyebrow>
                  <p className="font-display text-foreground group-hover:text-primary mt-2 text-lg font-medium leading-tight tracking-[-0.005em]">
                    {meta.name}
                  </p>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {meta.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

const BANDS = [
  { key: "under_utilized" as const, label: "Under", color: "#8b9d83" },
  { key: "balanced" as const, label: "Balanced", color: "var(--forest)" },
  { key: "at_risk" as const, label: "At risk", color: "var(--persimmon-deep)" },
  { key: "over_allocated" as const, label: "Over", color: "var(--red)" },
];

function toneStyles(tone: Tone): { value: string } {
  switch (tone) {
    case "danger":
      return { value: "var(--red)" };
    case "warning":
      return { value: "var(--persimmon-deep)" };
    case "info":
      return { value: "var(--forest)" };
    case "ok":
    default:
      return { value: "var(--foreground)" };
  }
}

function KpiCard({
  href,
  label,
  value,
  sub,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  sub: string;
  tone: Tone;
}) {
  const styles = toneStyles(tone);
  return (
    <Link
      href={href}
      className="border-border bg-background hover:border-foreground/30 group block rounded-xl border p-4 transition-colors"
    >
      <p className="text-muted-foreground font-mono text-[10px] font-medium uppercase tracking-[0.08em]">
        {label}
      </p>
      <p
        className="font-display mt-3 text-3xl font-medium tabular-nums leading-none tracking-[-0.01em]"
        style={{ color: styles.value }}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-2 font-mono text-[10.5px] tracking-[0.02em]">{sub}</p>
    </Link>
  );
}
