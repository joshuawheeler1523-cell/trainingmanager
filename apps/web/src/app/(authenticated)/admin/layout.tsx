import { RoleGuard } from "@/components/auth";

// Layout wrapper for the entire /admin route segment. The guard renders a
// 403 surface when the current user isn't a manager, so individual admin
// pages don't need to repeat the check.

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard roles={["manager"]}>{children}</RoleGuard>;
}
