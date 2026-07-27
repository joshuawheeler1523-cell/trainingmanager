"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import { instructorInsertSchema, instructorUpdateSchema } from "@arbor/shared";
import type { ActionResult, Instructor } from "@arbor/shared";
import type { TablesUpdate } from "@/lib/supabase/database.types";

export async function createInstructor(input: unknown): Promise<ActionResult<Instructor>> {
  const parsed = instructorInsertSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
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

  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

  const { data, error } = await supabase
    .from("instructors")
    .insert({ ...parsed.data, org_id: orgId, department_id: departmentId })
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

  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

  const { data, error } = await supabase
    .from("instructors")
    .update(
      Object.fromEntries(
        Object.entries(parsed.data as Record<string, unknown>).filter(([, v]) => v !== undefined),
      ) as unknown as TablesUpdate<"instructors">,
    )
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

const bulkAnnualHoursSchema = z.object({
  annual_hours: z.coerce.number().int().min(0).max(4000),
});

export async function bulkSetAnnualHours(
  input: unknown,
): Promise<ActionResult<{ updated: number }>> {
  const parsed = bulkAnnualHoursSchema.safeParse(input);
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
    .from("instructors")
    .update({ annual_hours: parsed.data.annual_hours })
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .select("id");

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/instructors");
  return { ok: true, data: { updated: data.length } };
}

export async function softDeleteInstructor(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

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

// ── CSV import ──────────────────────────────────────────────────────────────

type ImportRowResult = {
  row: number;
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
  .transform((s) => s?.trim() || null);

const csvOptionalEmail = z
  .string()
  .nullish()
  .transform((s) => s?.trim() || null)
  .pipe(z.string().email("Invalid email").nullable());

const csvStatus = z
  .string()
  .nullish()
  .transform((s) => s?.trim().toLowerCase() || "active")
  .pipe(z.enum(["active", "inactive", "on_leave"]));

const csvAnnualHours = z
  .string()
  .nullish()
  .transform((s) => {
    const v = (s ?? "").trim();
    if (v === "") return 1880;
    const n = Number(v);
    if (Number.isNaN(n)) return Number.NaN;
    return Math.trunc(n);
  })
  .pipe(z.number().int().min(0).max(4000));

const csvInstructorSchema = z.object({
  full_name: z.string().trim().min(1, "full_name is required").max(200),
  email: csvOptionalEmail,
  phone: csvOptionalString,
  department: csvOptionalString,
  location: csvOptionalString,
  job_title: csvOptionalString,
  start_date: csvOptionalString,
  annual_hours: csvAnnualHours,
  status: csvStatus,
});

export async function importInstructorsCsv(rawRows: unknown): Promise<ActionResult<ImportResult>> {
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

  // Pre-fetch existing by email so we can decide create-vs-update without
  // N round-trips. Rows with no email always insert.
  const { data: existing, error: fetchErr } = await supabase
    .from("instructors")
    .select("id, email")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .not("email", "is", null);
  if (fetchErr) {
    return { ok: false, error: { code: fetchErr.code, message: fetchErr.message } };
  }
  const idByEmail = new Map(existing.map((r) => [r.email.toLowerCase(), r.id] as const));

  const results: ImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2;
    const parsed = csvInstructorSchema.safeParse(rawRows[i]);
    if (!parsed.success) {
      failed++;
      results.push({
        row: rowNum,
        action: "failed",
        message: parsed.error.errors[0]?.message ?? "Invalid row",
      });
      continue;
    }

    const lookupEmail = parsed.data.email?.toLowerCase();
    const existingId = lookupEmail ? idByEmail.get(lookupEmail) : undefined;

    if (existingId) {
      const { error } = await supabase
        .from("instructors")
        .update({
          full_name: parsed.data.full_name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          department: parsed.data.department,
          location: parsed.data.location,
          job_title: parsed.data.job_title,
          start_date: parsed.data.start_date,
          annual_hours: parsed.data.annual_hours,
          status: parsed.data.status,
        })
        .eq("id", existingId)
        .eq("org_id", orgId);
      if (error) {
        failed++;
        results.push({ row: rowNum, action: "failed", message: error.message });
      } else {
        updated++;
        results.push({ row: rowNum, action: "updated" });
      }
    } else {
      const { data: insertData, error } = await supabase
        .from("instructors")
        .insert({
          org_id: orgId,
          department_id: departmentId,
          full_name: parsed.data.full_name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          department: parsed.data.department,
          location: parsed.data.location,
          job_title: parsed.data.job_title,
          start_date: parsed.data.start_date,
          annual_hours: parsed.data.annual_hours,
          status: parsed.data.status,
        })
        .select("id, email")
        .single();
      if (error) {
        failed++;
        results.push({ row: rowNum, action: "failed", message: error.message });
      } else {
        created++;
        results.push({ row: rowNum, action: "created" });
        if (insertData.email) {
          idByEmail.set(insertData.email.toLowerCase(), insertData.id);
        }
      }
    }
  }

  revalidatePath("/instructors");
  return { ok: true, data: { created, updated, failed, results } };
}

export async function restoreInstructor(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

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
