"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import {
  classInputSchema,
  classUpdateSchema,
  classInstructorAssignmentSchema,
} from "@arbor/shared";
import type { Class } from "@arbor/shared";
import type { TablesUpdate } from "@/lib/supabase/database.types";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };

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

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export async function createClass(input: unknown): Promise<ActionResult<Class>> {
  const parsed = classInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { data, error } = await supabase
    .from("classes")
    .insert({ ...parsed.data, org_id: orgId })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/classes");
  return { ok: true, data: data as Class };
}

export async function updateClass(id: string, input: unknown): Promise<ActionResult<Class>> {
  const parsed = classUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { data, error } = await supabase
    .from("classes")
    .update(
      stripUndefined(parsed.data as Record<string, unknown>) as unknown as TablesUpdate<"classes">,
    )
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/classes");
  revalidatePath(`/classes/${id}`);
  return { ok: true, data: data as Class };
}

export async function softDeleteClass(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { error } = await supabase
    .from("classes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/classes");
  revalidatePath(`/classes/${id}`);
  return { ok: true, data: { id } };
}

export async function assignInstructorToClass(
  classId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = classInstructorAssignmentSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { data, error } = await supabase
    .from("class_instructor_assignments")
    .upsert(
      {
        org_id: orgId,
        class_id: classId,
        instructor_id: parsed.data.instructor_id,
        role: parsed.data.role,
        assigned_offerings: parsed.data.assigned_offerings,
      },
      { onConflict: "class_id,instructor_id" },
    )
    .select("id")
    .single();

  if (error) {
    const message =
      error.code === "23514" || error.message.includes("exceeds")
        ? "Total assigned offerings would exceed the class limit."
        : error.message;
    return { ok: false, error: { code: error.code, message } };
  }

  revalidatePath(`/classes/${classId}`);
  return { ok: true, data: { id: data.id } };
}

export async function unassignInstructorFromClass(
  classId: string,
  instructorId: string,
): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { error } = await supabase
    .from("class_instructor_assignments")
    .delete()
    .eq("class_id", classId)
    .eq("instructor_id", instructorId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath(`/classes/${classId}`);
  return { ok: true, data: { id: instructorId } };
}

export async function updateAssignment(
  classId: string,
  instructorId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return assignInstructorToClass(classId, {
    instructor_id: instructorId,
    ...(typeof input === "object" && input !== null ? input : {}),
  });
}

export async function restoreClass(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { error } = await supabase
    .from("classes")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("org_id", orgId)
    .not("deleted_at", "is", null);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/classes");
  revalidatePath(`/classes/${id}`);
  return { ok: true, data: { id } };
}
