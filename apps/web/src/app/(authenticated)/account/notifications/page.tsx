import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import NotificationsView from "./notifications-view";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Recent activity that pinged you. Click to jump to the source record."
      />
      <div className="p-6">
        <NotificationsView items={data ?? []} />
      </div>
    </div>
  );
}
