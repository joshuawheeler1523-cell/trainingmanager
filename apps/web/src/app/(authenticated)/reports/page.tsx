import Link from "next/link";
import PageHeader from "@/components/ui/page-header";
import { Eyebrow } from "@/components/ui";
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
            className="border-border text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md border px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors"
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
                className="border-border bg-background hover:border-foreground/30 group block rounded-xl border p-5 transition-colors"
              >
                <Eyebrow variant="mute">{CATEGORY_LABEL[meta.category]}</Eyebrow>
                <p className="font-display text-foreground group-hover:text-primary mt-2 text-lg font-medium leading-tight tracking-[-0.005em]">
                  {meta.name}
                </p>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {meta.description}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
