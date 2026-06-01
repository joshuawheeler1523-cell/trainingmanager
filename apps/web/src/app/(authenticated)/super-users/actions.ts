"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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

  // Enforce the (class_id IS NOT NULL OR topic non-empty) constraint
  // against the POST-MERGE state. The schema can only catch the case
  // where both are explicitly nulled in the same payload; partial
  // patches need the existing row to validate correctly.
  const patch = parsed.data;
  if (patch.class_id === null || patch.topic === null || patch.topic === "") {
    const { data: existing } = await supabase
      .from("super_users")
      .select("class_id, topic")
      .eq("id", id)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Super user not found" } };
    }
    const nextClassId = patch.class_id !== undefined ? patch.class_id : existing.class_id;
    const nextTopicRaw = patch.topic !== undefined ? patch.topic : existing.topic;
    const nextTopic =
      typeof nextTopicRaw === "string" && nextTopicRaw.trim().length > 0 ? nextTopicRaw : null;
    if (nextClassId == null && nextTopic == null) {
      return {
        ok: false,
        error: {
          code: "VALIDATION",
          message: "Either link a class or enter a topic",
          field: "topic",
        },
      };
    }
  }

  const { data, error } = await supabase
    .from("super_users")
    .update(
      Object.fromEntries(
        Object.entries(patch as Record<string, unknown>).filter(([, v]) => v !== undefined),
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

// ── CSV import ───────────────────────────────────────────────────────────────

type ImportRowResult = {
  row: number; // 1-based row number in the source CSV (header is row 1)
  action: "created" | "updated" | "failed";
  message?: string;
};

type ImportResult = {
  created: number;
  updated: number;
  failed: number;
  results: ImportRowResult[];
};

const csvOptionalString = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

const csvOptionalDate = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v.trim()))
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "trained_at must be YYYY-MM-DD")
      .nullable(),
  );

const csvSuperUserSchema = z.object({
  full_name: z.string().trim().min(1, "full_name is required").max(200),
  email: csvOptionalString,
  phone: csvOptionalString,
  unit: csvOptionalString,
  class_name: csvOptionalString,
  topic: csvOptionalString,
  trained_at: csvOptionalDate,
});

/**
 * Insert-only CSV import. A person can be a super user for multiple
 * classes/topics, so there's no safe upsert key — every row inserts a new
 * super_user. `class_name` is resolved to a class_id (case-insensitive, first
 * match); each row must resolve a class OR carry a topic (the table's
 * class-or-topic rule). New super users land in the current department.
 */
export async function importSuperUsersCsv(rawRows: unknown): Promise<ActionResult<ImportResult>> {
  if (!Array.isArray(rawRows)) {
    return { ok: false, error: { code: "BAD_INPUT", message: "Expected an array of rows" } };
  }

  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

  const { data: classRows, error: fetchErr } = await supabase
    .from("classes")
    .select("id, name")
    .eq("org_id", orgId)
    .is("deleted_at", null);
  if (fetchErr) return { ok: false, error: { code: fetchErr.code, message: fetchErr.message } };
  const classIdByLowerName = new Map<string, string>();
  for (const c of classRows) {
    const key = c.name.toLowerCase();
    if (!classIdByLowerName.has(key)) classIdByLowerName.set(key, c.id);
  }

  const results: ImportRowResult[] = [];
  let created = 0;
  let failed = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2; // header is row 1
    const parsed = csvSuperUserSchema.safeParse(rawRows[i]);
    if (!parsed.success) {
      failed++;
      results.push({
        row: rowNum,
        action: "failed",
        message: parsed.error.errors[0]?.message ?? "Invalid row",
      });
      continue;
    }
    const data = parsed.data;

    let classId: string | null = null;
    if (data.class_name) {
      classId = classIdByLowerName.get(data.class_name.toLowerCase()) ?? null;
      if (!classId) {
        failed++;
        results.push({
          row: rowNum,
          action: "failed",
          message: `No class named "${data.class_name}"`,
        });
        continue;
      }
    }

    if (!classId && !data.topic) {
      failed++;
      results.push({ row: rowNum, action: "failed", message: "Provide a class_name or a topic" });
      continue;
    }

    const { error } = await supabase.from("super_users").insert({
      org_id: orgId,
      department_id: departmentId,
      full_name: data.full_name,
      email: data.email,
      phone: data.phone,
      unit: data.unit,
      class_id: classId,
      topic: data.topic,
      trained_at: data.trained_at,
    });
    if (error) {
      failed++;
      results.push({ row: rowNum, action: "failed", message: error.message });
    } else {
      created++;
      results.push({ row: rowNum, action: "created" });
    }
  }

  revalidatePath("/super-users");
  return { ok: true, data: { created, updated: 0, failed, results } };
}
