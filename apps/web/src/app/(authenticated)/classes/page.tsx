import { Suspense } from "react";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import ClassesView from "./classes-view";
import type { ClassWithHours, Instructor } from "@arbor/shared";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function ClassContent({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const showDeleted = sp["deleted"] === "1";

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) return null;

  let classQuery = supabase
    .from("classes_with_hours")
    .select("*")
    .eq("org_id", orgId)
    .order("name");

  if (showDeleted) {
    classQuery = classQuery.not("deleted_at", "is", null);
  } else {
    classQuery = classQuery.is("deleted_at", null);
  }

  const [{ data: classes }, { data: instructors }] = await Promise.all([
    classQuery,
    supabase
      .from("instructors")
      .select("*")
      .eq("org_id", orgId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("full_name"),
  ]);

  return (
    <ClassesView
      classes={(classes ?? []) as ClassWithHours[]}
      instructors={(instructors ?? []) as Instructor[]}
      showDeleted={showDeleted}
    />
  );
}

export default function ClassesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <PageHeader title="Classes" description="Course catalog and instructor assignments." />
      <div className="p-6">
        <Suspense fallback={<div className="bg-surface h-64 animate-pulse rounded-lg" />}>
          <ClassContent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
