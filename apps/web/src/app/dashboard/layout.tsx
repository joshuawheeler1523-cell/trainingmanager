import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import OrgSwitcher from "@/components/OrgSwitcher";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar orgSwitcher={<OrgSwitcher />} />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
