import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";

export default function TicketsPage() {
  return (
    <div>
      <PageHeader title="My Tickets" description="Support tickets and conversations." />
      <div className="p-6">
        <EmptyState title="Coming soon" description="Support tickets are being built in Phase 9." />
      </div>
    </div>
  );
}
