"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import { writeAuditDenial } from "@/lib/auth/audit-denial";
import { generateApiKey, hashApiKey } from "@/lib/api-keys";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

const createKeySchema = z.object({
  name: z.string().trim().min(1, "Name required").max(80),
  env: z.enum(["live", "test"]).default("live"),
});

/** @requiredRole manager */
export async function createApiKeyAction(
  input: unknown,
): Promise<ActionResult<{ id: string; fullKey: string; prefix: string }>> {
  const parsed = createKeySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION", message: parsed.error.errors[0]?.message ?? "Invalid input" },
    };
  }

  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    await writeAuditDenial(orgId, "api_keys", "createApiKey", "not_manager");
    return { ok: false, error: { code: "FORBIDDEN", message: "Manager only" } };
  }

  const { full, prefix } = generateApiKey(parsed.data.env);
  const hash = await hashApiKey(full);

  const admin = createAdminClient();
  const { data: userData } = await (await createClient()).auth.getUser();
  const { data: row, error } = await admin
    .from("api_keys")
    .insert({
      org_id: orgId,
      name: parsed.data.name,
      key_prefix: prefix,
      key_hash: hash,
      created_by: userData.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await admin.from("audit_log").insert({
    org_id: orgId,
    actor_id: userData.user?.id ?? null,
    operation: "API_KEY_CREATED",
    table_name: "api_keys",
    record_id: row.id,
    changed_fields: null,
    old_values: null,
    new_values: { name: parsed.data.name, env: parsed.data.env, prefix },
  });

  revalidatePath("/admin/settings/api");
  return { ok: true, data: { id: row.id, fullKey: full, prefix } };
}

/** @requiredRole manager */
export async function revokeApiKeyAction(keyId: string): Promise<ActionResult<true>> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: { code: "NO_ORG", message: "No active organization" } };
  if (!(await isManager(orgId))) {
    await writeAuditDenial(orgId, "api_keys", "revokeApiKey", "not_manager");
    return { ok: false, error: { code: "FORBIDDEN", message: "Manager only" } };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("org_id", orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await admin.from("audit_log").insert({
    org_id: orgId,
    actor_id: (await (await createClient()).auth.getUser()).data.user?.id ?? null,
    operation: "API_KEY_REVOKED",
    table_name: "api_keys",
    record_id: keyId,
    changed_fields: null,
    old_values: null,
    new_values: null,
  });

  revalidatePath("/admin/settings/api");
  return { ok: true, data: true };
}
