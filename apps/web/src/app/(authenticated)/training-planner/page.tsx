import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";

export default function TrainingPlannerPage() {
  return (
    <div>
      <PageHeader
        title="Training Planner"
        description="Implementation scheduling and conflict resolution."
      />
      <div className="p-6">
        <EmptyState title="Coming soon" description="Training Planner is being built in Phase 7." />
      </div>
    </div>
  );
}
