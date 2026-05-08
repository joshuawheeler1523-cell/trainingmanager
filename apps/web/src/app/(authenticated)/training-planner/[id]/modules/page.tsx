import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import ModulesEditor from "./modules-editor";

type Params = Promise<{ id: string }>;

export default async function ModulesPage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const { data: modules } = await supabase
    .from("impl_modules")
    .select("*")
    .eq("implementation_id", id)
    .eq("org_id", orgId)
    .order("sort_order")
    .order("created_at");

  return <ModulesEditor implementationId={id} modules={modules ?? []} />;
}
