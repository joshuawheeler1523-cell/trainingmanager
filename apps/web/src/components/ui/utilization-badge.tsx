import { cn } from "@/lib/utils";

type UtilizationStatus = "under_utilized" | "balanced" | "at_risk" | "over_allocated";

function statusFromValue(value: number): UtilizationStatus {
  if (value >= 0.95) return "over_allocated";
  if (value >= 0.8) return "at_risk";
  if (value >= 0.4) return "balanced";
  return "under_utilized";
}

const STATUS_STYLES: Record<UtilizationStatus, string> = {
  under_utilized: "bg-status-gray-bg text-status-gray",
  balanced: "bg-capacity-green-bg text-capacity-green",
  at_risk: "bg-capacity-yellow-bg text-capacity-yellow",
  over_allocated: "bg-capacity-red-bg text-capacity-red",
};

const STATUS_LABEL: Record<UtilizationStatus, string> = {
  under_utilized: "Under-utilized",
  balanced: "Balanced",
  at_risk: "At risk",
  over_allocated: "Over-allocated",
};

type Props = {
  /** Utilization as a decimal (0–1+). E.g. 0.85 = 85%. */
  value: number;
  showLabel?: boolean;
  className?: string;
};

export default function UtilizationBadge({ value, showLabel = false, className }: Props) {
  const status = statusFromValue(value);
  const pct = Math.round(value * 100);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
      title={`${String(pct)}% — ${STATUS_LABEL[status]}`}
    >
      {pct}%{showLabel && <span>· {STATUS_LABEL[status]}</span>}
    </span>
  );
}
