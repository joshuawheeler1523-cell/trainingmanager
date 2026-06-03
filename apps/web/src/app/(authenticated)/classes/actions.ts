"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
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

  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

  const { data, error } = await supabase
    .from("classes")
    .insert({ ...parsed.data, org_id: orgId, department_id: departmentId })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/classes");
  return { ok: true, data: data as Class };
}

export async function updateClass(id: string, input: unknown): Promise<ActionResult<Class>> {
  const parsed = classUpdateSchema.safeParse(input);
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
  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

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

  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

  const { data, error } = await supabase
    .from("class_instructor_assignments")
    .upsert(
      {
        org_id: orgId,
        department_id: departmentId,
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
  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

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

/**
 * Spread the class's offerings_per_year evenly across all current
 * instructor assignments. The remainder (when offerings don't divide
 * cleanly) goes to the first N rows alphabetically by instructor name —
 * stable and predictable, no winners-and-losers feel.
 */
export async function distributeOfferingsEvenly(
  classId: string,
): Promise<ActionResult<{ count: number; total: number }>> {
  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

  const { data: cls, error: clsErr } = await supabase
    .from("classes")
    .select("id, offerings_per_year")
    .eq("id", classId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single();
  if (clsErr) {
    return { ok: false, error: { code: clsErr.code, message: clsErr.message } };
  }

  const { data: rows, error: rowsErr } = await supabase
    .from("class_instructor_assignments")
    .select("id, instructor_id, role, instructor:instructors!inner(full_name)")
    .eq("class_id", classId)
    .eq("org_id", orgId);
  if (rowsErr) return { ok: false, error: { code: rowsErr.code, message: rowsErr.message } };
  if (rows.length === 0) {
    return {
      ok: false,
      error: { code: "NO_ASSIGNMENTS", message: "No instructors assigned yet" },
    };
  }

  type Row = {
    id: string;
    instructor_id: string;
    role: string;
    instructor: { full_name: string } | { full_name: string }[] | null;
  };
  const sorted = (rows as Row[]).slice().sort((a, b) => {
    const an = Array.isArray(a.instructor)
      ? (a.instructor[0]?.full_name ?? "")
      : (a.instructor?.full_name ?? "");
    const bn = Array.isArray(b.instructor)
      ? (b.instructor[0]?.full_name ?? "")
      : (b.instructor?.full_name ?? "");
    return an.localeCompare(bn);
  });

  const total = cls.offerings_per_year;
  const n = sorted.length;
  const base = Math.floor(total / n);
  const remainder = total - base * n;

  const updates = sorted.map((r, i) => ({
    org_id: orgId,
    department_id: departmentId,
    class_id: classId,
    instructor_id: r.instructor_id,
    role: r.role,
    assigned_offerings: base + (i < remainder ? 1 : 0),
  }));

  const { error: upErr } = await supabase
    .from("class_instructor_assignments")
    .upsert(updates, { onConflict: "class_id,instructor_id" });
  if (upErr) {
    const message =
      upErr.code === "23514" || upErr.message.includes("exceeds")
        ? "Total assigned offerings would exceed the class limit."
        : upErr.message;
    return { ok: false, error: { code: upErr.code, message } };
  }

  revalidatePath(`/classes/${classId}`);
  return { ok: true, data: { count: n, total } };
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

const csvBool = z
  .string()
  .nullish()
  .transform((s) => {
    const v = (s ?? "").trim().toLowerCase();
    return v === "true" || v === "yes" || v === "1" || v === "y";
  });

const csvOptionalString = z
  .string()
  .nullish()
  .transform((s) => s?.trim() || null);

const csvNumberOr = (defaultValue: number) =>
  z
    .string()
    .nullish()
    .transform((s) => {
      const v = (s ?? "").trim();
      if (v === "") return defaultValue;
      const n = Number(v);
      return Number.isNaN(n) ? Number.NaN : n;
    });

const csvIntOr = (defaultValue: number) =>
  z
    .string()
    .nullish()
    .transform((s) => {
      const v = (s ?? "").trim();
      if (v === "") return defaultValue;
      const n = Number(v);
      return Number.isNaN(n) ? Number.NaN : Math.trunc(n);
    });

// Per-day hours for multi-day classes with different times each day.
// Accepts a separated list (";", "|", or ",") e.g. "4;3;2". Empty → null
// (fall back to a flat hours_per_day across every day).
const csvDayHours = z
  .string()
  .nullish()
  .transform((s) => {
    const v = (s ?? "").trim();
    if (v === "") return null;
    return v
      .split(/[;|,]/)
      .map((p) => p.trim())
      .filter((p) => p !== "")
      .map((p) => Number(p));
  });

const csvClassSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(200),
    description: csvOptionalString,
    module: csvOptionalString,
    is_multi_day: csvBool,
    total_days: csvIntOr(1).pipe(z.number().int().min(1)),
    hours_per_day: csvNumberOr(0).pipe(z.number().min(0)),
    custom_day_hours: csvDayHours,
    offerings_per_year: csvIntOr(0).pipe(z.number().int().min(0)),
    prep_hours_per_offering: csvNumberOr(0).pipe(z.number().min(0)),
    logistics_hours_per_offering: csvNumberOr(0).pipe(z.number().min(0)),
    status: z
      .string()
      .nullish()
      .transform((s) => s?.trim().toLowerCase() || "active")
      .pipe(z.enum(["active", "archived"])),
  })
  .superRefine((d, ctx) => {
    if (d.is_multi_day && d.total_days < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "is_multi_day=true requires total_days>=2",
        path: ["total_days"],
      });
    }
    if (d.custom_day_hours != null) {
      if (!d.is_multi_day) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "custom_day_hours only applies when is_multi_day=true",
          path: ["custom_day_hours"],
        });
      }
      if (d.custom_day_hours.some((n) => Number.isNaN(n) || n < 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "custom_day_hours must be non-negative numbers (e.g. 4;3;2)",
          path: ["custom_day_hours"],
        });
      } else if (d.custom_day_hours.length !== d.total_days) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `custom_day_hours must list exactly ${String(d.total_days)} values (one per day)`,
          path: ["custom_day_hours"],
        });
      }
    }
  });

