"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import { isManager } from "@/lib/auth/role";
import {
  bucketInsertSchema,
  bucketUpdateSchema,
  bucketReorderSchema,
  allocationSlateSchema,
  groupInsertSchema,
  groupUpdateSchema,
} from "@arbor/shared";
import type { AllocationBucket, AllocationGroup } from "@arbor/shared";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { BUCKET_TEMPLATES } from "./templates";

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

async function ctx() {
  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) {
    return { ok: false as const, error: { code: "NO_ORG", message: "No active organization" } };
  }
  if (!departmentId) {
    return {
      ok: false as const,
      error: { code: "NO_DEPARTMENT", message: "No active department" },
    };
  }
  // Defense-in-depth: allocation mutations are manager-only. RLS also
  // enforces this; the app-layer check fails fast with a clean error
  // before any DB round-trip.
  if (!(await isManager(orgId))) {
    return { ok: false as const, error: { code: "FORBIDDEN", message: "Permission denied" } };
  }
  return { ok: true as const, supabase, orgId, departmentId };
}

// ── allocation_buckets ──────────────────────────────────────────────────────

export async function createBucket(input: unknown): Promise<ActionResult<AllocationBucket>> {
  const parsed = bucketInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("allocation_buckets")
    .insert({ ...parsed.data, org_id: c.orgId, department_id: c.departmentId })
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505"
        ? "A bucket with that name already exists in this organization."
        : error.message;
    return { ok: false, error: { code: error.code, message } };
  }

  revalidatePath("/allocations");
  return { ok: true, data };
}

export async function updateBucket(
  id: string,
  input: unknown,
): Promise<ActionResult<AllocationBucket>> {
  const parsed = bucketUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("allocation_buckets")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"allocation_buckets">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505"
        ? "A bucket with that name already exists in this organization."
        : error.message;
    return { ok: false, error: { code: error.code, message } };
  }

  revalidatePath("/allocations");
  return { ok: true, data };
}

export async function archiveBucket(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("allocation_buckets")
    .update({ is_archived: true })
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/allocations");
  return { ok: true, data: { id } };
}

export async function unarchiveBucket(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("allocation_buckets")
    .update({ is_archived: false })
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/allocations");
  return { ok: true, data: { id } };
}

/**
 * Apply a bucket template: archive every existing non-archived bucket,
 * create the template's slate fresh, set global allocation percentages
 * to match, and remap any references to the old buckets so historical
 * assignments re-categorize under the new buckets by case-insensitive
 * name match.
 *
 * Buckets aren't hard-deleted — they're archived (soft delete) so any
 * unmatched allocation rows stay valid for historical reads. The user
 * can restore them later from "Show archived".
 */
