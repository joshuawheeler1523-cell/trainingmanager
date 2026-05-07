"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { instructorInsertSchema, instructorUpdateSchema } from "@arbor/shared";
import type { Instructor } from "@arbor/shared";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };

export async function createInstructor(input: unknown): Promise<ActionResult<Instructor>> {
  const parsed = instructorInsertSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: first?.message ?? "Invalid input",
        field: first?.path.join("."),
      },
    };
  }

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { data, error } = await supabase
    .from("instructors")
    .insert({ ...parsed.data, org_id: orgId })
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505"
        ? "An instructor with that email already exists in this organization."
        : error.message;
    return { ok: false, error: { code: error.code, message } };
  }

  revalidatePath("/instructors");
  return { ok: true, data: data as Instructor };
}

export async function updateInstructor(
  id: string,
  input: unknown,
): Promise<ActionResult<Instructor>> {
  const parsed = instructorUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: first?.message ?? "Invalid input",
        field: first?.path.join("."),
      },
    };
  }

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { data, error } = await supabase
    .from("instructors")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505"
        ? "An instructor with that email already exists in this organization."
        : error.message;
    return { ok: false, error: { code: error.code, message } };
  }

  revalidatePath("/instructors");
  revalidatePath(`/instructors/${id}`);
  return { ok: true, data: data as Instructor };
}

export async function softDeleteInstructor(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { error } = await supabase
    .from("instructors")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/instructors");
  revalidatePath(`/instructors/${id}`);
  return { ok: true, data: { id } };
}

export async function restoreInstructor(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { error } = await supabase
    .from("instructors")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("org_id", orgId)
    .not("deleted_at", "is", null);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/instructors");
  revalidatePath(`/instructors/${id}`);
  return { ok: true, data: { id } };
}
