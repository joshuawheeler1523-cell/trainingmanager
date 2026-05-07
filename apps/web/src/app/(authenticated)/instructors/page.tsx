import { Suspense } from "react";
import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import InstructorCard from "./instructor-card";
import InstructorFilters from "./instructor-filters";
import type { Instructor } from "@arbor/shared";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function InstructorList({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  const search = typeof sp["search"] === "string" ? sp["search"] : "";
  const department = typeof sp["department"] === "string" ? sp["department"] : "";
  const showDeleted = sp["deleted"] === "1";

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return null;

  let query = supabase.from("instructors").select("*").eq("org_id", orgId).order("full_name");

  if (showDeleted) {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
  }

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  if (department) {
    query = query.eq("department", department);
  }

  const { data: instructors } = await query;

  // Fetch distinct departments for filter
  const { data: deptRows } = await supabase
    .from("instructors")
    .select("department")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .not("department", "is", null);

  const departments = Array.from(
    new Set(
      (deptRows ?? []).map((r) => r.department).filter((d): d is string => typeof d === "string"),
    ),
  ).sort();

  const list = (instructors ?? []) as Instructor[];

  return (
    <div className="space-y-4 p-6">
      <Suspense>
        <InstructorFilters departments={departments} />
      </Suspense>

      {list.length === 0 ? (
        <EmptyState
          title={showDeleted ? "No archived instructors" : "No instructors yet"}
          description={
            showDeleted
              ? "Archived instructors will appear here."
              : "Add your first instructor to get started."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((instructor) => (
            <InstructorCard key={instructor.id} instructor={instructor} capacity={null} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function InstructorsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <PageHeader title="Instructors" description="Manage your instructor roster." />
      <Suspense
        fallback={
          <div className="p-6">
            <div className="bg-surface h-64 animate-pulse rounded-lg" />
          </div>
        }
      >
        <InstructorList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
