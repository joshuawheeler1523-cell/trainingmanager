"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import { implSuperUserInsertSchema, implSuperUserUpdateSchema } from "@arbor/shared";
import type { ImplSuperUser } from "@arbor/shared";
import type { TablesUpdate } from "@/lib/supabase/database.types";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };

export async function createImplSuperUser(
  implementationId: string,
  input: unknown,
): Promise<ActionResult<ImplSuperUser>> {
  const parsed = implSuperUserInsertSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: first?.message ?? "Invalid input",
        ...(first?.path[0] ? { field: String(first.path[0]) } : {}),
      },
    };
  }

  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

  const { data, error } = await supabase
    .from("impl_super_users")
    .insert({
      ...parsed.data,
      org_id: orgId,
      department_id: departmentId,
      implementation_id: implementationId,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath(`/training-planner/${implementationId}/super-users`);
  return { ok: true, data };
}

export async function updateImplSuperUser(
  id: string,
  input: unknown,
): Promise<ActionResult<ImplSuperUser>> {
  const parsed = implSuperUserUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: first?.message ?? "Invalid input",
        ...(first?.path[0] ? { field: String(first.path[0]) } : {}),
      },
    };
  }

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { data, error } = await supabase
    .from("impl_super_users")
    .update(
      Object.fromEntries(
        Object.entries(parsed.data as Record<string, unknown>).filter(([, v]) => v !== undefined),
      ) as unknown as TablesUpdate<"impl_super_users">,
    )
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath(`/training-planner/${data.implementation_id}/super-users`);
  return { ok: true, data };
}

export async function softDeleteImplSuperUser(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { data, error } = await supabase
    .from("impl_super_users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .select("implementation_id")
    .maybeSingle();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  if (data?.implementation_id) {
    revalidatePath(`/training-planner/${data.implementation_id}/super-users`);
  }
  return { ok: true, data: { id } };
}

export async function restoreImplSuperUser(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { data, error } = await supabase
    .from("impl_super_users")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("org_id", orgId)
    .not("deleted_at", "is", null)
    .select("implementation_id")
    .maybeSingle();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  if (data?.implementation_id) {
    revalidatePath(`/training-planner/${data.implementation_id}/super-users`);
  }
  return { ok: true, data: { id } };
}

export async function markImplSuperUserTrained(
  id: string,
  trained: boolean,
): Promise<ActionResult<{ id: string; trained_at: string | null }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const trained_at = trained ? new Date().toISOString().slice(0, 10) : null;

  const { data, error } = await supabase
    .from("impl_super_users")
    .update({ trained_at })
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .select("id, trained_at, implementation_id")
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath(`/training-planner/${data.implementation_id}/super-users`);
  return { ok: true, data: { id: data.id, trained_at: data.trained_at } };
}
