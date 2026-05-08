import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { REPORT_METADATA, REPORT_SLUGS, type ReportSlug, type SavedReport } from "@arbor/shared";
import ReportRunner from "./report-runner";

type Params = Promise<{ slug: string }>;
type Search = Promise<{ saved?: string }>;

export default async function ReportSlugPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { slug } = await params;
  if (!REPORT_SLUGS.includes(slug as ReportSlug)) notFound();
  const reportSlug = slug as ReportSlug;
  const meta = REPORT_METADATA[reportSlug];

  const sp = await searchParams;
  const savedId = sp.saved;

  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  // Fetch shared filter data — buckets and instructors are used by multiple
  // filter panes, so we hand them in once.
  const [{ data: buckets }, { data: instructors }, savedRes] = await Promise.all([
    supabase.from("allocation_buckets").select("id, name").eq("org_id", orgId).order("name"),
    supabase
      .from("instructors")
      .select("id, full_name")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("full_name"),
    savedId
      ? supabase
          .from("saved_reports")
          .select("*")
          .eq("id", savedId)
          .eq("org_id", orgId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const initial = (savedRes.data as SavedReport | null) ?? null;

  return (
    <div>
      <div className="border-border bg-background border-b px-6 py-4">
        <Link
          href="/reports"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Reports
        </Link>
        <h1 className="text-foreground mt-1 text-xl font-semibold">{meta.name}</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">{meta.description}</p>
      </div>

      <div className="p-6">
        <ReportRunner
          slug={reportSlug}
          buckets={buckets ?? []}
          instructors={instructors ?? []}
          initial={initial}
        />
      </div>
    </div>
  );
}