export async function applyBucketTemplate(
  templateId: string,
): Promise<ActionResult<{ created: number }>> {
  const template = BUCKET_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Unknown template" } };
  }

  const c = await ctx();
  if (!c.ok) return c;

  // 1. Capture active old buckets BEFORE archiving so we can remap
  //    workload + override rows to the template's equivalents.
  const { data: oldBuckets, error: oldErr } = await c.supabase
    .from("allocation_buckets")
    .select("id, name")
    .eq("org_id", c.orgId)
    .eq("is_archived", false);
  if (oldErr) {
    return { ok: false, error: { code: oldErr.code, message: oldErr.message } };
  }

  // 2. Archive every active bucket — preserves history, hides from pickers.
  const { error: archiveErr } = await c.supabase
    .from("allocation_buckets")
    .update({ is_archived: true })
    .eq("org_id", c.orgId)
    .eq("is_archived", false);
  if (archiveErr) {
    return { ok: false, error: { code: archiveErr.code, message: archiveErr.message } };
  }

  // 3. Insert the template's bucket slate. display_order matches array
  //    order so the UI shows them in template-defined sequence.
  const newRows = template.buckets.map((b, i) => ({
    org_id: c.orgId,
    department_id: c.departmentId,
    name: b.name,
    description: b.description,
    color: b.color,
    display_order: i,
    is_archived: false,
  }));
  const { data: inserted, error: insertErr } = await c.supabase
    .from("allocation_buckets")
    .insert(newRows)
    .select("id, name");
  if (insertErr) {
    const message =
      insertErr.code === "23505"
        ? "A bucket with one of the template's names already exists. Archive or rename it first."
        : insertErr.message;
    return { ok: false, error: { code: insertErr.code, message } };
  }

  // 4. Remap workload + override rows from old bucket IDs to the new
  //    template bucket IDs by case-insensitive name match. Without this,
  //    every class / recurring task / ad-hoc task / project / group +
  //    individual override would still point at the now-archived bucket,
  //    causing the per-instructor segmented bars (and bucket consumption
  //    panel) to render blank even though the % totals still compute.
  const newByName = new Map(inserted.map((b) => [b.name.toLowerCase().trim(), b.id] as const));
  const remap: { oldId: string; newId: string }[] = [];
  for (const old of oldBuckets) {
    const newId = newByName.get(old.name.toLowerCase().trim());
    if (newId) remap.push({ oldId: old.id, newId });
  }
  for (const { oldId, newId } of remap) {
    const results = await Promise.all([
      c.supabase
        .from("classes")
        .update({ allocation_bucket_id: newId })
        .eq("org_id", c.orgId)
        .eq("allocation_bucket_id", oldId),
      c.supabase
        .from("recurring_tasks")
        .update({ bucket_id: newId })
        .eq("org_id", c.orgId)
        .eq("bucket_id", oldId),
      c.supabase
        .from("ad_hoc_tasks")
        .update({ bucket_id: newId })
        .eq("org_id", c.orgId)
        .eq("bucket_id", oldId),
      c.supabase
        .from("projects")
        .update({ bucket_id: newId })
        .eq("org_id", c.orgId)
        .eq("bucket_id", oldId),
      c.supabase
        .from("group_allocations")
        .update({ bucket_id: newId })
        .eq("org_id", c.orgId)
        .eq("bucket_id", oldId),
      c.supabase
        .from("individual_allocations")
        .update({ bucket_id: newId })
        .eq("org_id", c.orgId)
        .eq("bucket_id", oldId),
    ]);
    for (const r of results) {
      if (r.error) {
        return { ok: false, error: { code: r.error.code, message: r.error.message } };
      }
    }
  }

  // 5. Replace global_allocations with the template's percentages.
  //    Older global rows for archived buckets are removed so the
  //    Global tab shows a clean slate.
  const { error: clearErr } = await c.supabase
    .from("global_allocations")
    .delete()
    .eq("org_id", c.orgId);
  if (clearErr) {
    return { ok: false, error: { code: clearErr.code, message: clearErr.message } };
  }

  const idByName = new Map(inserted.map((b) => [b.name, b.id]));
  const allocRows = template.buckets
    .map((b) => {
      const bucketId = idByName.get(b.name);
      if (!bucketId) return null;
      return {
        org_id: c.orgId,
        department_id: c.departmentId,
        bucket_id: bucketId,
        target_percent: b.percent,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (allocRows.length > 0) {
    const { error: allocErr } = await c.supabase.from("global_allocations").insert(allocRows);
    if (allocErr) {
      return { ok: false, error: { code: allocErr.code, message: allocErr.message } };
    }
  }

  revalidatePath("/allocations");
  return { ok: true, data: { created: inserted.length } };
}

export async function reorderBuckets(input: unknown): Promise<ActionResult<{ count: number }>> {
  const parsed = bucketReorderSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  // Issue updates one at a time; the list is small (typically 5-12 buckets).
  for (const row of parsed.data) {
    const { error } = await c.supabase
      .from("allocation_buckets")
      .update({ display_order: row.display_order })
      .eq("id", row.id)
      .eq("org_id", c.orgId);
    if (error) return { ok: false, error: { code: error.code, message: error.message } };
  }

  revalidatePath("/allocations");
  return { ok: true, data: { count: parsed.data.length } };
}

// ── global_allocations ──────────────────────────────────────────────────────

export async function saveGlobalAllocations(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = allocationSlateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  // Upsert each (org_id, bucket_id) row; remove any rows for buckets not in the slate.
  const bucketIds = parsed.data.map((s) => s.bucket_id);

  // Delete any global rows for this org whose bucket_id isn't in the new slate
  const { error: deleteErr } =
    bucketIds.length === 0
      ? await c.supabase.from("global_allocations").delete().eq("org_id", c.orgId)
      : await c.supabase
          .from("global_allocations")
          .delete()
          .eq("org_id", c.orgId)
          .not("bucket_id", "in", `(${bucketIds.map((b) => `"${b}"`).join(",")})`);
  if (deleteErr) return { ok: false, error: { code: deleteErr.code, message: deleteErr.message } };

  if (parsed.data.length > 0) {
    const { error: upsertErr } = await c.supabase.from("global_allocations").upsert(
      parsed.data.map((s) => ({
        org_id: c.orgId,
        department_id: c.departmentId,
        bucket_id: s.bucket_id,
        target_percent: s.target_percent,
      })),
      { onConflict: "org_id,bucket_id" },
    );
    if (upsertErr)
      return { ok: false, error: { code: upsertErr.code, message: upsertErr.message } };
  }

  revalidatePath("/allocations");
  return { ok: true, data: { count: parsed.data.length } };
}

// ── allocation_groups ───────────────────────────────────────────────────────

export async function createGroup(input: unknown): Promise<ActionResult<AllocationGroup>> {
  const parsed = groupInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("allocation_groups")
    .insert({ ...parsed.data, org_id: c.orgId, department_id: c.departmentId })
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505"
        ? "A group with that name already exists in this organization."
        : error.message;
    return { ok: false, error: { code: error.code, message } };
  }

  revalidatePath("/allocations");
  return { ok: true, data };
}

export async function updateGroup(
  id: string,
  input: unknown,
): Promise<ActionResult<AllocationGroup>> {
  const parsed = groupUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("allocation_groups")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"allocation_groups">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505"
        ? "A group with that name already exists in this organization."
        : error.message;
    return { ok: false, error: { code: error.code, message } };
  }

  revalidatePath("/allocations");
  return { ok: true, data };
}

