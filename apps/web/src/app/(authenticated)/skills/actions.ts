"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getCurrentDepartmentId } from "@/lib/auth/current-department";
import {
  skillInsertSchema,
  skillUpdateSchema,
  instructorSkillSchema,
  instructorSkillUpdateSchema,
  classSkillRequirementSchema,
  classSkillRequirementUpdateSchema,
} from "@arbor/shared";
import type { ActionResult, ClassSkillRequirement, InstructorSkill, Skill } from "@arbor/shared";
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

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// ── skills CRUD ─────────────────────────────────────────────────────────────

export async function createSkill(input: unknown): Promise<ActionResult<Skill>> {
  const parsed = skillInsertSchema.safeParse(input);
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
    .from("skills")
    .insert({ ...parsed.data, org_id: orgId, department_id: departmentId })
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505"
        ? "A skill with that name already exists in this organization."
        : error.message;
    return { ok: false, error: { code: error.code, message } };
  }

  revalidatePath("/skills");
  return { ok: true, data };
}

export async function updateSkill(id: string, input: unknown): Promise<ActionResult<Skill>> {
  const parsed = skillUpdateSchema.safeParse(input);
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
    .from("skills")
    .update(
      stripUndefined(parsed.data as Record<string, unknown>) as unknown as TablesUpdate<"skills">,
    )
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505"
        ? "A skill with that name already exists in this organization."
        : error.message;
    return { ok: false, error: { code: error.code, message } };
  }

  revalidatePath("/skills");
  return { ok: true, data };
}

export async function archiveSkill(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

  const { error } = await supabase
    .from("skills")
    .update({ is_archived: true })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/skills");
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

// Lenient string-to-bool — CSVs come in as strings, so "true"/"yes"/"1" are
// truthy and everything else (including empty) is false.
const csvBool = z
  .string()
  .nullish()
  .transform((s) => {
    const v = (s ?? "").trim().toLowerCase();
    return v === "true" || v === "yes" || v === "1" || v === "y";
  });

const csvSkillSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  category: z
    .string()
    .nullish()
    .transform((s) => s?.trim() || null),
  description: z
    .string()
    .nullish()
    .transform((s) => s?.trim() || null),
  is_certification: csvBool,
  certifying_authority: z
    .string()
    .nullish()
    .transform((s) => s?.trim() || null),
});

export async function importSkillsCsv(rawRows: unknown): Promise<ActionResult<ImportResult>> {
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

  // Pre-fetch existing skills by name (case-insensitive lookup) so we can
  // decide create-vs-update without N round-trips.
  const { data: existing, error: fetchErr } = await supabase
    .from("skills")
    .select("id, name")
    .eq("org_id", orgId);
  if (fetchErr) {
    return { ok: false, error: { code: fetchErr.code, message: fetchErr.message } };
  }
  const byLowerName = new Map(existing.map((s) => [s.name.toLowerCase(), s.id] as const));

  const results: ImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2; // +1 for 1-based, +1 for header row
    const parsed = csvSkillSchema.safeParse(rawRows[i]);
    if (!parsed.success) {
      failed++;
      results.push({
        row: rowNum,
        action: "failed",
        message: parsed.error.errors[0]?.message ?? "Invalid row",
      });
      continue;
    }

    const existingId = byLowerName.get(parsed.data.name.toLowerCase());
    if (existingId) {
      const { error } = await supabase
        .from("skills")
        .update({
          name: parsed.data.name,
          category: parsed.data.category,
          description: parsed.data.description,
          is_certification: parsed.data.is_certification,
          certifying_authority: parsed.data.certifying_authority,
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
        .from("skills")
        .insert({
          org_id: orgId,
          department_id: departmentId,
          name: parsed.data.name,
          category: parsed.data.category,
          description: parsed.data.description,
          is_certification: parsed.data.is_certification,
          certifying_authority: parsed.data.certifying_authority,
          is_archived: false,
        })
        .select("id, name")
        .single();
      if (error) {
        failed++;
        results.push({ row: rowNum, action: "failed", message: error.message });
      } else {
        created++;
        results.push({ row: rowNum, action: "created" });
        // Track newly inserted name so a duplicate later in the same file
        // updates rather than fails on the unique constraint.
        byLowerName.set(insertData.name.toLowerCase(), insertData.id);
      }
    }
  }

  revalidatePath("/skills");
  return { ok: true, data: { created, updated, failed, results } };
}

export async function unarchiveSkill(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId, departmentId] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getCurrentDepartmentId(),
  ]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!departmentId)
    return { ok: false, error: { code: "NO_DEPARTMENT", message: "No active department" } };

  const { error } = await supabase
    .from("skills")
    .update({ is_archived: false })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/skills");
  return { ok: true, data: { id } };
}

