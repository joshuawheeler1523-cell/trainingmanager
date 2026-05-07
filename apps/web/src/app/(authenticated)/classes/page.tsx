import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";

export default function ClassesPage() {
  return (
    <div>
      <PageHeader title="Classes" description="Course catalog and instructor assignments." />
      <div className="p-6">
        <EmptyState title="Coming soon" description="Class management is being built in Phase 1." />
      </div>
    </div>
  );
}
