import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Returns true when the current user holds org_admin role in the given org. */
export async function isOrgAdmin(orgId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_org_admin", { p_org_id: orgId });
  if (error || !data) return false;
  return true;
}
