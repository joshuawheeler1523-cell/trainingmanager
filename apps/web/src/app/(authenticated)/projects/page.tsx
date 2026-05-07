import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";

export default function ProjectsPage() {
  return (
    <div>
      <PageHeader
        title="Special Projects"
        description="Training initiatives and project management."
      />
      <div className="p-6">
        <EmptyState
          title="Coming soon"
          description="Special projects are being built in Phase 6."
        />
      </div>
    </div>
  );
}
