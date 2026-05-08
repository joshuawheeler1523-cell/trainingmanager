import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import {
  TASK_EXPORT_COLUMNS,
  type Instructor,
  type ProjectTeamMember,
  type Task,
  type TaskAssignment,
} from "@arbor/shared";

// SheetJS / xlsx recommends Node runtime — its build pipeline pulls in
// node:fs / node:stream which aren't available on the edge runtime.
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const [
    { data: project },
    { data: tasks },
    { data: members },
    { data: assignments },
    { data: instructors },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .eq("org_id", orgId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("project_team_members")
      .select("*")
      .eq("project_id", projectId)
      .eq("org_id", orgId),
    supabase.from("task_assignments").select("*").eq("org_id", orgId),
    supabase.from("instructors").select("id, full_name").eq("org_id", orgId).is("deleted_at", null),
  ]);

  if (!project) return new NextResponse("Not found", { status: 404 });

  const taskList = (tasks ?? []) as Task[];
  const memberList = (members ?? []) as ProjectTeamMember[];
  const assignmentList = (assignments ?? []) as TaskAssignment[];
  const instructorList = (instructors ?? []) as Pick<Instructor, "id" | "full_name">[];

  // Build assignee lookup: task_id -> [instructor names]
  const memberToInstructor = new Map(
    memberList.map((m) => {
      const inst = instructorList.find((i) => i.id === m.instructor_id);
      return [m.id, inst?.full_name ?? "Unknown"];
    }),
  );
  const taskAssignees = new Map<string, string[]>();
  for (const a of assignmentList) {
    const name = memberToInstructor.get(a.project_team_member_id);
    if (!name) continue;
    const list = taskAssignees.get(a.task_id) ?? [];
    list.push(name);
    taskAssignees.set(a.task_id, list);
  }

  const rows = taskList.map((t) => ({
    ID: t.id,
    Name: t.name,
    Description: t.description ?? "",
    Status: t.status,
    Priority: t.priority,
    Start: t.start_date ?? "",
    End: t.end_date ?? "",
    "Estimated Hours": t.estimated_hours ?? "",
    Assignees: (taskAssignees.get(t.id) ?? []).join(", "),
    "% Complete": t.percent_complete,
  }));

  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: [...TASK_EXPORT_COLUMNS],
  });

  // Reasonable column widths so the export is usable in Excel without resizing.
  sheet["!cols"] = [
    { wch: 38 }, // ID
    { wch: 40 }, // Name
    { wch: 50 }, // Description
    { wch: 14 }, // Status
    { wch: 10 }, // Priority
    { wch: 12 }, // Start
    { wch: 12 }, // End
    { wch: 16 }, // Estimated Hours
    { wch: 30 }, // Assignees
    { wch: 12 }, // % Complete
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Tasks");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  // NextResponse wants a BodyInit; coerce the Node Buffer to a Uint8Array,
  // which is structurally a valid body without copying memory.
  const body = new Uint8Array(buffer);

  const filename = `${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-tasks.xlsx`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
