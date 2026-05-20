import Link from "next/link";
import {
  BriefcaseIcon,
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  ShieldCheckIcon,
} from "@heroicons/react/20/solid";
import PageHeader from "@/components/ui/page-header";
import { Eyebrow } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

// Instructor / viewer dashboard. Strictly scoped to the signed-in user:
// their open work intake, their project tasks, their upcoming classes,
// their utilization, their expiring certs. Managers see a different
// org-wide layout in page.tsx.

export default async function InstructorDashboard({ orgId }: { orgId: string }) {
  const supabase = await createClient();

  // Resolve the caller's instructor row id. The RPC returns NULL if the
  // user is an instructor-role member without a matching instructors row
  // (rare — happens before a manager links the auth user to an instructor
  // record). Most sections need this id; we degrade gracefully when null.
  const { data: instructorId } = await supabase.rpc("current_instructor_id", {
    p_org_id: orgId,
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const horizon14 = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const horizon90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  // Run every section query in parallel. Each branch is independent so we
  // pay one round-trip's worth of wall time, not N.
  const [
    { data: capacityRow },
    { data: tras },
    { data: taskRows },
    { data: sessionRows },
    { data: certRows },
  ] = await Promise.all([
    // 1. My utilization (only if we have an instructor id)
    instructorId
      ? supabase
          .from("v_instructor_capacity")
          .select("annual_hours, assigned_hours, utilization_pct, utilization_status")
          .eq("instructor_id", instructorId)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // 2. My open TRAs — scoped by created_by (matches the RLS policy that
    // lets instructors edit only their own draft/documented TRAs).
    supabase
      .from("tras")
      .select("id, project_name, status, total_estimated_hours, updated_at")
      .eq("org_id", orgId)
      .in("status", ["draft", "documented"])
      .order("updated_at", { ascending: false })
      .limit(10),

    // 3. My project tasks — join through task_assignments → project_team_members.
    instructorId
      ? supabase
          .from("tasks")
          .select(
            "id, name, status, end_date, priority, project:projects!inner(id, name), task_assignments!inner(project_team_member:project_team_members!inner(instructor_id))",
          )
          .eq("org_id", orgId)
          .in("status", ["not_started", "in_progress"])
          .eq("task_assignments.project_team_member.instructor_id", instructorId)
          .order("end_date", { ascending: true, nullsFirst: false })
          .limit(10)
      : Promise.resolve({ data: null }),

    // 4. My upcoming Training Planner sessions (next 14d). impl_trainers
    // is the join row that links an impl_session to an instructor.
    instructorId
      ? supabase
          .from("impl_sessions")
          .select(
            "id, scheduled_start, scheduled_end, status, impl_class:impl_classes!inner(id, name), impl_trainer:impl_trainers!inner(instructor_id), implementation:implementations!inner(id, name)",
          )
          .eq("org_id", orgId)
          .eq("status", "published")
          .gte("scheduled_start", new Date().toISOString())
          .lte("scheduled_start", horizon14)
          .eq("impl_trainer.instructor_id", instructorId)
          .order("scheduled_start", { ascending: true })
          .limit(10)
      : Promise.resolve({ data: null }),

    // 5. My expiring certifications (next 90 days).
    instructorId
      ? supabase
          .from("instructor_skills")
          .select("id, expires_at, certified_at, skill:skills!inner(id, name, category)")
          .eq("org_id", orgId)
          .eq("instructor_id", instructorId)
          .eq("is_certified", true)
          .not("expires_at", "is", null)
          .gte("expires_at", todayIso)
          .lte("expires_at", horizon90)
          .order("expires_at", { ascending: true })
          .limit(10)
      : Promise.resolve({ data: null }),
  ]);

  // ── My TRAs filter to mine (created_by = auth.uid()) ────────────────────
  // RLS already scopes tras to ones the instructor can see. The "mine"
  // narrowing is by created_by; we can't filter on auth.uid() server-side
  // without a round-trip to getUser(), so we fetch all open ones the user
  // sees and trust RLS to keep that set small. For instructors, the RLS
  // policy tras_instructor_select returns ones they created.
  const myTras = (tras ?? []) as {
    id: string;
    project_name: string;
    status: string;
    total_estimated_hours: number | null;
    updated_at: string;
  }[];

  // ── Capacity ───────────────────────────────────────────────────────────
  const cap = capacityRow;

  // ── Tasks / Sessions / Certs typing ─────────────────────────────────────
  type TaskRow = {
    id: string;
    name: string;
    status: string;
    end_date: string | null;
    priority: string | null;
    project: { id: string; name: string } | null;
  };
  const myTasks = ((taskRows ?? []) as TaskRow[]).slice(0, 10);

  type SessionRow = {
    id: string;
    scheduled_start: string;
    scheduled_end: string;
    status: string;
    impl_class: { id: string; name: string } | null;
    implementation: { id: string; name: string } | null;
  };
  const mySessions = ((sessionRows ?? []) as SessionRow[]).slice(0, 10);

  type CertRow = {
    id: string;
    expires_at: string;
    certified_at: string | null;
    skill: { id: string; name: string; category: string | null } | null;
  };
  const myCerts = ((certRows ?? []) as CertRow[]).slice(0, 10);

  return (
    <div>
      <PageHeader title="My dashboard" description="What's on your plate this week." />

      <div className="space-y-6 p-6">
        {/* Utilization hero */}
        <UtilizationCard cap={cap} hasInstructorRow={Boolean(instructorId)} />

        {/* Upcoming sessions + project tasks */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard
            title="Upcoming classes"
            subtitle="Sessions you're teaching in the next 14 days."
            icon={<CalendarDaysIcon className="h-4 w-4" />}
            empty="No sessions scheduled in the next two weeks."
            items={mySessions.map((s) => ({
              key: s.id,
              href: s.implementation
                ? `/training-planner/${s.implementation.id}/schedule`
                : undefined,
              primary: s.impl_class?.name ?? "Class",
              secondary: s.implementation?.name ?? "",
              meta: formatSessionMeta(s.scheduled_start, s.scheduled_end),
            }))}
          />

          <SectionCard
            title="Project tasks"
            subtitle="Open tasks assigned to you."
            icon={<BriefcaseIcon className="h-4 w-4" />}
            empty="No open project tasks assigned to you."
            items={myTasks.map((t) => ({
              key: t.id,
              href: t.project ? `/projects/${t.project.id}` : undefined,
              primary: t.name,
              secondary: t.project?.name ?? "",
              meta: t.end_date ? `Due ${formatDate(t.end_date)}` : t.status.replace("_", " "),
              metaTone: t.end_date && t.end_date < todayIso ? "warning" : "muted",
            }))}
          />
        </div>

        {/* Open TRAs + expiring certs */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard
            title="My open work intake"
            subtitle="Job requests you've started that aren't converted or completed yet."
            icon={<ClipboardDocumentCheckIcon className="h-4 w-4" />}
            empty="No open work intake right now."
            items={myTras.map((t) => ({
              key: t.id,
              href: `/tras/${t.id}`,
              primary: t.project_name,
              secondary: t.status.replace("_", " "),
              meta:
                t.total_estimated_hours != null
                  ? `${t.total_estimated_hours.toString()}h est`
                  : `Updated ${formatDate(t.updated_at.slice(0, 10))}`,
            }))}
          />

          <SectionCard
            title="Expiring certifications"
            subtitle="Certs expiring in the next 90 days."
            icon={<ShieldCheckIcon className="h-4 w-4" />}
            empty="No certifications expiring in the next 90 days."
            items={myCerts.map((c) => {
              const days = daysUntil(c.expires_at, todayIso);
              return {
                key: c.id,
                href: `/instructors/${instructorId ?? ""}`,
                primary: c.skill?.name ?? "Certification",
                secondary: c.skill?.category ?? "",
                meta:
                  days <= 30
                    ? `Expires in ${days.toString()} days`
                    : `Expires ${formatDate(c.expires_at)}`,
                metaTone: days <= 30 ? "danger" : days <= 60 ? "warning" : "muted",
              };
            })}
          />
        </div>
      </div>
    </div>
  );
}

// ── Utilization hero card ─────────────────────────────────────────────────

function UtilizationCard({
  cap,
  hasInstructorRow,
}: {
  cap: {
    annual_hours: number | null;
    assigned_hours: number | null;
    utilization_pct: number | null;
    utilization_status: string | null;
  } | null;
  hasInstructorRow: boolean;
}) {
  if (!hasInstructorRow) {
    return (
      <section className="border-border bg-background rounded-xl border p-5">
        <Eyebrow className="mb-1.5">My utilization</Eyebrow>
        <p className="text-muted-foreground text-sm">
          Your user account isn&apos;t linked to an instructor record yet. Ask your manager to link
          your account so we can show your hours here.
        </p>
      </section>
    );
  }

  const pct = cap?.utilization_pct ?? 0;
  const annual = cap?.annual_hours ?? 0;
  const assigned = cap?.assigned_hours ?? 0;
  const free = Math.max(0, annual - assigned);
  const overflow = Math.max(0, assigned - annual);

  const headlineColor =
    pct >= 95 ? "var(--destructive)" : pct >= 80 ? "var(--highlight)" : "var(--foreground)";

  const band =
    pct >= 95
      ? "Over — at risk of burnout"
      : pct >= 80
        ? "Watch — approaching cap"
        : pct >= 40
          ? "Healthy range"
          : "Light — capacity available";

  const assignedClamped = Math.min(pct, 100);
  const overflowPct = pct > 100 ? Math.min(pct - 100, 30) : 0;

  return (
    <section className="border-border bg-background rounded-xl border p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Eyebrow className="mb-1.5">My utilization</Eyebrow>
          <h3 className="font-display text-foreground text-lg font-medium leading-tight tracking-[-0.005em]">
            {band}
          </h3>
        </div>
        <p
          className="font-display text-3xl font-medium tabular-nums leading-none tracking-[-0.01em]"
          style={{ color: headlineColor }}
        >
          {pct.toFixed(0)}%{" "}
          <span className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[0.04em]">
            utilized
          </span>
        </p>
      </div>

      <div
        className="relative h-3 overflow-hidden rounded-full"
        style={{ backgroundColor: "color-mix(in oklab, var(--border) 70%, transparent)" }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-y-0 left-0 h-full rounded-l-full"
          style={{
            width: `${assignedClamped.toString()}%`,
            backgroundColor: "var(--primary)",
          }}
        />
        {overflowPct > 0 && (
          <div
            className="absolute inset-y-0 h-full"
            style={{
              left: "100%",
              width: `${overflowPct.toString()}%`,
              backgroundColor: "var(--destructive)",
              transform: "translateX(-1px)",
            }}
          />
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Annual hours" value={annual} />
        <Stat label="Assigned" value={assigned} />
        <Stat
          label={overflow > 0 ? "Over-assigned" : "Free"}
          value={overflow > 0 ? overflow : free}
          highlight={overflow > 0}
        />
      </div>
    </section>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
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

// ── Generic section card with list of items ───────────────────────────────

type ItemMetaTone = "muted" | "warning" | "danger";

type SectionItem = {
  key: string;
  // Explicit `| undefined` unions so callers can build items with a
  // conditional `href` / `meta` field under exactOptionalPropertyTypes.
  href?: string | undefined;
  primary: string;
  secondary?: string | undefined;
  meta?: string | undefined;
  metaTone?: ItemMetaTone | undefined;
};

function SectionCard({
  title,
  subtitle,
  icon,
  empty,
  items,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  empty: string;
  items: SectionItem[];
}) {
  return (
    <section className="border-border bg-background rounded-xl border p-5">
      <div className="mb-3 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px]"
          style={{ backgroundColor: "rgba(139,157,131,0.18)", color: "#5a6855" }}
        >
          {icon}
        </span>
        <div className="flex-1">
          <Eyebrow className="mb-1">
            {title}{" "}
            <span className="text-muted-foreground ml-1 font-normal normal-case tracking-normal">
              ({items.length.toString()})
            </span>
          </Eyebrow>
          <p className="text-muted-foreground text-xs">{subtitle}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground py-3 text-sm italic">{empty}</p>
      ) : (
        <ul className="divide-border divide-y">
          {items.map((item) => (
            <li key={item.key} className="py-2.5">
              <ItemRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemRow({ item }: { item: SectionItem }) {
  const inner = (
    <>
      <p className="text-foreground truncate text-sm font-medium">{item.primary}</p>
      {item.secondary && (
        <p className="text-muted-foreground truncate text-xs capitalize">{item.secondary}</p>
      )}
      {item.meta && (
        <p className="mt-0.5 text-xs font-medium" style={{ color: metaColor(item.metaTone) }}>
          {item.meta}
        </p>
      )}
    </>
  );
  if (item.href) {
    return (
      <Link href={item.href} className="hover:text-primary block">
        {inner}
      </Link>
    );
  }
  return <div>{inner}</div>;
}

function metaColor(tone: ItemMetaTone | undefined): string {
  if (tone === "danger") return "var(--destructive)";
  if (tone === "warning") {
    return "color-mix(in oklab, var(--highlight) 35%, var(--foreground))";
  }
  return "var(--muted-foreground)";
}

// ── Formatting helpers ────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatSessionMeta(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endTime = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${startTime}–${endTime}`;
}

function daysUntil(targetIso: string, todayIso: string): number {
  const target = new Date(targetIso).getTime();
  const today = new Date(todayIso).getTime();
  return Math.max(0, Math.round((target - today) / 86_400_000));
}
