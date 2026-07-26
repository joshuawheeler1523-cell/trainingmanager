"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireArborAdmin } from "@/lib/auth/arbor-admin";
import type { ActionResult } from "@arbor/shared";

const SEVERITY_VALUES = ["minor", "major", "critical", "maintenance"] as const;
const STATUS_VALUES = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
  "scheduled",
] as const;

const createIncidentSchema = z.object({
  title: z.string().trim().min(2).max(200),
  body: z.string().trim().max(2000).nullish(),
  severity: z.enum(SEVERITY_VALUES),
  status: z.enum(STATUS_VALUES).default("investigating"),
});

export async function createIncidentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireArborAdmin();
  const parsed = createIncidentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } };
  }
  const admin = createAdminClient();
  const { data: userData } = await (await createClient()).auth.getUser();
  const { data, error } = await admin
    .from("status_incidents")
    .insert({
      title: parsed.data.title,
      body: parsed.data.body ?? null,
      severity: parsed.data.severity,
      status: parsed.data.status,
      created_by: userData.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  revalidatePath("/arbor/incidents");
  revalidatePath("/status");
  return { ok: true, data: { id: data.id } };
}

const postUpdateSchema = z.object({
  incidentId: z.string().uuid(),
  status: z.enum(STATUS_VALUES),
  body: z.string().trim().min(2).max(2000),
});

export async function postIncidentUpdateAction(input: unknown): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const parsed = postUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION", message: "Invalid input" } };
  }
  const admin = createAdminClient();
  const { data: userData } = await (await createClient()).auth.getUser();

  // Insert update + bump the incident's status (and resolved_at if resolved).
  const [{ error: updateInsertErr }, { error: statusErr }] = await Promise.all([
    admin.from("status_incident_updates").insert({
      incident_id: parsed.data.incidentId,
      status: parsed.data.status,
      body: parsed.data.body,
      created_by: userData.user?.id ?? null,
    }),
    admin
      .from("status_incidents")
      .update({
        status: parsed.data.status,
        ...(parsed.data.status === "resolved" ? { resolved_at: new Date().toISOString() } : {}),
      })
      .eq("id", parsed.data.incidentId),
  ]);
  if (updateInsertErr)
    return { ok: false, error: { code: updateInsertErr.code, message: updateInsertErr.message } };
  if (statusErr) return { ok: false, error: { code: statusErr.code, message: statusErr.message } };

  revalidatePath("/arbor/incidents");
  revalidatePath("/status");
  return { ok: true, data: true };
}

export async function deleteIncidentAction(args: { id: string }): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  const { error } = await admin.from("status_incidents").delete().eq("id", args.id);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/arbor/incidents");
  revalidatePath("/status");
  return { ok: true, data: true };
}
