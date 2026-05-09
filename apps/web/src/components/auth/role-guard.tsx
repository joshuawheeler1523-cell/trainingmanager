import Link from "next/link";
import { type Role, getCurrentRole } from "@/lib/auth/role";
import { getCurrentOrgId } from "@/lib/auth/current-org";

function Forbidden({ requiredRoles }: { requiredRoles: Role[] }) {
  const list = requiredRoles.join(" or ");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest">403</p>
      <h1 className="text-foreground text-2xl font-semibold">Access denied</h1>
      <p className="text-muted-foreground max-w-sm text-sm">This page requires the {list} role.</p>
      <Link
        href="/"
        className="bg-primary text-primary-foreground mt-2 rounded-md px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        Go home
      </Link>
    </div>
  );
}

/**
 * Server-component page guard. Renders a 403 when the caller's role is not
 * in the allowed set. Generalizes the legacy <OrgAdminGuard> which
 * hardcoded org_admin only.
 *
 * Use as a layout or top-of-page wrapper:
 *   export default function Page() {
 *     return <RoleGuard roles={["manager"]}>...</RoleGuard>;
 *   }
 */
export default async function RoleGuard({
  roles,
  children,
}: {
  roles: Role[];
  children: React.ReactNode;
}) {
  const orgId = await getCurrentOrgId();
  if (!orgId) return <Forbidden requiredRoles={roles} />;

  const role = await getCurrentRole(orgId);
  if (!role || !roles.includes(role)) {
    return <Forbidden requiredRoles={roles} />;
  }

  return <>{children}</>;
}
