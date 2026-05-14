import { notFound } from "next/navigation";
import { getCurrentOrgId } from "@/lib/auth/current-org";
import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";
import ConflictsView from "./conflicts-view";
import { fetchCrossImplConflicts } from "./queries";

export const metadata = {
  title: "Cross-impl conflicts",
};

export default async function ConflictsPage() {
  const orgId = await getCurrentOrgId();
  if (!orgId) notFound();

  const pairs = await fetchCrossImplConflicts(orgId);

  return (
    <div>
      <PageHeader
        title="Cross-impl conflicts"
        description="Draft sessions across different implementations that share an underlying trainer at the same time. Pick which session to move; we'll suggest valid alternative slots."
      />
      <div className="p-6">
        {pairs.length === 0 ? (
          <EmptyState
            title="No cross-impl conflicts"
            description="Every draft session across your live implementations has a unique trainer or doesn't overlap with another impl. If you generated two impls that share consultants and don't see anything here, the schedules don't actually collide."
          />
        ) : (
          <ConflictsView pairs={pairs} />
        )}
      </div>
    </div>
  );
}
