import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrgGuard from "@/components/org-guard";
import OrgSwitcher from "@/components/OrgSwitcher";
import DepartmentSwitcher from "@/components/DepartmentSwitcher";
import AppShell from "@/components/layout/app-shell";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";
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

  // Initial notifications + admin flag + workspace identity, parallelized.
  const orgId = await getCurrentOrgId();
  const [{ data: notifications }, admin, identity] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    orgId ? isManager(orgId) : Promise.resolve(false),
    orgId ? getOrgIdentity(orgId) : Promise.resolve(null),
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
          modules={
            identity?.modules ?? {
              "module.classes": true,
              "module.training_planner": true,
              "module.education_requests": true,
            }
          }
          initialNotifications={notifications ?? []}
        >
          {children}
        </AppShell>
      </OrgIdentityProvider>
    </OrgGuard>
  );
}
