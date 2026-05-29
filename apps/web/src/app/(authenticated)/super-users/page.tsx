import { Suspense } from "react";
import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import SuperUsersView from "./super-users-view";
import type { SuperUserWithClass } from "@arbor/shared";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function SuperUsersBody({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const search = typeof sp["search"] === "string" ? sp["search"] : "";
  const classFilter = typeof sp["class"] === "string" ? sp["class"] : "";
  const trainedFilter = typeof sp["trained"] === "string" ? sp["trained"] : "";
  const unitFilter = typeof sp["unit"] === "string" ? sp["unit"] : "";
  const showDeleted = sp["deleted"] === "1";

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return null;

  let query = supabase
    .from("super_users")
    .select("*, classes ( id, name )")
    .eq("org_id", orgId)
    .order("full_name");

  if (showDeleted) {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
  }
  if (search) {
    const term = `%${search}%`;
    query = query.or(
      `full_name.ilike.${term},email.ilike.${term},topic.ilike.${term},unit.ilike.${term}`,
    );
  }
  if (classFilter === "__none__") {
    query = query.is("class_id", null);
  } else if (classFilter) {
    query = query.eq("class_id", classFilter);
  }
  if (trainedFilter === "yes") {
    query = query.not("trained_at", "is", null);
  } else if (trainedFilter === "no") {
    query = query.is("trained_at", null);
  }
  if (unitFilter) {
    query = query.eq("unit", unitFilter);
  }

  const [{ data: rows }, { data: classRows }] = await Promise.all([
    query,
    supabase
      .from("classes")
      .select("id, name")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("name"),
  ]);

  const list: SuperUserWithClass[] = (rows ?? []).map((row) => ({
    id: row.id,
    org_id: row.org_id,
    department_id: row.department_id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    unit: row.unit,
    class_id: row.class_id,
    topic: row.topic,
    trained_at: row.trained_at,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    updated_by: row.updated_by,
    version: row.version,
    class_name: row.classes?.name ?? null,
  }));

  const classes = (classRows ?? []) as { id: string; name: string }[];

  const units = Array.from(
    new Set(list.map((r) => r.unit).filter((u): u is string => typeof u === "string" && u !== "")),
  ).sort();

  return (
    <SuperUsersView superUsers={list} classes={classes} units={units} showDeleted={showDeleted} />
  );
}

export const metadata = { title: "Super users" };

export default function SuperUsersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <PageHeader
        title="Super users"
        description="Power users, SMEs, and floor champions on systems, devices, and procedures. Link to a class in the catalog, or enter a free-text topic for ad-hoc tracking."
      />
      <Suspense
        fallback={
          <div className="p-6">
            <div className="bg-surface h-64 animate-pulse rounded-lg" />
          </div>
        }
      >
        <SuperUsersBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

// Render empty-state when there are no rows at all (no filters applied)
export function SuperUsersEmpty() {
  return (
    <EmptyState
      title="No super users yet"
      description="Add your first super user to start tracking floor champions."
    />
  );
}
