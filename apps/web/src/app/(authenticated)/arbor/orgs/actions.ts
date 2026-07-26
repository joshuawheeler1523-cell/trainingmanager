"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireArborAdmin } from "@/lib/auth/arbor-admin";
import type { Json } from "@/lib/supabase/database.types";
import type { ActionResult } from "@arbor/shared";

export async function suspendOrgAction(args: {
  orgId: string;
  reason: string;
}): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ suspended_at: new Date().toISOString(), suspended_reason: args.reason })
    .eq("id", args.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await writeArborAdminAuditLog(admin, args.orgId, "ARBOR_ADMIN_ORG_SUSPENDED", {
    reason: args.reason,
  });
  revalidatePath(`/arbor/orgs/${args.orgId}`);
  revalidatePath("/arbor/orgs");
  return { ok: true, data: true };
}

export async function unsuspendOrgAction(args: { orgId: string }): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ suspended_at: null, suspended_reason: null })
    .eq("id", args.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await writeArborAdminAuditLog(admin, args.orgId, "ARBOR_ADMIN_ORG_UNSUSPENDED", null);
  revalidatePath(`/arbor/orgs/${args.orgId}`);
  revalidatePath("/arbor/orgs");
  return { ok: true, data: true };
}

export async function reassignOrgAction(args: {
  orgId: string;
  agencyId: string | null;
}): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ agency_id: args.agencyId })
    .eq("id", args.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await writeArborAdminAuditLog(admin, args.orgId, "ARBOR_ADMIN_ORG_REASSIGNED", {
    new_agency_id: args.agencyId,
  });
  revalidatePath(`/arbor/orgs/${args.orgId}`);
  revalidatePath("/arbor/orgs");
  return { ok: true, data: true };
}

export async function deleteOrgAction(args: { orgId: string }): Promise<ActionResult<true>> {
  await requireArborAdmin();
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("name, slug")
    .eq("id", args.orgId)
    .maybeSingle();

  const { error } = await admin.from("organizations").delete().eq("id", args.orgId);
  if (error) return { ok: false, error: { code: error.code, message: error.message } };

  await writeArborAdminAuditLog(admin, args.orgId, "ARBOR_ADMIN_ORG_DELETED", org);
  revalidatePath("/arbor/orgs");
  redirect("/arbor/orgs");
}

async function writeArborAdminAuditLog(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  op: string,
  newValues: unknown,
): Promise<void> {
  const { data: userData } = await (await createClient()).auth.getUser();
  await admin.from("audit_log").insert({
    org_id: orgId,
    actor_id: userData.user?.id ?? null,
    operation: op,
    table_name: "organizations",
    record_id: orgId,
    changed_fields: null,
    old_values: null,
    new_values: newValues as Json,
  });
}
