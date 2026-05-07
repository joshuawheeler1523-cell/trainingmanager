import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";

export default function SkillsPage() {
  return (
    <div>
      <PageHeader title="Skills" description="Skill library, certifications, and gap analysis." />
      <div className="p-6">
        <EmptyState
          title="Coming soon"
          description="Skills management is being built in Phase 1."
        />
      </div>
    </div>
  );
}
