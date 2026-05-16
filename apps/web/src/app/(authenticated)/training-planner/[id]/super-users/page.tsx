import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import SuperUsersView from "./super-users-view";
import type { ImplSuperUserWithClass } from "@arbor/shared";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function ImplSuperUsersPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const showDeleted = sp["deleted"] === "1";

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  // Fetch every super user for this implementation (no class/trained
  // filter at SQL level — the view groups by class and filters at render
  // time, so empty classes still need to render). Search is also
  // client-side for the same reason.
  let query = supabase
    .from("impl_super_users")
    .select("*, impl_classes ( id, name )")
    .eq("implementation_id", id)
    .eq("org_id", orgId)
    .order("full_name");

  if (showDeleted) {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
  }

  const { data: rows } = await query;

  const list: ImplSuperUserWithClass[] = (rows ?? []).map((row) => ({
    id: row.id,
    org_id: row.org_id,
    department_id: row.department_id,
    implementation_id: row.implementation_id,
    impl_class_id: row.impl_class_id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    unit: row.unit,
    topic: row.topic,
    trained_at: row.trained_at,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
    version: row.version,
    impl_class_name: row.impl_classes?.name ?? null,
  }));

  const { data: classRows } = await supabase
    .from("impl_classes")
    .select("id, name")
    .eq("implementation_id", id)
    .eq("org_id", orgId)
    .order("sort_order")
    .order("name");

  const classes = (classRows ?? []) as { id: string; name: string }[];

  return (
    <SuperUsersView
      implementationId={id}
      superUsers={list}
      classes={classes}
      showDeleted={showDeleted}
    />
  );
}
