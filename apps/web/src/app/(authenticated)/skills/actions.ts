"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import {
  skillInsertSchema,
  skillUpdateSchema,
  instructorSkillSchema,
  instructorSkillUpdateSchema,
  classSkillRequirementSchema,
  classSkillRequirementUpdateSchema,
} from "@arbor/shared";
import type { Skill, InstructorSkill, ClassSkillRequirement } from "@arbor/shared";
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

// ── skills CRUD ─────────────────────────────────────────────────────────────

export async function createSkill(input: unknown): Promise<ActionResult<Skill>> {
  const parsed = skillInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { data, error } = await supabase
    .from("skills")
    .insert({ ...parsed.data, org_id: orgId })
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

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

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
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { error } = await supabase
    .from("skills")
    .update({ is_archived: true })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/skills");
  return { ok: true, data: { id } };
}

export async function unarchiveSkill(id: string): Promise<ActionResult<{ id: string }>> {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

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

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { data, error } = await supabase
    .from("instructor_skills")
    .insert({
      org_id: orgId,
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

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

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
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

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

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

  const { data, error } = await supabase
    .from("class_skill_requirements")
    .insert({
      org_id: orgId,
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

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

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
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };

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
