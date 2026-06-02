"use client";

import type { AllocationDataset } from "@arbor/shared";

const BAND_LABEL: Record<AllocationDataset["utilization_histogram"][number]["band"], string> = {
  under_utilized: "Under-utilized",
  balanced: "Balanced",
  at_risk: "At risk",
  over_allocated: "Over-allocated",
};

const BAND_COLOR: Record<AllocationDataset["utilization_histogram"][number]["band"], string> = {
  under_utilized: "bg-slate-300",
  balanced: "bg-success",
  at_risk: "bg-warning",
  over_allocated: "bg-danger",
};

export default function AllocationView({ data }: { data: AllocationDataset }) {
  const histogramMax = Math.max(1, ...data.utilization_histogram.map((h) => h.count));

  return (
    <div className="space-y-6">
      {/* Headline metrics */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="Total assigned hours" value={`${round(data.total_hours).toString()}h`} />
        <Card
          label="High-priority share"
          value={`${round(data.high_priority_percent).toString()}%`}
          hint="Hours on critical/high-priority project tasks"
        />
        <Card
          label="Unallocated capacity"
          value={`${round(data.unallocated_hours).toString()}h`}
          hint="Sum of (annual − assigned) across active instructors"
        />
      </div>

      {/* Buckets */}
      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted-foreground text-xs">
            <tr>
              <Th className="w-1/4">Bucket</Th>
              <Th>Target %</Th>
              <Th>Actual %</Th>
              <Th>Variance</Th>
              <Th>Hours</Th>
              <Th>Top consumers</Th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {data.buckets.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-3 py-6 text-center text-xs">
                  No bucket allocations recorded.
                </td>
              </tr>
            ) : (
              data.buckets.map((b) => (
                <tr key={b.bucket_id ?? "_none"}>
                  <td className="text-foreground px-3 py-2 font-medium">{b.bucket_name}</td>
                  <td className="text-muted-foreground px-3 py-2 tabular-nums">
                    {round(b.target_percent).toString()}%
                  </td>
                  <td className="text-foreground px-3 py-2 tabular-nums">
                    {round(b.actual_percent).toString()}%
                  </td>
                  <td
                    className={`px-3 py-2 font-medium tabular-nums ${
                      b.variance_percent >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {b.variance_percent >= 0 ? "+" : ""}
                    {round(b.variance_percent).toString()}%
                  </td>
                  <td className="text-muted-foreground px-3 py-2 tabular-nums">
                    {round(b.actual_hours).toString()}h
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-xs">
                    {b.top_consumers.length === 0
                      ? "—"
                      : b.top_consumers
                          .map((c) => `${c.instructor_name} (${round(c.hours).toString()}h)`)
                          .join(", ")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Histogram */}
      <div className="border-border bg-background rounded-lg border p-4">
        <p className="text-foreground mb-2 text-sm font-semibold">Utilization distribution</p>
        <div className="space-y-2">
          {data.utilization_histogram.map((h) => (
            <div key={h.band} className="flex items-center gap-3">
              <span className="text-muted-foreground w-32 text-xs">{BAND_LABEL[h.band]}</span>
              <div className="bg-surface h-4 flex-1 overflow-hidden rounded">
                <div
                  className={`h-full ${BAND_COLOR[h.band]}`}
                  style={{ width: `${((h.count / histogramMax) * 100).toString()}%` }}
                />
              </div>
              <span className="text-foreground w-8 text-right text-xs tabular-nums">
                {h.count.toString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-border bg-background rounded-lg border p-4">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="text-foreground mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wide ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
