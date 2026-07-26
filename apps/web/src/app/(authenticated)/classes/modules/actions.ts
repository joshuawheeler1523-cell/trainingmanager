"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import { classModuleInputSchema, classModuleUpdateSchema } from "@arbor/shared";
import type { ActionResult, ClassModule } from "@arbor/shared";
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

export async function createClassModule(input: unknown): Promise<ActionResult<ClassModule>> {
  const parsed = classModuleInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

  const { data, error } = await supabase
    .from("class_modules")
    .insert({ ...parsed.data, org_id: orgId, department_id: departmentId })
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505" ? "A module with that name already exists." : error.message;
    return { ok: false, error: { code: error.code, message } };
  }
  revalidatePath("/classes");
  revalidatePath("/classes/modules");
  return { ok: true, data };
}

export async function updateClassModule(
  id: string,
  input: unknown,
): Promise<ActionResult<ClassModule>> {
  const parsed = classModuleUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const updates = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  ) as unknown as TablesUpdate<"class_modules">;
  const { data, error } = await supabase
    .from("class_modules")
    .update(updates)
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505" ? "A module with that name already exists." : error.message;
    return { ok: false, error: { code: error.code, message } };
  }
  revalidatePath("/classes");
  revalidatePath("/classes/modules");
  return { ok: true, data };
}

/**
 * Soft-delete a module. Classes keep existing but are unassigned (the FK is
 * `on delete set null`); since this is a soft delete we null out module_id on
 * the org's classes that point at it so the unique-name index frees up and the
 * UI stops showing a dangling module.
 */
export async function deleteClassModule(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  await supabase
    .from("classes")
    .update({ module_id: null })
    .eq("org_id", orgId)
    .eq("module_id", id);

  const { error } = await supabase
    .from("class_modules")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/classes");
  revalidatePath("/classes/modules");
  return { ok: true, data: { id } };
}
