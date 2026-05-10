import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AgencyRole = "agency_admin" | "agency_member";

export class AgencyForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  constructor(
    public readonly required: AgencyRole[],
    public readonly agencyId: string,
  ) {
    super(`Agency role required: ${required.join("|")}. Agency: ${agencyId}.`);
    this.name = "AgencyForbiddenError";
  }
}

/**
 * Returns the caller's agency_id, or null if not an accepted member of any
 * agency. For users in multiple agencies (rare in v1), returns the
 * most-recently-accepted membership.
 *
 * Cached per-request via React.cache so layout + page + helpers share one
 * RPC round-trip.
 */
export const getCurrentAgencyId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_agency_id");
  if (error || !data) return null;
  return data;
});

/** True if the caller holds agency_admin role in the given agency. */
export const isAgencyAdmin = cache(async (agencyId: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_agency_admin", { p_agency_id: agencyId });
  if (error || !data) return false;
  return true;
});

/** True if the caller holds any role (admin or member) in the given agency. */
export const isAgencyMember = cache(async (agencyId: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_agency_member", { p_agency_id: agencyId });
  if (error || !data) return false;
  return true;
});

/**
 * Asserts the caller is agency_admin in `agencyId`. Throws AgencyForbiddenError
 * otherwise. Use in server actions that mutate agency-level resources.
 */
export async function requireAgencyAdmin(agencyId: string): Promise<void> {
  if (!(await isAgencyAdmin(agencyId))) {
    throw new AgencyForbiddenError(["agency_admin"], agencyId);
  }
}

/**
 * Asserts the caller is any kind of accepted agency member in `agencyId`.
 * Throws AgencyForbiddenError otherwise. Use for read-only agency views.
 */
export async function requireAgencyMember(agencyId: string): Promise<void> {
  if (!(await isAgencyMember(agencyId))) {
    throw new AgencyForbiddenError(["agency_admin", "agency_member"], agencyId);
  }
}
