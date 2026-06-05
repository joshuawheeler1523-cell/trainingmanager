import Link from "next/link";
import { Badge, CapacityBar, Eyebrow, type BadgeVariant } from "@/components/ui";
import { BUCKET_COLORS } from "@/components/ui/capacity-bar";

type Bucket = { id: string; name: string };

type InstructorRow = {
  id: string;
  full_name: string;
  department: string | null;
  annual_hours: number;
  assigned_hours: number;
  utilization_pct: number | null;
  /** Hours-per-bucket for this instructor. Keyed by bucket_id. */
  hoursPerBucket: Map<string, number>;
};

// Neutral fill for workload that has no allocation bucket (training-planner
// sessions, education requests, or any class/recurring task left unbucketed).
// Without this segment the bar would read empty even though utilization_pct
// is non-zero — assigned_hours counts unbucketed work but per-bucket segments
// don't.
const UNBUCKETED_COLOR = "var(--ink-mute)";

type Props = {
  buckets: Bucket[];
  rows: InstructorRow[];
};

function statusFor(pct: number | null): { variant: BadgeVariant; label: string } {
  if (pct == null) return { variant: "neutral", label: "No data" };
  if (pct >= 100) return { variant: "danger", label: "Over" };
  if (pct >= 90) return { variant: "warning", label: "At risk" };
  if (pct >= 40) return { variant: "success", label: "Balanced" };
  return { variant: "neutral", label: "Has room" };
}

// Map a bucket name to one of the five canonical bucket colors. Mirrors
// the heuristic in BucketConsumptionPanel so the same bucket gets the
// same color in both views.
function colorFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("training") || n.includes("teach") || n.includes("direct")) {
    return BUCKET_COLORS.training;
  }
  if (n.includes("course") || n.includes("develop") || n.includes("curric")) {
    return BUCKET_COLORS.coursedev;
  }
  if (n.includes("admin")) return BUCKET_COLORS.admin;
  if (n.includes("compliance") || n.includes("audit") || n.includes("cert")) {
    return BUCKET_COLORS.compliance;
  }
  if (n.includes("pto") || n.includes("leave") || n.includes("non-product")) {
    return BUCKET_COLORS.pto;
  }
  return "var(--forest)";
}

export default function TeamUtilizationRoster({ buckets, rows }: Props) {
  return (
    <div className="border-border bg-background rounded-md border p-4">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <Eyebrow variant="mute">Team utilization</Eyebrow>
          <p className="text-foreground font-display mt-1.5 text-base font-medium leading-tight">
            {rows.length} {rows.length === 1 ? "instructor" : "instructors"} · target line at 100%
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm italic">
          No active instructors yet.
        </p>
      ) : (
        <ul className="divide-border divide-y">
          {rows.map((r) => {
            const status = statusFor(r.utilization_pct);
            const pct = r.utilization_pct ?? 0;
            // Build segments scaled against annual_hours; each bucket gets a
            // segment whose width is its fraction of annual_hours expressed
            // as a percent of the 120% bar.
            const segments = buckets
              .map((b) => {
                const hrs = r.hoursPerBucket.get(b.id) ?? 0;
                const percent = r.annual_hours > 0 ? (hrs / r.annual_hours) * 100 : 0;
                return percent > 0 ? { percent, color: colorFor(b.name), label: b.name } : null;
              })
              .filter((s): s is NonNullable<typeof s> => s !== null);
            // Any utilization not attributed to a bucket renders as a neutral
            // tail segment so the bar always matches the displayed percentage.
            const bucketedPct = segments.reduce((acc, s) => acc + s.percent, 0);
            const unbucketedPct = Math.max(0, pct - bucketedPct);
            if (unbucketedPct > 0) {
              segments.push({
                percent: unbucketedPct,
                color: UNBUCKETED_COLOR,
                label: "Unbucketed",
              });
            }
            const overage = pct > 100 ? pct - 100 : 0;

            return (
              <li
                key={r.id}
                className="grid grid-cols-[1fr_2fr_auto_auto] items-center gap-4 py-2.5"
              >
                <div className="min-w-0">
                  <Link
                    href={`/instructors/${r.id}`}
                    className="text-foreground hover:text-primary block truncate text-sm font-medium"
                  >
                    {r.full_name}
                  </Link>
                  {r.department && (
                    <p className="text-muted-foreground truncate text-xs">{r.department}</p>
                  )}
                </div>
                <CapacityBar segments={segments} overagePercent={overage} />
                <span
                  className={`w-10 text-right font-mono text-xs tabular-nums ${pct >= 100 ? "font-medium text-[var(--red)]" : "text-foreground"}`}
                >
                  {pct.toFixed(0)}%
                </span>
                <Badge variant={status.variant}>{status.label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export type { InstructorRow as TeamRosterRow };
