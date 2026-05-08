import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { ImplSession, Implementation } from "@arbor/shared";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return new NextResponse("Unauthorized", { status: 401 });

  const [
    { data: impl },
    { data: sessions },
    { data: classes },
    { data: trainers },
    { data: rooms },
  ] = await Promise.all([
    supabase.from("implementations").select("name").eq("id", id).eq("org_id", orgId).maybeSingle(),
    supabase
      .from("impl_sessions")
      .select("*")
      .eq("implementation_id", id)
      .eq("org_id", orgId)
      .neq("status", "cancelled")
      .order("scheduled_start"),
    supabase.from("impl_classes").select("*").eq("implementation_id", id).eq("org_id", orgId),
    supabase.from("impl_trainers").select("*").eq("implementation_id", id).eq("org_id", orgId),
    supabase.from("impl_rooms").select("*").eq("implementation_id", id).eq("org_id", orgId),
  ]);

  if (!impl) return new NextResponse("Not found", { status: 404 });

  const sessionList = (sessions ?? []) as ImplSession[];
  const classMap = new Map((classes ?? []).map((c) => [c.id, c]));
  const trainerMap = new Map((trainers ?? []).map((t) => [t.id, t]));
  const roomMap = new Map((rooms ?? []).map((r) => [r.id, r]));

  const rows = sessionList.map((s) => ({
    Date: new Date(s.scheduled_start).toLocaleDateString(),
    Start: new Date(s.scheduled_start).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    End: new Date(s.scheduled_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    Class: classMap.get(s.impl_class_id)?.name ?? "—",
    Trainer: s.impl_trainer_id ? (trainerMap.get(s.impl_trainer_id)?.name ?? "—") : "—",
    Room: s.impl_room_id ? (roomMap.get(s.impl_room_id)?.name ?? "—") : "—",
    Learners: s.learners_count,
    Status: s.status,
    Conflict: s.conflict_status,
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 12 },
    { wch: 8 },
    { wch: 8 },
    { wch: 30 },
    { wch: 24 },
    { wch: 18 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Schedule");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const body = new Uint8Array(buf);
  const filename = `${(impl as Pick<Implementation, "name">).name
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()}-schedule.xlsx`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
