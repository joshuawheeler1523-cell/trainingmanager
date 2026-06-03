import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { applyDeptScope, getDepartmentScope } from "@/lib/auth/current-department";
import ModulesClient, { type ModuleRow } from "./modules-client";
import type { ClassModule } from "@arbor/shared";

async function ModulesBody() {
  const [supabase, orgId, scope] = await Promise.all([
    createClient(),
    getCurrentOrgId(),
    getDepartmentScope(),
  ]);
  if (!orgId) return null;

  const [{ data: modules }, { data: classes }] = await Promise.all([
    applyDeptScope(
      supabase
        .from("class_modules")
        .select("*")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .order("name"),
      scope,
    ),
    applyDeptScope(
      supabase
        .from("classes_with_hours")
        .select("id, module_id, annual_class_hours")
        .eq("org_id", orgId)
        .is("deleted_at", null),
      scope,
    ),
  ]);

  const stats = new Map<string, { count: number; hours: number }>();
  for (const c of (classes ?? []) as {
    module_id: string | null;
    annual_class_hours: number | null;
  }[]) {
    if (!c.module_id) continue;
    const s = stats.get(c.module_id) ?? { count: 0, hours: 0 };
    s.count += 1;
    s.hours += c.annual_class_hours ?? 0;
    stats.set(c.module_id, s);
  }

  const rows: ModuleRow[] = ((modules ?? []) as ClassModule[]).map((m) => ({
    module: m,
    classCount: stats.get(m.id)?.count ?? 0,
    totalHours: stats.get(m.id)?.hours ?? 0,
  }));

  return <ModulesClient rows={rows} />;
}

export default function ClassModulesPage() {
  return (
    <div>
      <PageHeader
        title="Modules"
        description="Group related classes into modules (e.g. an onboarding track)."
      />
      <div className="space-y-4 p-6">
        <Link
          href="/classes"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to classes
        </Link>
        <Suspense fallback={<div className="bg-surface h-64 animate-pulse rounded-lg" />}>
          <ModulesBody />
        </Suspense>
      </div>
    </div>
  );
}
