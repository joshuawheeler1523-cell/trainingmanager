import PageHeader from "@/components/ui/page-header";

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your organization's training capacity."
      />
      <div className="p-6">
        <p className="text-muted-foreground text-sm">Dashboard widgets coming in Phase 3.</p>
      </div>
    </div>
  );
}
