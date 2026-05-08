import Link from "next/link";
import PageHeader from "@/components/ui/page-header";
import { REPORT_METADATA, REPORT_SLUGS } from "@arbor/shared";

const CATEGORY_LABEL = {
  capacity: "Capacity",
  delivery: "Delivery",
  competency: "Competency",
} as const;

export default function ReportsPage() {
  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        description="Five canonical reports with PDF / Excel / CSV export. Filters drive a live preview before you save or export."
      />
      <div className="space-y-6 p-6">
        <div>
          <Link
            href="/reports/saved"
            className="border-input bg-background text-foreground hover:bg-surface inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm"
          >
            View saved reports →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {REPORT_SLUGS.map((slug) => {
            const meta = REPORT_METADATA[slug];
            return (
              <Link
                key={slug}
                href={`/reports/${slug}`}
                className="border-border bg-background hover:border-primary group block rounded-xl border p-5 transition-colors"
              >
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  {CATEGORY_LABEL[meta.category]}
                </p>
                <p className="text-foreground group-hover:text-primary mt-1 text-base font-semibold">
                  {meta.name}
                </p>
                <p className="text-muted-foreground mt-2 text-sm">{meta.description}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
