"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_ORG_COOKIE } from "@/lib/auth/current-org";
import { CURRENT_DEPARTMENT_COOKIE } from "@/lib/auth/current-department";

export async function switchOrg(formData: FormData) {
  const orgId = formData.get("orgId") as string | null;
  const returnPath = (formData.get("returnPath") as string | null) ?? "/";
  if (!orgId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Authorize via resolved role rather than a direct membership row: agency
  // admins have manager access to their client orgs without an org_membership
  // (user_role_in_org returns 'manager' for them via is_agency_admin_of_org).
  const { data: role } = await supabase.rpc("user_role_in_org", { p_org_id: orgId });
  if (!role) redirect("/onboarding");

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  // Clear the department cookie — it points at a department in the OLD
  // org and will be wrong after the switch. getCurrentDepartmentId() will
  // resolve to the new org's General department on the next request.
  cookieStore.delete(CURRENT_DEPARTMENT_COOKIE);

  // "layout" flag invalidates every path under the root layout, so the new
  // org's data shows up on /dashboard, /instructors, /allocations, etc.
  // Plain revalidatePath("/") only invalidates the root page itself.
  revalidatePath("/", "layout");
  redirect(returnPath);
}
