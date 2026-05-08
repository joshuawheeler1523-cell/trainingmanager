import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import type { Implementation } from "@arbor/shared";
import StepNav from "./step-nav";

type Params = Promise<{ id: string }>;

export default async function ImplementationLayout({
  params,
  children,
}: {
  params: Params;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const [supabase, orgId] = await Promise.all([createClient(), getCurrentOrgId()]);
  if (!orgId) notFound();

  const { data: implementation } = await supabase
    .from("implementations")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!implementation) notFound();

  // Counts that drive the progress nav's "ready" markers
  const [
    { count: roomCount },
    { count: trainerCount },
    { count: moduleCount },
    { count: classCount },
    { count: sessionCount },
  ] = await Promise.all([
    supabase
      .from("impl_rooms")
      .select("*", { count: "exact", head: true })
      .eq("implementation_id", id)
      .eq("org_id", orgId),
    supabase
      .from("impl_trainers")
      .select("*", { count: "exact", head: true })
      .eq("implementation_id", id)
      .eq("org_id", orgId),
    supabase
      .from("impl_modules")
      .select("*", { count: "exact", head: true })
      .eq("implementation_id", id)
      .eq("org_id", orgId),
    supabase
      .from("impl_classes")
      .select("*", { count: "exact", head: true })
      .eq("implementation_id", id)
      .eq("org_id", orgId),
    supabase
      .from("impl_sessions")
      .select("*", { count: "exact", head: true })
      .eq("implementation_id", id)
      .eq("org_id", orgId),
  ]);

  const impl = implementation as Implementation;
  const setupComplete = !!(impl.window_start_date && impl.window_end_date && impl.go_live_date);

  return (
    <div>
      {/* Header */}
      <div className="border-border bg-background border-b px-6 py-4">
        <Link
          href="/training-planner"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Training Planner
        </Link>
        <h1 className="text-foreground mt-1 truncate text-xl font-semibold">{impl.name}</h1>
        {impl.description && (
          <p className="text-muted-foreground mt-1 max-w-3xl text-sm">{impl.description}</p>
        )}
        <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
          {impl.window_start_date && impl.window_end_date && (
            <span>
              Window: {impl.window_start_date} → {impl.window_end_date}
            </span>
          )}
          {impl.go_live_date && <span>Go-live: {impl.go_live_date}</span>}
          <span className="capitalize">Status: {impl.status}</span>
        </div>
      </div>

      <StepNav
        implementationId={id}
        readiness={{
          setup: setupComplete,
          rooms: (roomCount ?? 0) > 0,
          trainers: (trainerCount ?? 0) > 0,
          modules: (moduleCount ?? 0) > 0,
          classes: (classCount ?? 0) > 0,
          sessions: (sessionCount ?? 0) > 0,
        }}
      />

      <div className="p-6">{children}</div>
    </div>
  );
}
