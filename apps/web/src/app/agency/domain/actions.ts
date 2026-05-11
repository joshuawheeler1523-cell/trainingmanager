"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId, isAgencyAdmin } from "@/lib/auth/agency";
import { writeAuditDenial } from "@/lib/auth/audit-denial";
import { vercelAddDomain, vercelRemoveDomain, vercelVerifyDomain } from "@/lib/vercel-domains";
import type { Json } from "@/lib/supabase/database.types";

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

// Loose hostname validation: lowercase letters/digits/dot/dash, must contain
// at least one dot, must not start or end with a dot or dash. Real validation
// happens at the Vercel API layer; this is just to catch obvious typos before
// we burn an API call.
const setDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .min(4, "Too short")
    .max(253, "Too long")
    .regex(
      /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/,
      "Enter a valid hostname like app.your-firm.com",
    ),
});

/** @requiredAgencyRole agency_admin */
export async function setAgencyDomainAction(input: unknown): Promise<
  ActionResult<{
    pending: string;
    verification?: { type: string; value: string }[];
    degraded: boolean;
  }>
> {
  const parsed = setDomainSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return { ok: false, error: { code: "NO_AGENCY", message: "Not a member of any agency" } };
  }
  if (!(await isAgencyAdmin(agencyId))) {
    await writeAuditDenial(agencyId, "agency_domain", "setAgencyDomain", "not_agency_admin");
    return { ok: false, error: { code: "FORBIDDEN", message: "Agency admin only" } };
  }

  const admin = createAdminClient();
  const domain = parsed.data.domain;

  // Conflict check — can't claim a domain another agency has already verified.
  const { data: claimed } = await admin
    .from("agencies")
    .select("id")
    .or(`custom_domain.eq.${domain},custom_domain_pending.eq.${domain}`)
    .neq("id", agencyId)
    .limit(1)
    .maybeSingle();
  if (claimed) {
    return {
      ok: false,
      error: { code: "DOMAIN_TAKEN", message: "That domain is already claimed by another agency" },
      // @ts-expect-error — extra field for UI clarity
      field: "domain",
    };
  }

  // Hand off to Vercel. In degraded mode (no VERCEL_API_TOKEN) we still
  // record the pending domain so the UI can show DNS instructions.
  const vercelRes = await vercelAddDomain(domain);
  if (!vercelRes.ok) {
    return { ok: false, error: vercelRes.error };
  }

  const txt =
    "degraded" in vercelRes && !vercelRes.degraded
      ? (vercelRes.data.verification?.find((v) => v.type === "TXT")?.value ?? null)
      : null;

  const { error } = await admin
    .from("agencies")
    .update({
      custom_domain_pending: domain,
      custom_domain_pending_at: new Date().toISOString(),
      custom_domain_verification_token: txt,
    })
    .eq("id", agencyId);
  if (error) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }

  await writeDomainAuditLog(admin, agencyId, "AGENCY_DOMAIN_SET", { domain });

  revalidatePath("/agency/domain");
  revalidatePath("/agency");
  return {
    ok: true,
    data: {
      pending: domain,
      degraded: "degraded" in vercelRes ? vercelRes.degraded : false,
      ...(txt ? { verification: [{ type: "TXT", value: txt }] } : {}),
    },
  };
}

/**
 * Polls Vercel for verification status. If verified, promotes
 * custom_domain_pending → custom_domain and stamps custom_domain_verified_at.
 *
 * @requiredAgencyRole agency_admin
 */
export async function verifyAgencyDomainAction(): Promise<
  ActionResult<{ verified: boolean; degraded: boolean; reason?: string }>
