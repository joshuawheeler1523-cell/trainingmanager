import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" description="Analytics, exports, and saved report templates." />
      <div className="p-6">
        <EmptyState title="Coming soon" description="Reports are being built in Phase 8." />
      </div>
    </div>
  );
}
