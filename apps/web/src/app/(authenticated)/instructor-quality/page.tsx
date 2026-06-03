import { headers } from "next/headers";
import QRCode from "qrcode";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { applyDeptScope, getDepartmentScope } from "@/lib/auth/current-department";
import { isManager } from "@/lib/auth/role";
import { loadInstructorQuality } from "@/lib/instructor-quality";
import InstructorQualityView, {
  type DeliverableRow,
  type InstructorRow,
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

  const qualityBundle = await loadInstructorQuality(supabase, orgId, scope);

  const [{ data: instructorRows }, { data: workloadRows }, { data: linkRows }] = await Promise.all([
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

  const instructors: InstructorRow[] = (instructorRows ?? []).map((i) => ({
    id: i.id,
    name: i.full_name,
    department: i.department,
    quality: qualityBundle.byInstructor.get(i.id) ?? {
      l1: null,
      scores: [],
      bySource: [],
      monthly: [],
      comments: [],
    },
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
        description="Delivery quality per instructor across the Kirkpatrick four levels — learner reaction (QR feedback), learning, behavior, results — with a per-work-type breakdown and trend."
      />
      <div className="p-6">
        <InstructorQualityView
          instructors={instructors}
          deliverables={deliverables}
          peerOverall={qualityBundle.peerOverall}
        />
      </div>
    </div>
  );
}
