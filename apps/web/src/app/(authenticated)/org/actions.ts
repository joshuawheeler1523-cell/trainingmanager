"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_ORG_COOKIE } from "@/lib/auth/current-org";

export async function switchOrg(formData: FormData) {
  const orgId = formData.get("orgId") as string | null;
  const returnPath = (formData.get("returnPath") as string | null) ?? "/";
  if (!orgId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .not("accepted_at", "is", null)
    .maybeSingle();

  if (!membership) redirect("/onboarding");

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/");
  redirect(returnPath);
}
