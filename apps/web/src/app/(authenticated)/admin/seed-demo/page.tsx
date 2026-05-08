import PageHeader from "@/components/ui/page-header";
import SeedDemoClient from "./seed-demo-client";

export default function SeedDemoPage() {
  return (
    <div>
      <PageHeader
        title="Demo organization"
        description="Spin up a fully populated demo workspace for walkthroughs."
      />
      <div className="p-6">
        <SeedDemoClient />
      </div>
    </div>
  );
}
