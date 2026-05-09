import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Role = "manager" | "instructor" | "viewer";

export const ROLES = ["manager", "instructor", "viewer"] as const;

export class RoleForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  constructor(
    public readonly required: Role[],
    public readonly actual: Role | null,
    public readonly orgId: string,
  ) {
    super(`Role required: ${required.join("|")}. Actual: ${actual ?? "none"}. Org: ${orgId}.`);
    this.name = "RoleForbiddenError";
  }
}

function isRole(value: string | null | undefined): value is Role {
  return value === "manager" || value === "instructor" || value === "viewer";
}

/** Returns the caller's role in the given org, or null if not an accepted member. */
export const getCurrentRole = cache(async (orgId: string): Promise<Role | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("user_role_in_org", { p_org_id: orgId });
  if (error) return null;
  return isRole(data) ? data : null;
});

/**
 * Asserts the caller's role in `orgId` is one of `roles`. Returns the resolved role.
 * Throws RoleForbiddenError otherwise. Server actions wrap this in their ctx() helper.
 */
export async function requireRole(roles: Role[], orgId: string): Promise<Role> {
  const role = await getCurrentRole(orgId);
  if (!role || !roles.includes(role)) {
    throw new RoleForbiddenError(roles, role, orgId);
  }
  return role;
}
