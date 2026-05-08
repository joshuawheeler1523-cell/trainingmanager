import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { ImplSession, Implementation } from "@arbor/shared";

export const runtime = "nodejs";

// /api/training-planner/[id]/schedule.ics?trainer=<impl_trainer_id>
//
// Generates an iCalendar feed for the implementation. Without ?trainer=, all
// non-cancelled sessions are included. With ?trainer=<id>, only that
// trainer's sessions — useful so trainers can subscribe to their own URL in
// Outlook/Google Calendar.

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const trainerFilter = url.searchParams.get("trainer");

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
      .neq("status", "cancelled"),
    supabase.from("impl_classes").select("*").eq("implementation_id", id).eq("org_id", orgId),
    supabase.from("impl_trainers").select("*").eq("implementation_id", id).eq("org_id", orgId),
    supabase.from("impl_rooms").select("*").eq("implementation_id", id).eq("org_id", orgId),
  ]);

  if (!impl) return new NextResponse("Not found", { status: 404 });

  let sessionList = (sessions ?? []) as ImplSession[];
  if (trainerFilter) {
    sessionList = sessionList.filter((s) => s.impl_trainer_id === trainerFilter);
  }
  const classMap = new Map((classes ?? []).map((c) => [c.id, c]));
  const trainerMap = new Map((trainers ?? []).map((t) => [t.id, t]));
  const roomMap = new Map((rooms ?? []).map((r) => [r.id, r]));

  const implName = (impl as Pick<Implementation, "name">).name;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Arbor//Training Planner//EN",
    `X-WR-CALNAME:${escapeIcs(implName)}`,
    "CALSCALE:GREGORIAN",
  ];

  for (const s of sessionList) {
    const klass = classMap.get(s.impl_class_id);
    const trainer = s.impl_trainer_id ? trainerMap.get(s.impl_trainer_id) : null;
    const room = s.impl_room_id ? roomMap.get(s.impl_room_id) : null;
    const summary = klass?.name ?? "Training session";
    const description = [
      `Implementation: ${implName}`,
      trainer ? `Trainer: ${trainer.name}` : "Trainer: unassigned",
      room ? `Room: ${room.name}` : "Room: unassigned",
      `Status: ${s.status}`,
      `Conflict: ${s.conflict_status}`,
      `Learners: ${s.learners_count.toString()}`,
    ].join("\\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}@arbor.training`,
      `DTSTAMP:${toIcsDate(new Date())}`,
      `DTSTART:${toIcsDate(new Date(s.scheduled_start))}`,
      `DTEND:${toIcsDate(new Date(s.scheduled_end))}`,
      `SUMMARY:${escapeIcs(summary)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      ...(room ? [`LOCATION:${escapeIcs(room.name)}`] : []),
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  const body = lines.join("\r\n");

  const filename = `${implName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-schedule.ics`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// iCal expects YYYYMMDDTHHMMSSZ in UTC. Strip punctuation from ISO and use
// the Z suffix.
export function toIcsDate(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

// iCal escape: backslash, comma, semicolon, newline.
export function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
