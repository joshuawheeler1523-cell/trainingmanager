import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-gray-900">Dashboard</h1>
      <p className="text-sm text-gray-500">Signed in as {user?.email}</p>
    </div>
  );
}
