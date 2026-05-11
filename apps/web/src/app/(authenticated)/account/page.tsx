import Link from "next/link";
import {
  UserCircleIcon,
  KeyIcon,
  EnvelopeIcon,
  ArrowRightStartOnRectangleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import PageHeader from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/server";
import AccountForms from "./account-forms";

export const metadata = { title: "Account — Arbor" };

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const fullName = (user.user_metadata.full_name as string | undefined) ?? "";
  const email = user.email ?? "";

  // Memberships across orgs + agencies the user belongs to. Helps the
  // user understand what they'll be removed from if they delete.
  const [{ data: orgMemberships }, { data: agencyMemberships }] = await Promise.all([
    supabase
      .from("org_memberships")
      .select("org_id, role, organizations(name)")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null),
    supabase
      .from("agency_memberships")
      .select("agency_id, role, agencies(name)")
      .eq("user_id", user.id)
      .not("accepted_at", "is", null),
  ]);

  return (
    <div>
      <PageHeader title="Account" description="Manage your profile, password, and sessions." />
      <div className="space-y-6 p-6">
        {/* Profile */}
        <Section icon={<UserCircleIcon className="h-5 w-5" />} title="Profile">
          <AccountForms
            initialFullName={fullName}
            initialEmail={email}
            memberships={{
              orgs: (orgMemberships ?? []).map((m) => ({
                id: m.org_id,
                name: (m.organizations as { name: string } | null)?.name ?? "Unknown",
                role: m.role,
              })),
              agencies: (agencyMemberships ?? []).map((m) => ({
                id: m.agency_id,
                name: (m.agencies as { name: string } | null)?.name ?? "Unknown",
                role: m.role,
              })),
            }}
          />
        </Section>

        {/* Password */}
        <Section icon={<KeyIcon className="h-5 w-5" />} title="Password">
          <p className="text-muted-foreground text-sm">Set or change your password.</p>
          <Link
            href="/account/set-password"
            className="border-border text-foreground hover:bg-surface mt-3 inline-block rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            Manage password
          </Link>
        </Section>

        {/* Email change moved into AccountForms */}

        {/* Memberships */}
        <Section icon={<EnvelopeIcon className="h-5 w-5" />} title="Notifications">
          <p className="text-muted-foreground text-sm">View and manage your notifications.</p>
          <Link
            href="/account/notifications"
            className="border-border text-foreground hover:bg-surface mt-3 inline-block rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            Open notifications
          </Link>
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-background rounded-xl border p-5">
      <div className="mb-4 flex items-center gap-2">
        <span aria-hidden="true" className="text-muted-foreground">
          {icon}
        </span>
        <h2 className="text-foreground text-base font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// Re-exported so the danger-zone bottom strip can sit outside Section
export { ArrowRightStartOnRectangleIcon, TrashIcon };
