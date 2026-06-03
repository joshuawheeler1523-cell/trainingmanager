import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { applyDeptScope, getDepartmentScope } from "@/lib/auth/current-department";
import type { SketchpadSchedule } from "@arbor/shared";
import SketchpadListView from "./sketchpad-list-view";

export default async function SketchpadIndexPage() {
  const [supabase, orgId, scope] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getDepartmentScope(),
  ]);

  if (!orgId) {
    return (
      <div>
        <PageHeader
          title="Schedule Sketchpad"
          description="Quick, free-text course schedules. Not linked to your roster, classes, or capacity — just a fast way to mock something up and export to Excel."
        />
        <div className="text-muted-foreground p-6 text-sm">No active organization.</div>
      </div>
    );
  }

  const [{ data: schedules }, { data: rooms }, { data: sessions }] = await Promise.all([
    applyDeptScope(
      supabase
        .from("sketchpad_schedules")
        .select("*")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false }),
      scope,
    ),
    applyDeptScope(
      supabase.from("sketchpad_rooms").select("id, schedule_id").eq("org_id", orgId),
      scope,
    ),
    applyDeptScope(
      supabase.from("sketchpad_sessions").select("id, schedule_id").eq("org_id", orgId),
      scope,
    ),
  ]);

  const roomCountBySchedule = new Map<string, number>();
  for (const r of rooms ?? []) {
    roomCountBySchedule.set(r.schedule_id, (roomCountBySchedule.get(r.schedule_id) ?? 0) + 1);
  }
  const sessionCountBySchedule = new Map<string, number>();
  for (const s of sessions ?? []) {
    sessionCountBySchedule.set(s.schedule_id, (sessionCountBySchedule.get(s.schedule_id) ?? 0) + 1);
  }

  const rows = ((schedules ?? []) as SketchpadSchedule[]).map((s) => ({
    ...s,
    room_count: roomCountBySchedule.get(s.id) ?? 0,
    session_count: sessionCountBySchedule.get(s.id) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Schedule Sketchpad"
        description="Quick, free-text course schedules. Not linked to your roster, classes, or capacity — just a fast way to mock something up and export to Excel."
      />
      <div className="space-y-6 p-6">
        <SketchpadListView rows={rows} />
      </div>
    </div>
  );
}
