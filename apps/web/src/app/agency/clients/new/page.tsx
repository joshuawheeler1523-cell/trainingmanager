import Link from "next/link";
import NewClientOrgForm from "./new-client-org-form";

/**
 * Form to provision a new client org under the agency. The agency_admin gate
 * is enforced by the parent /agency layout.
 */
export default function NewClientOrgPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <Link href="/agency" className="text-muted-foreground hover:text-foreground text-xs">
          ← Back to agency dashboard
        </Link>
        <h1 className="text-foreground mt-2 text-2xl font-bold">Provision a new client org</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Creates a new organization under your agency. You&apos;ll be added as the initial manager
          so you can configure it; invite the hospital&apos;s manager next, then remove yourself
          when they&apos;re set up.
        </p>
      </div>

      <NewClientOrgForm />
    </div>
  );
}
