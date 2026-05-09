import Link from "next/link";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import { isManager } from "@/lib/auth/role";

function Forbidden() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest">403</p>
      <h1 className="text-foreground text-2xl font-semibold">Access denied</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        You need manager permissions to view this page.
      </p>
      <Link
        href="/"
        className="bg-primary text-primary-foreground mt-2 rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        Go home
      </Link>
    </div>
  );
}

export default async function OrgAdminGuard({ children }: { children: React.ReactNode }) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return <Forbidden />;

  const admin = await isManager(orgId);
  if (!admin) return <Forbidden />;

  return <>{children}</>;
}
