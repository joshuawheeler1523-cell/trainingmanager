import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";

export default function RequestQueuePage() {
  return (
    <div>
      <PageHeader title="Request Queue" description="Education requests from stakeholders." />
      <div className="p-6">
        <EmptyState title="Coming soon" description="Request queue is being built in Phase 5." />
      </div>
    </div>
  );
}
