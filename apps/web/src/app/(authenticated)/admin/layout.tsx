import OrgAdminGuard from "@/components/org-admin-guard";

// Layout wrapper for the entire /admin route segment. The guard renders a
// 403 surface when the current user isn't an org admin, so individual
// admin pages don't need to repeat the check.

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <OrgAdminGuard>{children}</OrgAdminGuard>;
}
