import { headers } from "next/headers";
import QRCode from "qrcode";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { applyDeptScope, getDepartmentScope } from "@/lib/auth/current-department";
import { isManager } from "@/lib/auth/role";
import InstructorQualityView, {
  type DeliverableRow,
  type InstructorQualityRow,
} from "./instructor-quality-view";

export const metadata = { title: "Instructor Quality — Arbor" };

export default async function InstructorQualityPage() {
  const [supabase, orgId, scope, headerList] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getDepartmentScope(),
    headers(),
  ]);

  if (!orgId) {
    return (
      <div>
        <PageHeader title="Instructor Quality" description="Kirkpatrick quality tracking." />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }
  if (!(await isManager(orgId))) {
    return (
      <div>
        <PageHeader title="Instructor Quality" description="Kirkpatrick quality tracking." />
        <div className="text-muted-foreground p-6 text-sm">
          Instructor quality is a manager view.
        </div>
      </div>
    );
  }

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  const [
    { data: instructorRows },
    { data: qualityRows },
    { data: scoreRows },
    { data: workloadRows },
    { data: linkRows },
  ] = await Promise.all([
    applyDeptScope(
      supabase
        .from("instructors")
        .select("id, full_name, department")
        .eq("org_id", orgId)
        .eq("is_external", false)
        .is("deleted_at", null)
        .eq("status", "active")
        .order("full_name"),
      scope,
    ),
    applyDeptScope(supabase.from("v_instructor_quality").select("*").eq("org_id", orgId), scope),
    applyDeptScope(
      supabase
        .from("instructor_quality_scores")
        .select("*")
        .eq("org_id", orgId)
        .order("recorded_at", { ascending: false }),
      scope,
    ),
    applyDeptScope(
      supabase
        .from("v_instructor_workload")
        .select("source, source_id, source_label, instructor_id, department_id")
        .eq("org_id", orgId),
      scope,
    ),
    applyDeptScope(
      supabase
        .from("instructor_feedback_links")
        .select("id, token, source_type, source_id, is_active")
        .eq("org_id", orgId),
      scope,
    ),
  ]);

  const instructorName = new Map((instructorRows ?? []).map((i) => [i.id, i.full_name] as const));

  // ── Per-instructor Kirkpatrick rollup ──────────────────────────────────────
  const qualityByInstructor = new Map(
    (qualityRows ?? []).map((q) => [q.instructor_id, q] as const),
  );
  const scoresByInstructor = new Map<string, typeof scoreRows>();
  for (const s of scoreRows ?? []) {
    const list = scoresByInstructor.get(s.instructor_id) ?? [];
    list.push(s);
    scoresByInstructor.set(s.instructor_id, list);
  }

  const instructors: InstructorQualityRow[] = (instructorRows ?? []).map((i) => {
    const q = qualityByInstructor.get(i.id);
    const scores = (scoresByInstructor.get(i.id) ?? []).map((s) => ({
      id: s.id,
      level: s.kirkpatrick_level,
      metric: s.metric,
      score: s.score,
      scoreMax: s.score_max,
      periodLabel: s.period_label,
      note: s.note,
    }));
    return {
      id: i.id,
      name: i.full_name,
      department: i.department,
      l1: q
        ? {
            responseCount: q.response_count ?? 0,
            overall: q.overall_avg,
            knowledge: q.knowledge_avg,
            clarity: q.clarity_avg,
            engagement: q.engagement_avg,
            pace: q.pace_avg,
            nps: q.nps,
          }
        : null,
      scores,
    };
  });

  // ── Deliverables (deduped) + QR for those with a link ──────────────────────
  const linkByKey = new Map<string, NonNullable<typeof linkRows>[number]>();
  for (const l of linkRows ?? []) {
    linkByKey.set(`${l.source_type}:${l.source_id}`, l);
  }

  type DraftDeliverable = {
    key: string;
    sourceType: string;
    sourceId: string;
    departmentId: string;
    label: string;
    instructorIds: Set<string>;
  };
  const byKey = new Map<string, DraftDeliverable>();
  for (const w of workloadRows ?? []) {
    if (!w.source || !w.source_id) continue;
    const key = `${w.source}:${w.source_id}`;
    const cur = byKey.get(key) ?? {
      key,
      sourceType: w.source,
      sourceId: w.source_id,
      departmentId: w.department_id ?? "",
      label: w.source_label ?? "Untitled",
      instructorIds: new Set<string>(),
    };
    if (w.instructor_id) cur.instructorIds.add(w.instructor_id);
    byKey.set(key, cur);
  }

  const deliverables: DeliverableRow[] = await Promise.all(
    Array.from(byKey.values())
      .sort((a, b) => a.sourceType.localeCompare(b.sourceType) || a.label.localeCompare(b.label))
      .map(async (d) => {
        const link = linkByKey.get(d.key);
        let linkOut: DeliverableRow["link"] = null;
        if (link) {
          const url = `${origin}/feedback/${link.token}`;
          const qr = origin ? await QRCode.toDataURL(url, { margin: 1, width: 220 }) : "";
          linkOut = { id: link.id, token: link.token, isActive: link.is_active, url, qr };
        }
        return {
          key: d.key,
          sourceType: d.sourceType,
          sourceId: d.sourceId,
          departmentId: d.departmentId,
          label: d.label,
          instructorNames: Array.from(d.instructorIds)
            .map((id) => instructorName.get(id) ?? "—")
            .sort(),
          link: linkOut,
        };
      }),
  );

  return (
    <div>
      <PageHeader
        title="Instructor Quality"
        description="Track delivery quality per instructor across the Kirkpatrick four levels — learner reaction (via QR feedback), learning, behavior, and results."
      />
      <div className="p-6">
        <InstructorQualityView instructors={instructors} deliverables={deliverables} />
      </div>
    </div>
  );
}