export async function importClassesCsv(rawRows: unknown): Promise<ActionResult<ImportResult>> {
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

  // No unique constraint on class name, so look up the FIRST match (case-
  // insensitive) per row and update it. New names always insert.
  const { data: existing, error: fetchErr } = await supabase
    .from("classes")
    .select("id, name")
    .eq("org_id", orgId)
    .is("deleted_at", null);
  if (fetchErr) {
    return { ok: false, error: { code: fetchErr.code, message: fetchErr.message } };
  }
  const idByLowerName = new Map<string, string>();
  for (const c of existing) {
    const key = c.name.toLowerCase();
    if (!idByLowerName.has(key)) idByLowerName.set(key, c.id);
  }

  // Modules referenced by the `module` column are resolved by name (case-
  // insensitive) within the import's department and auto-created on first
  // sight, so an import can introduce new modules inline without a separate
  // step. Scoped to departmentId since modules are department-owned.
  const { data: existingModules } = await supabase
    .from("class_modules")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("department_id", departmentId)
    .is("deleted_at", null);
  const moduleIdByLowerName = new Map<string, string>();
  for (const m of existingModules ?? []) {
    const key = m.name.toLowerCase();
    if (!moduleIdByLowerName.has(key)) moduleIdByLowerName.set(key, m.id);
  }
  const resolvedOrgId = orgId;
  const resolvedDepartmentId = departmentId;
  async function resolveModuleId(name: string | null): Promise<string | null> {
    if (!name) return null;
    const key = name.toLowerCase();
    const existingId = moduleIdByLowerName.get(key);
    if (existingId) return existingId;
    const { data: created } = await supabase
      .from("class_modules")
      .insert({ org_id: resolvedOrgId, department_id: resolvedDepartmentId, name })
      .select("id")
      .single();
    if (created) moduleIdByLowerName.set(key, created.id);
    return created?.id ?? null;
  }

  const results: ImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2;
    const parsed = csvClassSchema.safeParse(rawRows[i]);
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
    const existingId = idByLowerName.get(data.name.toLowerCase());
    const moduleId = await resolveModuleId(data.module);

    if (existingId) {
      const { error } = await supabase
        .from("classes")
        .update({
          name: data.name,
          description: data.description,
          module_id: moduleId,
          is_multi_day: data.is_multi_day,
          total_days: data.total_days,
          hours_per_day: data.hours_per_day,
          custom_day_hours: data.custom_day_hours,
          offerings_per_year: data.offerings_per_year,
          prep_hours_per_offering: data.prep_hours_per_offering,
          logistics_hours_per_offering: data.logistics_hours_per_offering,
          status: data.status,
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
        .from("classes")
        .insert({
          org_id: orgId,
          department_id: departmentId,
          name: data.name,
          description: data.description,
          module_id: moduleId,
          is_multi_day: data.is_multi_day,
          total_days: data.total_days,
          hours_per_day: data.hours_per_day,
          custom_day_hours: data.custom_day_hours,
          offerings_per_year: data.offerings_per_year,
          prep_hours_per_offering: data.prep_hours_per_offering,
          logistics_hours_per_offering: data.logistics_hours_per_offering,
          status: data.status,
        })
        .select("id, name")
        .single();
      if (error) {
        failed++;
        results.push({ row: rowNum, action: "failed", message: error.message });
      } else {
        created++;
        results.push({ row: rowNum, action: "created" });
        idByLowerName.set(insertData.name.toLowerCase(), insertData.id);
      }
    }
  }

  revalidatePath("/classes");
  return { ok: true, data: { created, updated, failed, results } };
}

export async function restoreClass(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

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
