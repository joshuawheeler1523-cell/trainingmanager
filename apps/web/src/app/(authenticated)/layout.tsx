import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrgGuard from "@/components/org-guard";
import OrgSwitcher from "@/components/OrgSwitcher";
import AppShell from "@/components/layout/app-shell";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isOrgAdmin } from "@/lib/auth/org-admin";

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

  // Initial notifications + admin flag, parallelized.
  const orgId = await getCurrentOrgId();
  const [{ data: notifications }, admin] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    orgId ? isOrgAdmin(orgId) : Promise.resolve(false),
  ]);

  return (
    <OrgGuard>
      <AppShell
        orgSwitcherSlot={<OrgSwitcher />}
        userEmail={email}
        userName={name}
        userId={user.id}
        isAdmin={admin}
        initialNotifications={notifications ?? []}
      >
        {children}
      </AppShell>
    </OrgGuard>
  );
}