// ── instructor_skills ───────────────────────────────────────────────────────

export async function addInstructorSkill(
  instructorId: string,
  input: unknown,
): Promise<ActionResult<InstructorSkill>> {
  const parsed = instructorSkillSchema.safeParse(input);
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
    .from("instructor_skills")
    .insert({
      org_id: orgId,
      department_id: departmentId,
      instructor_id: instructorId,
      skill_id: parsed.data.skill_id,
      proficiency: parsed.data.proficiency,
      is_certified: parsed.data.is_certified,
      certified_at: parsed.data.certified_at,
      expires_at: parsed.data.expires_at,
      certificate_url: parsed.data.certificate_url,
      notes: parsed.data.notes,
    })
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505" ? "This instructor already has that skill." : error.message;
    return { ok: false, error: { code: error.code, message } };
  }

  revalidatePath(`/instructors/${instructorId}`);
  revalidatePath("/skills");
  return { ok: true, data: data as InstructorSkill };
}

export async function updateInstructorSkill(
  instructorSkillId: string,
  instructorId: string,
  input: unknown,
): Promise<ActionResult<InstructorSkill>> {
  const parsed = instructorSkillUpdateSchema.safeParse(input);
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
    .from("instructor_skills")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"instructor_skills">,
    )
    .eq("id", instructorSkillId)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath(`/instructors/${instructorId}`);
  revalidatePath("/skills");
  return { ok: true, data: data as InstructorSkill };
}

export async function removeInstructorSkill(
  instructorSkillId: string,
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
    .from("instructor_skills")
    .delete()
    .eq("id", instructorSkillId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath(`/instructors/${instructorId}`);
  revalidatePath("/skills");
  return { ok: true, data: { id: instructorSkillId } };
}

// ── class_skill_requirements ────────────────────────────────────────────────

export async function addClassSkillRequirement(
  classId: string,
  input: unknown,
): Promise<ActionResult<ClassSkillRequirement>> {
  const parsed = classSkillRequirementSchema.safeParse(input);
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
    .from("class_skill_requirements")
    .insert({
      org_id: orgId,
      department_id: departmentId,
      class_id: classId,
      skill_id: parsed.data.skill_id,
      min_proficiency: parsed.data.min_proficiency,
      requirement: parsed.data.requirement,
    })
    .select()
    .single();

  if (error) {
    const message =
      error.code === "23505" ? "This skill is already required by this class." : error.message;
    return { ok: false, error: { code: error.code, message } };
  }

  revalidatePath(`/classes/${classId}`);
  revalidatePath("/skills");
  return { ok: true, data: data as ClassSkillRequirement };
}

export async function updateClassSkillRequirement(
  requirementId: string,
  classId: string,
  input: unknown,
): Promise<ActionResult<ClassSkillRequirement>> {
  const parsed = classSkillRequirementUpdateSchema.safeParse(input);
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
    .from("class_skill_requirements")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"class_skill_requirements">,
    )
    .eq("id", requirementId)
    .eq("org_id", orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath(`/classes/${classId}`);
  revalidatePath("/skills");
  return { ok: true, data: data as ClassSkillRequirement };
}

export async function removeClassSkillRequirement(
  requirementId: string,
  classId: string,
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
    .from("class_skill_requirements")
    .delete()
    .eq("id", requirementId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath(`/classes/${classId}`);
  revalidatePath("/skills");
  return { ok: true, data: { id: requirementId } };
}
