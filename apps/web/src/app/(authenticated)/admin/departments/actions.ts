"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function createDepartment(input: {
  name: string;
  description?: string;
}): Promise<ActionResult<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: { code: "VALIDATION", message: "Name is required" } };

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  // Slug must be unique per org. Append a number if there's a collision.
  let slug = slugify(name);
  if (!slug) slug = `dept-${Date.now().toString(36)}`;
  const baseSlug = slug;
  let suffix = 1;
  while (suffix < 100) {
    const { data: existing } = await supabase
      .from("departments")
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${String(suffix)}`;
    suffix += 1;
  }

  const { data, error } = await supabase
    .from("departments")
    .insert({
      org_id: orgId,
      name,
      slug,
      description: input.description?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/admin/departments");
  return { ok: true, data: { id: data.id } };
}

export async function renameDepartment(
  id: string,
  name: string,
): Promise<ActionResult<{ id: string }>> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: { code: "VALIDATION", message: "Name is required" } };

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { error } = await supabase
    .from("departments")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/admin/departments");
  return { ok: true, data: { id } };
}

export async function deleteDepartment(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  // Refuse to delete the last department in an org.
  const { count } = await supabase
    .from("departments")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  if ((count ?? 0) <= 1) {
    return {
      ok: false,
      error: { code: "LAST_DEPARTMENT", message: "Can't delete the only department in this org." },
    };
  }

  // Refuse to delete a department that still has data attached. Cascade would
  // wipe instructors / classes / projects / etc., which is almost always a
  // mistake. Force the user to move records first.
  const { count: instructorCount } = await supabase
    .from("instructors")
    .select("id", { count: "exact", head: true })
    .eq("department_id", id)
    .is("deleted_at", null);
  if ((instructorCount ?? 0) > 0) {
    return {
      ok: false,
      error: {
        code: "HAS_DATA",
        message: `Department has ${String(instructorCount)} active instructor(s). Move or archive them first.`,
      },
    };
  }

  const { error } = await supabase.from("departments").delete().eq("id", id).eq("org_id", orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/admin/departments");
  return { ok: true, data: { id } };
}
