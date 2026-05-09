import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Returns true when the current user holds org_admin role in the given org. */
export const isOrgAdmin = cache(async (orgId: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_org_admin", { p_org_id: orgId });
  if (error || !data) return false;
  return true;
});