export async function deleteGroup(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("allocation_groups")
    .delete()
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/allocations");
  return { ok: true, data: { id } };
}

export async function addGroupMember(
  groupId: string,
  instructorId: string,
): Promise<ActionResult<{ groupId: string; instructorId: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase.from("allocation_group_members").insert({
    group_id: groupId,
    instructor_id: instructorId,
    org_id: c.orgId,
    department_id: c.departmentId,
  });

  if (error) {
    const message = error.code === "23505" ? "Instructor is already in this group." : error.message;
    return { ok: false, error: { code: error.code, message } };
  }

  revalidatePath("/allocations");
  return { ok: true, data: { groupId, instructorId } };
}

export async function removeGroupMember(
  groupId: string,
  instructorId: string,
): Promise<ActionResult<{ groupId: string; instructorId: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("allocation_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("instructor_id", instructorId)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/allocations");
  return { ok: true, data: { groupId, instructorId } };
}

export async function saveGroupAllocations(
  groupId: string,
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = allocationSlateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  // Touch the group's updated_at so the multi-group "most-recently-updated wins" rule fires.
  // We do this whether or not allocations changed to keep semantics simple.
  const { error: touchErr } = await c.supabase
    .from("allocation_groups")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("org_id", c.orgId);
  if (touchErr) return { ok: false, error: { code: touchErr.code, message: touchErr.message } };

  const bucketIds = parsed.data.map((s) => s.bucket_id);

  const { error: deleteErr } =
    bucketIds.length === 0
      ? await c.supabase
          .from("group_allocations")
          .delete()
          .eq("group_id", groupId)
          .eq("org_id", c.orgId)
      : await c.supabase
          .from("group_allocations")
          .delete()
          .eq("group_id", groupId)
          .eq("org_id", c.orgId)
          .not("bucket_id", "in", `(${bucketIds.map((b) => `"${b}"`).join(",")})`);
  if (deleteErr) return { ok: false, error: { code: deleteErr.code, message: deleteErr.message } };

  if (parsed.data.length > 0) {
    const { error: upsertErr } = await c.supabase.from("group_allocations").upsert(
      parsed.data.map((s) => ({
        org_id: c.orgId,
        department_id: c.departmentId,
        group_id: groupId,
        bucket_id: s.bucket_id,
        target_percent: s.target_percent,
      })),
      { onConflict: "group_id,bucket_id" },
    );
    if (upsertErr)
      return { ok: false, error: { code: upsertErr.code, message: upsertErr.message } };
  }

  revalidatePath("/allocations");
  return { ok: true, data: { count: parsed.data.length } };
}

// ── individual_allocations ──────────────────────────────────────────────────

export async function saveIndividualAllocations(
  instructorId: string,
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = allocationSlateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const bucketIds = parsed.data.map((s) => s.bucket_id);

  const { error: deleteErr } =
    bucketIds.length === 0
      ? await c.supabase
          .from("individual_allocations")
          .delete()
          .eq("instructor_id", instructorId)
          .eq("org_id", c.orgId)
      : await c.supabase
          .from("individual_allocations")
          .delete()
          .eq("instructor_id", instructorId)
          .eq("org_id", c.orgId)
          .not("bucket_id", "in", `(${bucketIds.map((b) => `"${b}"`).join(",")})`);
  if (deleteErr) return { ok: false, error: { code: deleteErr.code, message: deleteErr.message } };

  if (parsed.data.length > 0) {
    const { error: upsertErr } = await c.supabase.from("individual_allocations").upsert(
      parsed.data.map((s) => ({
        org_id: c.orgId,
        department_id: c.departmentId,
        instructor_id: instructorId,
        bucket_id: s.bucket_id,
        target_percent: s.target_percent,
      })),
      { onConflict: "instructor_id,bucket_id" },
    );
    if (upsertErr)
      return { ok: false, error: { code: upsertErr.code, message: upsertErr.message } };
  }

  revalidatePath("/allocations");
  return { ok: true, data: { count: parsed.data.length } };
}

// Removes all individual_allocations for an instructor, falling them back to
// their group (if any) or the global default.
export async function resetIndividualAllocations(
  instructorId: string,
): Promise<ActionResult<{ instructorId: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("individual_allocations")
    .delete()
    .eq("instructor_id", instructorId)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/allocations");
  return { ok: true, data: { instructorId } };
}
