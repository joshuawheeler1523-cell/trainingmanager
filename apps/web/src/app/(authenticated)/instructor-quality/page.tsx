import QRCode from "qrcode";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { applyDeptScope, getDepartmentScope } from "@/lib/auth/current-department";
import { isManager } from "@/lib/auth/role";
import { getPublicBaseUrl } from "@/lib/public-url";
import InstructorQualityView, {
  type DeliverableRow,
  type FeedbackResponse,
  type ReportInstructor,
} from "./instructor-quality-view";

export const metadata = { title: "Instructor Quality — Arbor" };

export default async function InstructorQualityPage() {
  const [supabase, orgId, scope, origin] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getDepartmentScope(),
    getPublicBaseUrl(),
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

  const [
    { data: instructorRows },
    { data: workloadRows },
    { data: linkRows },
    { data: feedbackRows },
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
    applyDeptScope(
      supabase
        .from("v_instructor_workload")
        .select("source, source_id, source_label, instructor_id, department_id")
        .eq("org_id", orgId)
        // Instructor quality is tracked only for classes taught and education
        // deliverables produced — not projects, recurring tasks, or ad-hoc work.
        .in("source", ["class", "education_request"]),
      scope,
    ),
    applyDeptScope(
      supabase
        .from("instructor_feedback_links")
        .select("id, token, source_type, source_id, is_active")
        .eq("org_id", orgId),
      scope,
    ),
    applyDeptScope(
      supabase
        .from("instructor_feedback")
        .select(
          "instructor_id, source_type, rating_overall, rating_knowledge, rating_clarity, rating_engagement, rating_pace, rating_apply, rating_findability, would_recommend, submitted_at",
        )
        .eq("org_id", orgId)
        .order("submitted_at", { ascending: false })
        .limit(5000),
      scope,
    ),
  ]);

  const instructorName = new Map((instructorRows ?? []).map((i) => [i.id, i.full_name] as const));

  const instructors: ReportInstructor[] = (instructorRows ?? []).map((i) => ({
    id: i.id,
    name: i.full_name,
    department: i.department,
  }));

  const responses: FeedbackResponse[] = (feedbackRows ?? []).map((f) => ({
    instructorId: f.instructor_id,
    sourceType: f.source_type,
    overall: f.rating_overall,
    knowledge: f.rating_knowledge,
    clarity: f.rating_clarity,
    engagement: f.rating_engagement,
    pace: f.rating_pace,
    apply: f.rating_apply,
    findability: f.rating_findability,
    recommend: f.would_recommend,
    submittedAt: f.submitted_at,
  }));

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
          // PNG at print resolution (also scaled down for the on-card thumbnail)
          // for clipboard/copy-paste; SVG is vector so it stays crisp pasted onto
          // an outside deliverable at any size.
          const [qr, svg] = origin
            ? await Promise.all([
                QRCode.toDataURL(url, { margin: 1, width: 512 }),
                QRCode.toString(url, { type: "svg", margin: 1 }),
              ])
            : ["", ""];
          linkOut = { id: link.id, token: link.token, isActive: link.is_active, url, qr, svg };
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
        description="Anonymous learner feedback on each instructor's delivery, captured entirely from the QR survey. Filter and sort by any rated trait, then export to Excel."
      />
      <div className="p-6">
        <InstructorQualityView
          responses={responses}
          instructors={instructors}
          deliverables={deliverables}
        />
      </div>
    </div>
  );
}
