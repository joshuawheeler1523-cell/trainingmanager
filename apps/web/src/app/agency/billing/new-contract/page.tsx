import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/auth/agency";
import NewContractForm from "./new-contract-form";

export default async function NewContractPage() {
  const supabase = await createClient();
  const agencyId = await getCurrentAgencyId();
  if (!agencyId) return null;

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("agency_id", agencyId)
    .order("name");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <Link
          href="/agency/billing"
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← Back to billing
        </Link>
        <h1 className="text-foreground mt-2 text-2xl font-bold">New client contract</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Record the terms of a deal you&apos;ve closed with a hospital. Arbor will calculate the
          monthly rev share owed based on these values.
        </p>
      </div>

      <NewContractForm clientOrgs={orgs ?? []} />
    </div>
  );
}
