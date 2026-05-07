import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { acceptInvitation } from "./actions";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .limit(1)
    .maybeSingle();

  if (membership) redirect("/");

  const { data: invitation } = await supabase
    .from("org_invitations")
    .select("id, org_id, role, organizations(name)")
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (invitation) {
    const orgName =
      (invitation.organizations as { name: string } | null)?.name ?? "your organization";

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="mb-2 text-xl font-semibold text-gray-900">You&apos;ve been invited</h1>
          <p className="mb-6 text-sm text-gray-500">
            Accept your invitation to join{" "}
            <span className="font-medium text-gray-700">{orgName}</span>.
          </p>
          <form action={acceptInvitation}>
            <input type="hidden" name="invitationId" value={invitation.id} />
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Accept invitation
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">No organization found</h1>
        <p className="mb-4 text-sm text-gray-500">
          Your account isn&apos;t linked to an organization yet. An admin needs to invite you before
          you can access Arbor.
        </p>
        <p className="text-sm text-gray-400">
          If you believe this is a mistake, contact your administrator.
        </p>
      </div>
    </div>
  );
}
