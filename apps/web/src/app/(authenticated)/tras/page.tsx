import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";

export default function TRAsPage() {
  return (
    <div>
      <PageHeader title="TRAs" description="Training Request Assessments." />
      <div className="p-6">
        <EmptyState title="Coming soon" description="TRA management is being built in Phase 4." />
      </div>
    </div>
  );
}
