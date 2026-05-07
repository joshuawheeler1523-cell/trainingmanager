import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";

export default function AllocationsPage() {
  return (
    <div>
      <PageHeader
        title="Allocations"
        description="Buckets, global defaults, groups, and individual overrides."
      />
      <div className="p-6">
        <EmptyState
          title="Coming soon"
          description="Allocation management is being built in Phase 2."
        />
      </div>
    </div>
  );
}
