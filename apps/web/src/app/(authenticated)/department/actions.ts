"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_DEPARTMENT_COOKIE } from "@/lib/auth/current-department";
import { getCurrentOrgId } from "@/lib/auth/current-org";

/**
 * Switch the active department within the current org. Validates that the
 * caller has access (department member or org admin) and that the target
 * department belongs to the current org. Sets the cookie and redirects
 * back to the requested path.
 */
export async function switchDepartment(formData: FormData) {
  const departmentId = formData.get("departmentId") as string | null;
  const returnPath = (formData.get("returnPath") as string | null) ?? "/";
  if (!departmentId) return;

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!orgId) redirect("/onboarding");

  // Department must belong to current org.
  const { data: dept } = await supabase
    .from("departments")
    .select("id")
    .eq("id", departmentId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!dept) redirect("/");

  // Caller must be a department member OR a manager.
  const { data: orgMembership } = await supabase
    .from("org_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .not("accepted_at", "is", null)
    .maybeSingle();
  const isManager = orgMembership?.role === "manager";

  if (!isManager) {
    const { data: deptMembership } = await supabase
      .from("department_memberships")
      .select("id")
      .eq("user_id", user.id)
      .eq("department_id", departmentId)
      .not("accepted_at", "is", null)
      .maybeSingle();
    if (!deptMembership) redirect("/");
  }

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_DEPARTMENT_COOKIE, departmentId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  redirect(returnPath);
}
