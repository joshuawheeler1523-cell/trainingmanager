import Link from "next/link";
import NewAgencyForm from "./new-agency-form";

export const metadata = { title: "New agency" };

export default function ArborNewAgencyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <Link
          href="/arbor/agencies"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← All agencies
        </Link>
        <h1 className="text-foreground mt-2 text-2xl font-bold">Create agency</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          White-glove onboarding for a customer agency. Creates the agency record, the admin user,
          links them as agency_admin, and emails a magic-link sign-in.
        </p>
      </div>

      <NewAgencyForm />
    </div>
  );
}
