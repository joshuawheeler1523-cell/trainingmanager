import { Eyebrow } from "@/components/ui";
import { BUCKET_COLORS } from "@/components/ui/capacity-bar";
import type { BucketConsumptionInput } from "@arbor/shared";

// Right-column panel from the Allocations design mock: each bucket on
// its own row showing actual % vs target % with a signed delta in
// red / forest / mute depending on direction.
//
// This is read-only — the editing surface is still the tabs below.

type Props = {
  consumption: BucketConsumptionInput[];
  totalOrgHours: number;
};

// Pick a color dot for each bucket by name — we don't have a stored
// color column on allocation_buckets, so we infer from canonical names
// and fall back to forest. Buckets that don't match still get a sane
// dot.
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

export default function BucketConsumptionPanel({ consumption, totalOrgHours }: Props) {
  const lines = consumption.map((b) => {
    const consumedPct = totalOrgHours > 0 ? (b.consumed_hours / totalOrgHours) * 100 : 0;
    const delta = consumedPct - b.target_percent;
    return {
      name: b.bucket_name,
      consumedPct,
      targetPct: b.target_percent,
      delta,
      color: colorFor(b.bucket_name),
    };
  });

  const overBuckets = lines.filter((l) => l.delta > 1).map((l) => l.name);

  return (
    <div className="border-border bg-background rounded-md border p-4">
      <div className="mb-3">
        <Eyebrow variant="mute">Bucket consumption · team-wide</Eyebrow>
        <p className="text-foreground font-display mt-1.5 text-base font-medium leading-tight">
          Where capacity actually went
        </p>
      </div>

      <ul className="divide-border divide-y">
        {lines.map((l) => (
          <li
            key={l.name}
            className="grid grid-cols-[1fr_auto] items-baseline gap-3 py-2.5 text-sm"
          >
            <span className="text-foreground inline-flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: l.color }}
              />
              {l.name}
            </span>
            <span className="font-mono text-xs tabular-nums">
              <b className="text-foreground font-medium">{l.consumedPct.toFixed(0)}%</b>{" "}
              <span className="text-muted-foreground">/ {l.targetPct.toFixed(0)}%</span>{" "}
              <span
                className={
                  Math.abs(l.delta) < 1
                    ? "text-muted-foreground"
                    : l.delta > 0
                      ? "font-medium text-[var(--red)]"
                      : "text-muted-foreground"
                }
              >
                {l.delta > 0 ? "+" : ""}
                {l.delta.toFixed(0)}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {overBuckets.length > 0 && (
        <div className="border-border mt-4 flex items-start gap-3 rounded-md border border-[rgba(183,61,61,0.18)] bg-[rgba(183,61,61,0.06)] p-3 text-xs">
          <span
            aria-hidden
            className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full bg-[var(--red)]"
          />
          <div className="text-ink-soft">
            <p className="text-foreground font-medium">
              {overBuckets.length === 1
                ? `${overBuckets[0] ?? ""} is over target.`
                : `${overBuckets.length.toString()} buckets are over target.`}
            </p>
            <p className="text-muted-foreground mt-0.5">
              {overBuckets.length === 1
                ? "Reassign hours or raise the target if this reflects current reality."
                : `Over: ${overBuckets.join(", ")}.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
