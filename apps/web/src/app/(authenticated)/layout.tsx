import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrgGuard from "@/components/org-guard";
import OrgSwitcher from "@/components/OrgSwitcher";
import AppShell from "@/components/layout/app-shell";

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

  return (
    <OrgGuard>
      <AppShell orgSwitcherSlot={<OrgSwitcher />} userEmail={email} userName={name}>
        {children}
      </AppShell>
    </OrgGuard>
  );
}
