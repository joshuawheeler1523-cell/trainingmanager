import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrgGuard from "@/components/org-guard";
import OrgSwitcher from "@/components/OrgSwitcher";
import DepartmentSwitcher from "@/components/DepartmentSwitcher";
import AppShell from "@/components/layout/app-shell";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { getDepartmentScope } from "@/lib/auth/current-department";
import { isArborAdmin } from "@/lib/auth/arbor-admin";
import { getOrgIdentity } from "@/lib/labels/get-org-identity";
import { OrgIdentityProvider } from "@/components/labels";
import ThemeBoot from "@/components/theme-boot";
import { coerceTheme } from "@/lib/theme";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const email = user.email ?? "";
  const name =
    ((user.user_metadata as Record<string, unknown> | undefined)?.["full_name"] as
      | string
      | undefined) ?? email;

  // Layout fan-out: notifications + identity + sidebar counts + arbor-admin
  // env check, all parallelized. sidebar_counts and org_identity each
  // collapse multiple queries into one RPC, and admin is derived from
  // identity.role so we don't fire a separate is_manager round-trip.
  const orgId = await getCurrentOrgId();
  const scope = orgId ? await getDepartmentScope() : null;
  const deptParam = scope && !scope.all ? { p_department_id: scope.id } : {};
  const [{ data: notifications }, arborAdmin, identity, { data: countsRows }] = await Promise.all([
    // Bell shows up to 10 UNREAD; read history lives at /account/notifications.
    supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
    isArborAdmin(),
    orgId ? getOrgIdentity(orgId) : Promise.resolve(null),
    orgId
      ? supabase.rpc("sidebar_counts", { p_org_id: orgId, ...deptParam })
      : Promise.resolve({ data: null }),
  ]);

  const counts = countsRows?.[0] ?? null;
  const workIntakeCount = counts?.work_intake_count ?? 0;
  const requestQueueCount = counts?.request_queue_count ?? 0;
  const oneOnOnesCount = counts?.one_on_ones_count ?? 0;
  const admin = identity?.role === "manager";
  const theme = coerceTheme((user.user_metadata as Record<string, unknown>).theme);

  return (
    <OrgGuard>
      <ThemeBoot theme={theme} />
      <OrgIdentityProvider value={identity}>
        <AppShell
          orgSwitcherSlot={
            <div className="flex min-w-0 items-center gap-2">
              <OrgSwitcher />
              {/* Department switcher is secondary context — hide it below sm so
                  the org name + top-bar icons never collide on a phone. */}
              <span className="text-border hidden shrink-0 sm:inline">·</span>
              <div className="hidden min-w-0 sm:block">
                <DepartmentSwitcher />
              </div>
            </div>
          }
          userEmail={email}
          userName={name}
          userId={user.id}
          isAdmin={admin}
          isArborAdmin={arborAdmin}
          modules={
            identity?.modules ?? {
              "module.classes": true,
              "module.training_planner": true,
              "module.education_requests": true,
            }
          }
          initialNotifications={notifications ?? []}
          sidebarCounts={{
            workIntake: workIntakeCount,
            requestQueue: requestQueueCount,
            oneOnOnes: oneOnOnesCount,
          }}
        >
          {children}
        </AppShell>
      </OrgIdentityProvider>
    </OrgGuard>
  );
}
