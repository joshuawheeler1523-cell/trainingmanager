"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import { writeAuditDenial } from "@/lib/auth/audit-denial";

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

const ssoSchema = z.object({
  emailDomain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a domain like mercy-health.com"),
  displayName: z
    .string()
    .max(120)
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  supabaseProviderId: z
    .string()
    .max(120)
    .nullish()
    .transform((v) => (v === "" || v == null ? null : v)),
  enabled: z.boolean().default(false),
});

/** @requiredRole manager */
export async function upsertSsoConfigAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = ssoSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    await writeAuditDenial(orgId, "sso", "upsertSsoConfig", "not_manager");
    return { ok: false, error: { code: "FORBIDDEN", message: "Manager only" } };
  }

  const admin = createAdminClient();

  // Conflict guard: another org can't claim the same email_domain when enabled.
  if (parsed.data.enabled) {
    const { data: conflict } = await admin
      .from("sso_configs")
      .select("id, org_id")
      .eq("email_domain", parsed.data.emailDomain)
      .eq("enabled", true)
      .neq("org_id", orgId)
      .limit(1)
      .maybeSingle();
    if (conflict) {
      return {
        ok: false,
        error: { code: "DOMAIN_TAKEN", message: "Another org already enables SSO for that domain" },
      };
    }
  }

  // Upsert by (org_id, email_domain). Existing row → update; else insert.
  const { data: existing } = await admin
    .from("sso_configs")
    .select("id")
    .eq("org_id", orgId)
    .eq("email_domain", parsed.data.emailDomain)
    .maybeSingle();

  let id: string;
  if (existing) {
    const { error } = await admin
      .from("sso_configs")
      .update({
        display_name: parsed.data.displayName,
        supabase_provider_id: parsed.data.supabaseProviderId,
        enabled: parsed.data.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: { code: error.code, message: error.message } };
    id = existing.id;
  } else {
    const { data: userData } = await (await createClient()).auth.getUser();
    const { data: row, error } = await admin
      .from("sso_configs")
      .insert({
        org_id: orgId,
        email_domain: parsed.data.emailDomain,
        display_name: parsed.data.displayName,
        supabase_provider_id: parsed.data.supabaseProviderId,
        enabled: parsed.data.enabled,
        created_by: userData.user?.id ?? null,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: { code: error.code, message: error.message } };
    id = row.id;
  }

  await admin.from("audit_log").insert({
    org_id: orgId,
    actor_id: (await (await createClient()).auth.getUser()).data.user?.id ?? null,
    operation: existing ? "SSO_CONFIG_UPDATED" : "SSO_CONFIG_CREATED",
    table_name: "sso_configs",
    record_id: id,
    changed_fields: null,
    old_values: null,
    new_values: parsed.data,
  });

  revalidatePath("/admin/settings/sso");
  return { ok: true, data: { id } };
}

/** @requiredRole manager */
export async function deleteSsoConfigAction(configId: string): Promise<ActionResult<true>> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    await writeAuditDenial(orgId, "sso", "deleteSsoConfig", "not_manager");
    return { ok: false, error: { code: "FORBIDDEN", message: "Manager only" } };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("sso_configs").delete().eq("id", configId).eq("org_id", orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await admin.from("audit_log").insert({
    org_id: orgId,
    actor_id: (await (await createClient()).auth.getUser()).data.user?.id ?? null,
    operation: "SSO_CONFIG_DELETED",
    table_name: "sso_configs",
    record_id: configId,
    changed_fields: null,
    old_values: null,
    new_values: null,
  });

  revalidatePath("/admin/settings/sso");
  return { ok: true, data: true };
}

/**
 * Public lookup: given an email, returns the SSO provider info if the
 * domain is configured. Used by /login client to dispatch to SSO before
 * the user sees the password / magic-link form.
 */
export async function lookupSsoForEmailAction(
  email: string,
): Promise<{ providerId: string; displayName: string | null } | null> {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain) return null;

  const supabase = await createClient();
  const { data } = await supabase.rpc("lookup_sso_for_email_domain", { p_domain: domain });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.provider_id) return null;
  return { providerId: row.provider_id, displayName: row.display_name };
}
