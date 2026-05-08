"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import {
  requestInsertSchema,
  requestUpdateSchema,
  requestStatusUpdateSchema,
  requestAssignmentSchema,
  requestAssignmentUpdateSchema,
  intakeLinkInsertSchema,
  type EducationRequest,
  type EducationRequestAssignment,
  type PublicIntakeLink,
} from "@arbor/shared";
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

async function ctx() {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) {
    return { ok: false as const, error: { code: "NO_ORG", message: "No active organization" } };
  }
  return { ok: true as const, supabase, orgId };
}

// ── education_requests ──────────────────────────────────────────────────────

export async function createRequest(input: unknown): Promise<ActionResult<EducationRequest>> {
  const parsed = requestInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("education_requests")
    .insert({ ...parsed.data, org_id: c.orgId, submitted_via: "app" })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/request-queue");
  return { ok: true, data: data as EducationRequest };
}

export async function updateRequest(
  id: string,
  input: unknown,
): Promise<ActionResult<EducationRequest>> {
  const parsed = requestUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("education_requests")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"education_requests">,
    )
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/request-queue");
  return { ok: true, data: data as EducationRequest };
}

export async function updateRequestStatus(
  id: string,
  input: unknown,
): Promise<ActionResult<EducationRequest>> {
  const parsed = requestStatusUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const patch: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.review_notes !== undefined) {
    patch["review_notes"] = parsed.data.review_notes;
  }

  const { data, error } = await c.supabase
    .from("education_requests")
    .update(patch as unknown as TablesUpdate<"education_requests">)
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/request-queue");
  return { ok: true, data: data as EducationRequest };
}

export async function archiveRequest(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("education_requests")
    .update({ deleted_at: new Date().toISOString(), status: "archived" })
    .eq("id", id)
    .eq("org_id", c.orgId)
    .is("deleted_at", null);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/request-queue");
  return { ok: true, data: { id } };
}

// ── education_request_assignments ───────────────────────────────────────────

export async function assignRequestInstructor(
  requestId: string,
  input: unknown,
): Promise<ActionResult<EducationRequestAssignment>> {
  const parsed = requestAssignmentSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("education_request_assignments")
    .upsert(
      {
        org_id: c.orgId,
        request_id: requestId,
        instructor_id: parsed.data.instructor_id,
        estimated_hours: parsed.data.estimated_hours,
      },
      { onConflict: "request_id,instructor_id" },
    )
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/request-queue");
  return { ok: true, data };
}

export async function updateRequestAssignment(
  assignmentId: string,
  input: unknown,
): Promise<ActionResult<EducationRequestAssignment>> {
  const parsed = requestAssignmentUpdateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("education_request_assignments")
    .update(
      stripUndefined(
        parsed.data as Record<string, unknown>,
      ) as unknown as TablesUpdate<"education_request_assignments">,
    )
    .eq("id", assignmentId)
    .eq("org_id", c.orgId)
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/request-queue");
  return { ok: true, data };
}

export async function unassignRequestInstructor(
  assignmentId: string,
): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("education_request_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/request-queue");
  return { ok: true, data: { id: assignmentId } };
}

// ── public_intake_links (admin) ─────────────────────────────────────────────

export async function createIntakeLink(input: unknown): Promise<ActionResult<PublicIntakeLink>> {
  const parsed = intakeLinkInsertSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const c = await ctx();
  if (!c.ok) return c;

  const { data, error } = await c.supabase
    .from("public_intake_links")
    .insert({
      org_id: c.orgId,
      label: parsed.data.label,
      expires_at: parsed.data.expires_at,
    })
    .select()
    .single();

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/admin/intake-links");
  return { ok: true, data };
}

export async function revokeIntakeLink(id: string): Promise<ActionResult<{ id: string }>> {
  const c = await ctx();
  if (!c.ok) return c;

  const { error } = await c.supabase
    .from("public_intake_links")
    .update({ is_active: false })
    .eq("id", id)
    .eq("org_id", c.orgId);

  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/admin/intake-links");
  return { ok: true, data: { id } };
}
