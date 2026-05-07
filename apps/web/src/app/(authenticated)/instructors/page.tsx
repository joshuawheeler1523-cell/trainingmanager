import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";

export default function InstructorsPage() {
  return (
    <div>
      <PageHeader title="Instructors" description="Manage your instructor roster." />
      <div className="p-6">
        <EmptyState
          title="Coming soon"
          description="Instructor management is being built in Phase 1."
        />
      </div>
    </div>
  );
}
