import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { Badge, Eyebrow, type BadgeVariant } from "@/components/ui";
import type { Implementation, ImplStatus } from "@arbor/shared";
import StepNav from "./step-nav";

const STATUS_VARIANT: Record<ImplStatus, BadgeVariant> = {
  draft: "neutral",
  active: "info",
  completed: "success",
  archived: "neutral",
  cancelled: "danger",
};

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
      {/* Header — editorial breadcrumb eyebrow + serif title + Badge */}
      <div className="border-border bg-background border-b px-6 py-5">
        <Link
          href="/training-planner"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Training Planner
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Eyebrow className="mr-1">Implementation</Eyebrow>
          <h1 className="font-display text-foreground truncate text-2xl font-medium leading-tight tracking-[-0.005em]">
            {impl.name}
          </h1>
          <Badge variant={STATUS_VARIANT[impl.status]}>{impl.status}</Badge>
        </div>
        {impl.description && (
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm">{impl.description}</p>
        )}
        <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.04em]">
          {impl.window_start_date && impl.window_end_date && (
            <span>
              Window ·{" "}
              <b className="text-foreground font-medium normal-case tabular-nums">
                {impl.window_start_date} → {impl.window_end_date}
              </b>
            </span>
          )}
          {impl.go_live_date && (
            <span>
              Go-live ·{" "}
              <b className="text-foreground font-medium normal-case tabular-nums">
                {impl.go_live_date}
              </b>
            </span>
          )}
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
