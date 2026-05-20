import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrgGuard from "@/components/org-guard";
import OrgSwitcher from "@/components/OrgSwitcher";
import DepartmentSwitcher from "@/components/DepartmentSwitcher";
import AppShell from "@/components/layout/app-shell";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
import { isArborAdmin } from "@/lib/auth/arbor-admin";
import { getOrgIdentity } from "@/lib/labels/get-org-identity";
import { OrgIdentityProvider } from "@/components/labels";

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

  // Initial notifications + admin flag + workspace identity + sidebar
  // counts, all parallelized. Counts are head-only COUNT queries; cheap
  // and RLS-scoped so each user sees their own "things on my plate."
  const orgId = await getCurrentOrgId();
  const sevenDaysOut = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const [
    { data: notifications },
    admin,
    arborAdmin,
    identity,
    { count: workIntakeCount },
    { count: requestQueueCount },
    { count: oneOnOnesCount },
  ] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    orgId ? isManager(orgId) : Promise.resolve(false),
    isArborAdmin(),
    orgId ? getOrgIdentity(orgId) : Promise.resolve(null),
    orgId
      ? supabase
          .from("tras")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .in("status", ["draft", "documented", "submitted", "approved"])
      : Promise.resolve({ count: 0 }),
    orgId
      ? supabase
          .from("education_requests")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .in("status", ["new", "under_review"])
          .is("deleted_at", null)
      : Promise.resolve({ count: 0 }),
    orgId
      ? supabase
          .from("one_on_ones")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .is("completed_at", null)
          .gte("scheduled_for", new Date().toISOString())
          .lte("scheduled_for", sevenDaysOut)
      : Promise.resolve({ count: 0 }),
  ]);

  return (
    <OrgGuard>
      <OrgIdentityProvider value={identity}>
        <AppShell
          orgSwitcherSlot={
            <div className="flex items-center gap-2">
              <OrgSwitcher />
              <span className="text-border">·</span>
              <DepartmentSwitcher />
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
            workIntake: workIntakeCount ?? 0,
            requestQueue: requestQueueCount ?? 0,
            oneOnOnes: oneOnOnesCount ?? 0,
          }}
        >
          {children}
        </AppShell>
      </OrgIdentityProvider>
    </OrgGuard>
  );
}
