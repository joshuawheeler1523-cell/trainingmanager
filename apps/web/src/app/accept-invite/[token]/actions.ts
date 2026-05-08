"use server";

import { createClient } from "@/lib/supabase/server";

type Result =
  | { ok: true; data: { membershipId: string | null } }
  | { ok: false; error: { code: string; message: string } };

export async function acceptInvitationAction(token: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: { code: "UNAUTHENTICATED", message: "Sign in to accept" } };
  }

  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    // Map common Postgres errors to friendlier copy.
    let msg = error.message;
    if (msg.includes("expired")) msg = "Invitation expired";
    else if (msg.includes("different email")) {
      msg = "This invitation is for a different email";
    } else if (msg.includes("not found")) msg = "Invitation not found";
    return { ok: false, error: { code: error.code, message: msg } };
  }
  return { ok: true, data: { membershipId: data } };
}
