import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "./current-org";

export const CURRENT_DEPARTMENT_COOKIE = "current_department_id";

/**
 * Resolve the user's current department in the active org. Order:
 *   1. The cookie value, IF the user has access to that department AND
 *      it lives in the current org.
 *   2. The org's "general" department, IF the user has membership.
 *   3. The user's most-recently-accepted department membership in the
 *      current org.
 *   4. null — caller treats as "no department selected".
 *
 * Org admins implicitly have access to every department in their org, so
 * step 1's lookup uses an OR with org_admin status.
 */
export async function getCurrentDepartmentId(): Promise<string | null> {
  const [cookieStore, supabase, orgId] = await Promise.all([
    cookies(),
    createClient(),
    getCurrentOrgId(),
  ]);
  if (!orgId) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const isAdmin = await userIsOrgAdmin(supabase, user.id, orgId);

  const stored = cookieStore.get(CURRENT_DEPARTMENT_COOKIE)?.value;
  if (stored) {
    const ok = await departmentBelongsToOrg(supabase, stored, orgId);
    if (ok && (isAdmin || (await userHasDepartmentMembership(supabase, user.id, stored)))) {
      return stored;
    }
  }

  // Fall back: General dept of the current org.
  const { data: general } = await supabase
    .from("departments")
    .select("id")
    .eq("org_id", orgId)
    .eq("slug", "general")
    .maybeSingle();
  if (general) {
    if (isAdmin) return general.id;
    const ok = await userHasDepartmentMembership(supabase, user.id, general.id);
    if (ok) return general.id;
  }

  // Fall back further: most recent accepted dept membership in this org.
  const { data: anyMembership } = await supabase
    .from("department_memberships")
    .select("department_id, departments!inner(org_id)")
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .eq("departments.org_id", orgId)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return anyMembership?.department_id ?? null;
}

async function userIsOrgAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .not("accepted_at", "is", null)
    .maybeSingle();
  return data?.role === "org_admin";
}

async function userHasDepartmentMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  departmentId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("department_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("department_id", departmentId)
    .not("accepted_at", "is", null)
    .maybeSingle();
  return Boolean(data);
}

async function departmentBelongsToOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  departmentId: string,
  orgId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("departments")
    .select("id")
    .eq("id", departmentId)
    .eq("org_id", orgId)
    .maybeSingle();
  return Boolean(data);
}
