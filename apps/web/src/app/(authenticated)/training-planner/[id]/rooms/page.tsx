import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import RoomsEditor from "./rooms-editor";

type Params = Promise<{ id: string }>;

export default async function RoomsPage({ params }: { params: Params }) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const { data: rooms } = await supabase
    .from("impl_rooms")
    .select("*")
    .eq("implementation_id", id)
    .eq("org_id", orgId)
    .order("sort_order")
    .order("created_at");

  return <RoomsEditor implementationId={id} rooms={rooms ?? []} />;
}
