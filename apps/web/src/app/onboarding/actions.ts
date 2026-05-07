"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function acceptInvitation(formData: FormData) {
  const invitationId = formData.get("invitationId") as string | null;
  if (!invitationId) throw new Error("Missing invitation id.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: invitation, error: fetchErr } = await supabase
    .from("org_invitations")
    .select("id, org_id, role, visibility")
    .eq("id", invitationId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (fetchErr) throw new Error("Invitation not found or expired.");

  const { error: memberErr } = await supabase.from("org_memberships").insert({
    org_id: invitation.org_id,
    user_id: user.id,
    role: invitation.role,
    visibility: invitation.visibility,
    accepted_at: new Date().toISOString(),
  });

  if (memberErr) throw new Error(memberErr.message);

  await supabase
    .from("org_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitationId);

  redirect("/");
}
