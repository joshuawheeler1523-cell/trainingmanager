"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import { writeAuditDenial } from "@/lib/auth/audit-denial";
import { deliverDelivery, generateSigningSecret } from "@/lib/webhooks";
import type { ActionResult } from "@arbor/shared";

const SUPPORTED_EVENTS = [
  "tra.created",
  "tra.updated",
  "class.created",
  "class.completed",
  "instructor.created",
  "project.created",
  "task.completed",
] as const;

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  url: z.string().url("Must be a valid URL").startsWith("https://", "Must start with https://"),
  events: z.array(z.enum(SUPPORTED_EVENTS)).min(1, "Pick at least one event"),
  description: z
    .string()
    .max(200)
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  enabled: z.boolean().default(true),
});

/** @requiredRole manager */
export async function upsertWebhookEndpointAction(
  input: unknown,
): Promise<ActionResult<{ id: string; signingSecret?: string }>> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: parsed.error.errors[0]?.message ?? "Invalid input" },
    };
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    await writeAuditDenial(orgId, "webhooks", "upsertWebhookEndpoint", "not_manager");
    return { ok: false, error: { code: "FORBIDDEN", message: "Manager only" } };
  }

  const admin = createAdminClient();

  if (parsed.data.id) {
    const { error } = await admin
      .from("webhook_endpoints")
      .update({
        url: parsed.data.url,
        events: parsed.data.events,
        description: parsed.data.description,
        enabled: parsed.data.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.id)
      .eq("org_id", orgId);
    if (error) return { ok: false, error: { code: error.code, message: error.message } };
    revalidatePath("/admin/settings/webhooks");
    return { ok: true, data: { id: parsed.data.id } };
  }

  const secret = generateSigningSecret();
  const { data: userData } = await (await createClient()).auth.getUser();
  const { data: row, error } = await admin
    .from("webhook_endpoints")
    .insert({
      org_id: orgId,
      url: parsed.data.url,
      events: parsed.data.events,
      description: parsed.data.description,
      enabled: parsed.data.enabled,
      signing_secret: secret,
      created_by: userData.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await admin.from("audit_log").insert({
    org_id: orgId,
    actor_id: userData.user?.id ?? null,
    operation: "WEBHOOK_ENDPOINT_CREATED",
    table_name: "webhook_endpoints",
    record_id: row.id,
    changed_fields: null,
    old_values: null,
    new_values: { url: parsed.data.url, events: parsed.data.events },
  });

  revalidatePath("/admin/settings/webhooks");
  return { ok: true, data: { id: row.id, signingSecret: secret } };
}

/** @requiredRole manager */
export async function rotateWebhookSecretAction(
  endpointId: string,
): Promise<ActionResult<{ signingSecret: string }>> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    await writeAuditDenial(orgId, "webhooks", "rotateWebhookSecret", "not_manager");
    return { ok: false, error: { code: "FORBIDDEN", message: "Manager only" } };
  }
  const secret = generateSigningSecret();
  const admin = createAdminClient();
  const { error } = await admin
    .from("webhook_endpoints")
    .update({ signing_secret: secret, updated_at: new Date().toISOString() })
    .eq("id", endpointId)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/admin/settings/webhooks");
  return { ok: true, data: { signingSecret: secret } };
}

/** @requiredRole manager */
export async function deleteWebhookEndpointAction(endpointId: string): Promise<ActionResult<true>> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    await writeAuditDenial(orgId, "webhooks", "deleteWebhookEndpoint", "not_manager");
    return { ok: false, error: { code: "FORBIDDEN", message: "Manager only" } };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("webhook_endpoints")
    .delete()
    .eq("id", endpointId)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };
  revalidatePath("/admin/settings/webhooks");
  return { ok: true, data: true };
}

/** @requiredRole manager — replays a past delivery (re-attempts) */
export async function replayWebhookDeliveryAction(deliveryId: string): Promise<ActionResult<true>> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    await writeAuditDenial(orgId, "webhooks", "replayWebhookDelivery", "not_manager");
    return { ok: false, error: { code: "FORBIDDEN", message: "Manager only" } };
  }
  const admin = createAdminClient();
  // Verify ownership
  const { data: row } = await admin
    .from("webhook_deliveries")
    .select("id, org_id")
    .eq("id", deliveryId)
    .maybeSingle();
  if (!row || row.org_id !== orgId) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Delivery not found" } };
  }
  // Reset status so deliverDelivery proceeds
  await admin
    .from("webhook_deliveries")
    .update({ status: "pending", attempts: 0, next_attempt_at: null })
    .eq("id", deliveryId);
  await deliverDelivery(deliveryId);
  revalidatePath("/admin/settings/webhooks");
  return { ok: true, data: true };
}
