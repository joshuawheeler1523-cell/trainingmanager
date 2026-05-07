import { redirect } from "next/navigation";
import { getCurrentOrgId } from "@/lib/auth/current-org";

export default async function OrgGuard({ children }: { children: React.ReactNode }) {
  const orgId = await getCurrentOrgId();
  if (!orgId) redirect("/onboarding");
  return <>{children}</>;
}