> {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return { ok: false, error: { code: "NO_AGENCY", message: "Not a member of any agency" } };
  }
  if (!(await isAgencyAdmin(agencyId))) {
    await writeAuditDenial(agencyId, "agency_domain", "verifyAgencyDomain", "not_agency_admin");
    return { ok: false, error: { code: "FORBIDDEN", message: "Agency admin only" } };
  }

  const admin = createAdminClient();
  const { data: agency } = await admin
    .from("agencies")
    .select("custom_domain_pending, custom_domain")
    .eq("id", agencyId)
    .maybeSingle();
  if (!agency) {
    return { ok: false, error: { code: "NO_AGENCY", message: "Agency not found" } };
  }
  const target = agency.custom_domain_pending ?? agency.custom_domain;
  if (!target) {
    return { ok: false, error: { code: "NO_DOMAIN", message: "No domain configured to verify" } };
  }

  const vercelRes = await vercelVerifyDomain(target);
  if (!vercelRes.ok) return { ok: false, error: vercelRes.error };

  if ("degraded" in vercelRes && vercelRes.degraded) {
    return {
      ok: true,
      data: { verified: false, degraded: true, reason: "vercel_api_not_configured" },
    };
  }
  if (!("data" in vercelRes)) {
    return { ok: true, data: { verified: false, degraded: false } };
  }

  if (!vercelRes.data.verified) {
    const reason = vercelRes.data.verification?.[0]?.reason ?? "pending";
    return { ok: true, data: { verified: false, degraded: false, reason } };
  }

  // Verified! Promote pending → custom_domain.
  const { error } = await admin
    .from("agencies")
    .update({
      custom_domain: target,
      custom_domain_pending: null,
      custom_domain_pending_at: null,
      custom_domain_verification_token: null,
      custom_domain_verified_at: new Date().toISOString(),
    })
    .eq("id", agencyId);
  if (error) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }

  await writeDomainAuditLog(admin, agencyId, "AGENCY_DOMAIN_VERIFIED", { domain: target });

  revalidatePath("/agency/domain");
  revalidatePath("/agency");
  return { ok: true, data: { verified: true, degraded: false } };
}

/** @requiredAgencyRole agency_admin */
export async function removeAgencyDomainAction(): Promise<ActionResult<true>> {
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return { ok: false, error: { code: "NO_AGENCY", message: "Not a member of any agency" } };
  }
  if (!(await isAgencyAdmin(agencyId))) {
    await writeAuditDenial(agencyId, "agency_domain", "removeAgencyDomain", "not_agency_admin");
    return { ok: false, error: { code: "FORBIDDEN", message: "Agency admin only" } };
  }

  const admin = createAdminClient();
  const { data: agency } = await admin
    .from("agencies")
    .select("custom_domain, custom_domain_pending")
    .eq("id", agencyId)
    .maybeSingle();
  const toDetach = agency?.custom_domain ?? agency?.custom_domain_pending;
  if (toDetach) await vercelRemoveDomain(toDetach); // best-effort; don't block on Vercel failure

  const { error } = await admin
    .from("agencies")
    .update({
      custom_domain: null,
      custom_domain_pending: null,
      custom_domain_pending_at: null,
      custom_domain_verification_token: null,
      custom_domain_verified_at: null,
    })
    .eq("id", agencyId);
  if (error) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }

  await writeDomainAuditLog(admin, agencyId, "AGENCY_DOMAIN_REMOVED", { domain: toDetach ?? null });

  revalidatePath("/agency/domain");
  revalidatePath("/agency");
  return { ok: true, data: true };
}

/** Same convention as branding actions: attribute to any one org under the agency. */
async function writeDomainAuditLog(
  admin: ReturnType<typeof createAdminClient>,
  agencyId: string,
  operation: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { data: anyOrg } = await admin
    .from("organizations")
    .select("id")
    .eq("agency_id", agencyId)
    .limit(1)
    .maybeSingle();
  if (!anyOrg) return;
  const { data: userData } = await (await createClient()).auth.getUser();
  await admin.from("audit_log").insert({
    org_id: anyOrg.id,
    actor_id: userData.user?.id ?? null,
    operation,
    table_name: "agencies",
    record_id: agencyId,
    changed_fields: null,
    old_values: null,
    new_values: values as Json,
  });
}
