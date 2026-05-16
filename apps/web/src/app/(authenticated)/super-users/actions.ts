"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import { superUserInsertSchema, superUserUpdateSchema } from "@arbor/shared";
import type { SuperUser } from "@arbor/shared";
import type { TablesUpdate } from "@/lib/supabase/database.types";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };

export async function createSuperUser(input: unknown): Promise<ActionResult<SuperUser>> {
  const parsed = superUserInsertSchema.safeParse(input);
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
    .from("super_users")
    .insert({ ...parsed.data, org_id: orgId, department_id: departmentId })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/super-users");
  if (parsed.data.class_id) {
    revalidatePath(`/classes/${parsed.data.class_id}`);
  }
  return { ok: true, data };
}

export async function updateSuperUser(
  id: string,
  input: unknown,
): Promise<ActionResult<SuperUser>> {
  const parsed = superUserUpdateSchema.safeParse(input);
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
    .from("super_users")
    .update(
      Object.fromEntries(
        Object.entries(parsed.data as Record<string, unknown>).filter(([, v]) => v !== undefined),
      ) as unknown as TablesUpdate<"super_users">,
    )
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/super-users");
  if (data.class_id) revalidatePath(`/classes/${data.class_id}`);
  return { ok: true, data };
}

export async function softDeleteSuperUser(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { data, error } = await supabase
    .from("super_users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .select("class_id")
    .maybeSingle();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/super-users");
  if (data?.class_id) revalidatePath(`/classes/${data.class_id}`);
  return { ok: true, data: { id } };
}

export async function restoreSuperUser(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { error } = await supabase
    .from("super_users")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("org_id", orgId)
    .not("deleted_at", "is", null);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/super-users");
  return { ok: true, data: { id } };
}

export async function markSuperUserTrained(
  id: string,
  trained: boolean,
): Promise<ActionResult<{ id: string; trained_at: string | null }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const trained_at = trained ? new Date().toISOString().slice(0, 10) : null;

  const { data, error } = await supabase
    .from("super_users")
    .update({ trained_at })
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .select("id, trained_at, class_id")
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/super-users");
  if (data.class_id) revalidatePath(`/classes/${data.class_id}`);
  return { ok: true, data: { id: data.id, trained_at: data.trained_at } };
}
