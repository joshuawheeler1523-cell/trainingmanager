import { NextResponse } from "next/server";
import { Document, Page, Text, View, StyleSheet, renderToStream } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { ImplSession, Implementation } from "@arbor/shared";

export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  title: { fontSize: 16, marginBottom: 4, fontWeight: 700 },
  subtitle: { fontSize: 10, color: "#475569", marginBottom: 12 },
  table: { borderStyle: "solid", borderWidth: 1, borderColor: "#cbd5e1", marginTop: 8 },
  row: {
    flexDirection: "row",
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  rowHeader: { backgroundColor: "#f1f5f9", fontWeight: 700 },
  cell: { padding: 4, borderRightStyle: "solid", borderRightWidth: 1, borderRightColor: "#e2e8f0" },
  cellLast: { padding: 4 },
  date: { width: "12%" },
  time: { width: "12%" },
  classCol: { width: "25%" },
  trainer: { width: "20%" },
  room: { width: "15%" },
  learners: { width: "8%", textAlign: "right" as const },
  conflict: { width: "8%" },
});

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
    supabase.from("implementations").select("*").eq("id", id).eq("org_id", orgId).maybeSingle(),
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

  const i = impl as Implementation;
  const sessionList = (sessions ?? []) as ImplSession[];
  const classMap = new Map((classes ?? []).map((c) => [c.id, c]));
  const trainerMap = new Map((trainers ?? []).map((t) => [t.id, t]));
  const roomMap = new Map((rooms ?? []).map((r) => [r.id, r]));

  const doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{i.name}</Text>
        <Text style={styles.subtitle}>
          Training Planner schedule · {sessionList.length.toString()} sessions ·{" "}
          {i.window_start_date ?? "?"} → {i.window_end_date ?? "?"}
        </Text>
        <View style={styles.table}>
          <View style={[styles.row, styles.rowHeader]}>
            <Text style={[styles.cell, styles.date]}>Date</Text>
            <Text style={[styles.cell, styles.time]}>Time</Text>
            <Text style={[styles.cell, styles.classCol]}>Class</Text>
            <Text style={[styles.cell, styles.trainer]}>Trainer</Text>
            <Text style={[styles.cell, styles.room]}>Room</Text>
            <Text style={[styles.cell, styles.learners]}>Learners</Text>
            <Text style={[styles.cellLast, styles.conflict]}>Conflict</Text>
          </View>
          {sessionList.map((s) => {
            const klass = classMap.get(s.impl_class_id);
            const trainer = s.impl_trainer_id ? trainerMap.get(s.impl_trainer_id) : null;
            const room = s.impl_room_id ? roomMap.get(s.impl_room_id) : null;
            const start = new Date(s.scheduled_start);
            const end = new Date(s.scheduled_end);
            return (
              <View style={styles.row} key={s.id}>
                <Text style={[styles.cell, styles.date]}>{start.toLocaleDateString()}</Text>
                <Text style={[styles.cell, styles.time]}>
                  {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–
                  {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
                <Text style={[styles.cell, styles.classCol]}>{klass?.name ?? "—"}</Text>
                <Text style={[styles.cell, styles.trainer]}>{trainer?.name ?? "—"}</Text>
                <Text style={[styles.cell, styles.room]}>{room?.name ?? "—"}</Text>
                <Text style={[styles.cell, styles.learners]}>{s.learners_count.toString()}</Text>
                <Text style={[styles.cellLast, styles.conflict]}>{s.conflict_status}</Text>
              </View>
            );
          })}
        </View>
      </Page>
    </Document>
  );

  const stream = await renderToStream(doc);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const body = new Uint8Array(buffer);
  const filename = `${i.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-schedule.pdf`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
