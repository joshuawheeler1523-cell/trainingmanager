"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import { classRoadmapStepInputSchema, classRoadmapStepUpdateSchema } from "@arbor/shared";
import type { ActionResult, ClassRoadmapStep } from "@arbor/shared";
import type { TablesUpdate } from "@/lib/supabase/database.types";

function validationError(err: {
  errors: Array<{ message: string; path: (string | number)[] }>;
}): ActionResult<never> {
  const first = err.errors[0];
  const field = first?.path.join(".");
  return {
    ok: false,
    error: {
      code: "VALIDATION",
      message: first?.message ?? "Invalid input",
      ...(field ? { field } : {}),
    },
  };
}

async function ctx() {
  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { error: { code: "NO_ORG", message: "No active organization" } } as const;
  if (!departmentId)
    return { error: { code: "NO_DEPARTMENT", message: "No active department" } } as const;
  return { supabase, orgId, departmentId } as const;
}

export async function createRoadmapStep(
  classId: string,
  input: unknown,
): Promise<ActionResult<ClassRoadmapStep>> {
  const parsed = classRoadmapStepInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if ("error" in c) return { ok: false, error: c.error };

  // Append at the end: next position = max(position) + 10 (sparse spacing
  // means future inserts in the middle won't need to renumber).
  const { data: tailRow } = await c.supabase
    .from("class_roadmap_steps")
    .select("position")
    .eq("class_id", classId)
    .eq("org_id", c.orgId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (tailRow?.position ?? 0) + 10;

  const { data, error } = await c.supabase
    .from("class_roadmap_steps")
    .insert({
      org_id: c.orgId,
      department_id: c.departmentId,
      class_id: classId,
      position: nextPosition,
      competency: parsed.data.competency,
      modality: parsed.data.modality,
      duration_minutes: parsed.data.duration_minutes,
      notes: parsed.data.notes,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath(`/classes/${classId}`);
  return { ok: true, data: data as ClassRoadmapStep };
}

export async function updateRoadmapStep(
  stepId: string,
  classId: string,
  input: unknown,
): Promise<ActionResult<ClassRoadmapStep>> {
  const parsed = classRoadmapStepUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if ("error" in c) return { ok: false, error: c.error };

  const update: TablesUpdate<"class_roadmap_steps"> = {};
  if (parsed.data.competency !== undefined) update.competency = parsed.data.competency;
  if (parsed.data.modality !== undefined) update.modality = parsed.data.modality;
  if (parsed.data.duration_minutes !== undefined)
    update.duration_minutes = parsed.data.duration_minutes;
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;

  const { data, error } = await c.supabase
    .from("class_roadmap_steps")
    .update(update)
    .eq("id", stepId)
    .eq("class_id", classId)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath(`/classes/${classId}`);
  return { ok: true, data: data as ClassRoadmapStep };
}

export async function deleteRoadmapStep(
  stepId: string,
  classId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if ("error" in c) return { ok: false, error: c.error };

  const { error } = await c.supabase
    .from("class_roadmap_steps")
    .delete()
    .eq("id", stepId)
    .eq("class_id", classId)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath(`/classes/${classId}`);
  return { ok: true, data: { id: stepId } };
}

export async function moveRoadmapStep(
  stepId: string,
  classId: string,
  direction: "up" | "down",
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if ("error" in c) return { ok: false, error: c.error };

  // Fetch all steps for this class in order; find the target + its neighbor;
  // swap the position values. One round-trip to read, one to write each row.
  const { data: rows, error: readErr } = await c.supabase
    .from("class_roadmap_steps")
    .select("id, position")
    .eq("class_id", classId)
    .eq("org_id", c.orgId)
    .order("position", { ascending: true });

  if (readErr) return { ok: false, error: { code: readErr.code, message: readErr.message } };

  const idx = rows.findIndex((r) => r.id === stepId);
  if (idx === -1)
    return { ok: false, error: { code: "NOT_FOUND", message: "Step not found in class" } };

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) {
    return { ok: true, data: { id: stepId } };
  }

  const self = rows[idx];
  const other = rows[swapIdx];
  if (!self || !other) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Step not found in class" } };
  }

  const { error: e1 } = await c.supabase
    .from("class_roadmap_steps")
    .update({ position: other.position })
    .eq("id", self.id)
    .eq("org_id", c.orgId);
  if (e1) return { ok: false, error: { code: e1.code, message: e1.message } };

  const { error: e2 } = await c.supabase
    .from("class_roadmap_steps")
    .update({ position: self.position })
    .eq("id", other.id)
    .eq("org_id", c.orgId);
  if (e2) return { ok: false, error: { code: e2.code, message: e2.message } };

  revalidatePath(`/classes/${classId}`);
  return { ok: true, data: { id: stepId } };
}
