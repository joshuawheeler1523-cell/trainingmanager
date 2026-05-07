import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { Tables } from "@/lib/supabase/database.types";

type Organization = Tables<"organizations">;

type Props = {
  children: (org: Organization) => React.ReactNode;
};

export default async function CurrentOrgProvider({ children }: Props) {
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return null;

  const { data: org } = await supabase.from("organizations").select("*").eq("id", orgId).single();

  if (!org) return null;

  return <>{children(org)}</>;
}
