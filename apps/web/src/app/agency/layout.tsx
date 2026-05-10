import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId, isAgencyAdmin } from "@/lib/auth/agency";
import { brandCssVars, getCurrentBrand } from "@/lib/brand";

/**
 * Layout for the agency console (`/agency/*`).
 *
 * Gates:
 *   - User must be signed in
 *   - User must be an agency_admin in some agency (current_agency_id() resolves
 *     it for them; multi-agency users get the most-recently-accepted one)
 *
 * Renders a thin top bar with the agency-context label + a way back to the
 * org workspace. Does NOT use AppShell because the agency console is
 * deliberately distinct from the per-org workspace (different scope, different
 * role, different mental model).
 */
export default async function AgencyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return <Forbidden reason="not_in_agency" />;
  }
  if (!(await isAgencyAdmin(agencyId))) {
    return <Forbidden reason="not_admin" agencyId={agencyId} />;
  }

  // Pull the agency name for the header.
  const { data: agency } = await supabase
    .from("agencies")
    .select("id, name, slug")
    .eq("id", agencyId)
    .maybeSingle();

  const brand = await getCurrentBrand();

  return (
    <div className="bg-canvas flex min-h-screen flex-col" style={brandCssVars(brand)}>
      <header className="border-border bg-background flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-4">
          {brand.logoUrl && (
            <Image
              src={brand.logoUrl}
              alt={`${brand.name} logo`}
              width={120}
              height={40}
              className="max-h-10 w-auto object-contain"
              unoptimized
            />
          )}
          <div>
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              Agency Console
            </p>
            <h1 className="text-foreground text-lg font-bold">{agency?.name ?? "Agency"}</h1>
          </div>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/agency" className="text-foreground hover:text-primary font-medium">
            Dashboard
          </Link>
          <Link href="/agency/billing" className="text-foreground hover:text-primary font-medium">
            Billing
          </Link>
          <Link href="/agency/branding" className="text-foreground hover:text-primary font-medium">
            Branding
          </Link>
          <Link href="/agency/domain" className="text-foreground hover:text-primary font-medium">
            Domain
          </Link>
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            ← Back to workspace
          </Link>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function Forbidden({
  reason,
  agencyId,
}: {
  reason: "not_in_agency" | "not_admin";
  agencyId?: string;
}) {
  const message =
    reason === "not_in_agency"
      ? "You aren't a member of any agency. The agency console is for agency administrators."
      : `You need agency_admin role to access this console.`;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest">403</p>
      <h1 className="text-foreground text-2xl font-semibold">Access denied</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{message}</p>
      {agencyId && (
        <p className="text-muted-foreground text-xs">
          Agency: <code>{agencyId}</code>
        </p>
      )}
      <Link
        href="/"
        className="bg-primary text-primary-foreground mt-2 rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        Go to your workspace
      </Link>
    </div>
  );
}
