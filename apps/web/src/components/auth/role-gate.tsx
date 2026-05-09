"use client";

import { type ReactNode } from "react";
import { type Role } from "@/lib/auth/role";
import { useOrgIdentity } from "@/components/labels";

type Props = {
  /** Roles allowed to see the children. */
  roles: Role[];
  /** Optional fallback to render when caller's role doesn't match. */
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * Conditionally renders `children` only when the caller's current role is in
 * `roles`. Pure UX hiding — RLS enforces the actual security boundary at the
 * DB layer (Phase 4). Use to declutter the UI for instructors/viewers, NOT
 * as the primary security mechanism.
 *
 * Reads role from a client-side hook. The hook needs the Provider — we
 * piggyback on the existing OrgIdentityProvider rather than introducing a
 * second context. The provider's `value.role` is hydrated from the server in
 * AuthenticatedLayout (added separately).
 *
 * Falls back to NOT rendering when role is unknown (provider missing or
 * orphan user). Safer to hide than to leak — acquirer-grade default.
 */
export function RoleGate({ roles, fallback = null, children }: Props) {
  const { role } = useOrgIdentity();
  if (!role || !roles.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}

/** Convenience: shows children only to managers. Most common case. */
export function ManagerOnly({ children, fallback }: Omit<Props, "roles">) {
  return (
    <RoleGate roles={["manager"]} fallback={fallback}>
      {children}
    </RoleGate>
  );
}
