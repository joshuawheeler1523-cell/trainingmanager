"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowDownTrayIcon } from "@heroicons/react/20/solid";
import {
  capacityForecastSummary,
  capacityTier,
  type CapacityForecastItem,
  type CapacityForecastMonth,
} from "@arbor/shared";
import { Eyebrow } from "@/components/ui";
import CapacityForecastChart from "@/components/charts/capacity-forecast-chart";
import { capacityForecastAction } from "./actions";

const SOURCE_LABEL: Record<string, string> = {
  class: "Class",
  recurring_task: "Recurring",
  ad_hoc_task: "Ad-hoc",
  education_request: "Education request",
  project_task: "Project",
  impl_session: "Implementation",
  impl_planned: "Planned rollout",
  unestimated_request: "Incoming request",
};

function itemHref(item: CapacityForecastItem): string | null {
  if (!item.link_id) return null;
  switch (item.link_type) {
    case "class":
      return `/classes/${item.link_id}`;
    case "project":
      return `/projects/${item.link_id}`;
    case "implementation":
      return `/training-planner/${item.link_id}`;
    default:
      return null;
  }
}

function timingText(item: CapacityForecastItem): string {
  if (!item.starts) return "Ongoing";
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  if (item.ends && item.ends !== item.starts) return `${fmt(item.starts)} – ${fmt(item.ends)}`;
  return fmt(item.starts);
}

type Dept = { id: string; name: string };

function monthLong(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ForecastView({
  initialMonths,
  initialUndated,
  initialItems,
  departments,
}: {
  initialMonths: CapacityForecastMonth[];
  initialUndated: number;
  initialItems: CapacityForecastItem[];
  departments: Dept[];
}) {
  const [months, setMonths] = useState<CapacityForecastMonth[]>(initialMonths);
  const [undatedHours, setUndatedHours] = useState<number>(initialUndated);
  const [items, setItems] = useState<CapacityForecastItem[]>(initialItems);
  const [deptId, setDeptId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  function changeDept(next: string) {
    setDeptId(next);
    startTransition(async () => {
      const res = await capacityForecastAction(next === "" ? null : next);
      if (res.ok) {
        setMonths(res.data.months);
        setUndatedHours(res.data.undatedHours);
        setItems(res.data.items);
      } else {
        toast.error(res.error.message);
      }
    });
  }

  const committedItems = sortItems(items.filter((i) => i.layer === "committed"));
  const pipelineItems = sortItems(items.filter((i) => i.layer === "pipeline"));

  const summary = capacityForecastSummary(months);
  const headcount = months[0]?.instructor_count ?? 0;

  function downloadCsv() {
    const cols = [
      "month",
      "committed_hours",
      "pipeline_hours",
      "pto_hours",
      "available_hours",
      "utilization_pct",
      "over_capacity",
      "unestimated_incoming_requests",
    ];
    const rows = months.map((m) => {
      const demand = m.committed_hours + m.pipeline_hours;
      const util = m.available_hours > 0 ? (demand / m.available_hours) * 100 : 0;
      return [
        m.month_start,
        round(m.committed_hours),
        round(m.pipeline_hours),
        round(m.pto_hours),
        round(m.available_hours),
        round(util),
        capacityTier(demand, m.available_hours) === "over" ? "yes" : "no",
        m.unestimated_pipeline_requests,
      ].join(",");
    });
    const csv = "﻿" + [cols.join(","), ...rows].join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "capacity-forecast.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className={`space-y-6 ${pending ? "opacity-60" : ""}`}>
      {/* Scope + export */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label
            htmlFor="forecast-dept"
            className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wide"
          >
            Department
          </label>
          <select
            id="forecast-dept"
            value={deptId}
            disabled={pending}
            onChange={(e) => {
              changeDept(e.target.value);
            }}
            className="border-input bg-background text-foreground rounded-md border px-3 py-2 text-sm"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          label="First over capacity"
          value={summary.firstOverMonth ? monthLong(summary.firstOverMonth) : "None in range"}
          tone={summary.firstOverMonth ? "danger" : "ok"}
        />
        <Kpi
          label="Peak utilization"
          value={summary.peakUtilPct == null ? "—" : `${summary.peakUtilPct.toFixed(0)}%`}
          sub={summary.peakUtilMonth ? monthLong(summary.peakUtilMonth) : ""}
          tone={
            summary.peakUtilPct == null
              ? "ok"
              : summary.peakUtilPct >= 100
                ? "danger"
                : summary.peakUtilPct >= 80
                  ? "warning"
                  : "ok"
          }
        />
        <Kpi
          label="Projected shortfall"
          value={`${Math.round(summary.totalShortfallHours).toLocaleString()} h`}
          sub="over the 12-month horizon"
          tone={summary.totalShortfallHours > 0 ? "warning" : "ok"}
        />
        <Kpi
          label="Active instructors"
          value={String(headcount)}
          sub={
            summary.unestimatedRequests > 0
              ? `+${String(summary.unestimatedRequests)} unestimated incoming`
              : "in scope"
          }
          tone="info"
        />
      </div>

      {/* Chart */}
      <section className="border-border bg-background rounded-xl border p-5">
        <Eyebrow className="mb-3">Demand vs capacity · next 12 months</Eyebrow>
        <CapacityForecastChart months={months} />
      </section>

      {/* Monthly table */}
      <section className="border-border bg-background overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th>Month</Th>
                <Th className="text-right">Committed</Th>
                <Th className="text-right">Pipeline</Th>
                <Th className="text-right">PTO</Th>
                <Th className="text-right">Available</Th>
                <Th className="text-right">Utilization</Th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {months.map((m) => {
                const demand = m.committed_hours + m.pipeline_hours;
                const util = m.available_hours > 0 ? (demand / m.available_hours) * 100 : null;
                const over = capacityTier(demand, m.available_hours) === "over";
                return (
                  <tr key={m.month_start} className={over ? "bg-danger-bg/40" : undefined}>
                    <td className="text-foreground px-3 py-2 font-medium">
                      {monthLong(m.month_start)}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                      {Math.round(m.committed_hours).toLocaleString()}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                      {Math.round(m.pipeline_hours).toLocaleString()}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                      {Math.round(m.pto_hours).toLocaleString()}
                    </td>
                    <td className="text-foreground px-3 py-2 text-right tabular-nums">
                      {Math.round(m.available_hours).toLocaleString()}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold tabular-nums ${
                        over
                          ? "text-danger"
                          : util != null && util >= 80
                            ? "text-warning"
                            : "text-foreground"
                      }`}
                    >
                      {util == null ? "—" : `${util.toFixed(0)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground border-border border-t px-3 py-2 text-[11px]">
          Pipeline = unassigned ad-hoc work + planned-but-unscheduled implementations. Unestimated
          incoming requests (work-intake without an hours estimate yet) are counted but not added to
          the bars. Capacity = active instructors&apos; annual hours ÷ 12, minus dated PTO.
          {undatedHours > 0 && (
            <>
              {" "}
              <span className="text-foreground font-medium">
                + {Math.round(undatedHours).toLocaleString()} h of committed work has no date set
              </span>{" "}
              and isn&apos;t placed on the timeline above — add start/due dates to include it.
            </>
          )}
        </p>
      </section>

      {/* Drill-down: the actual work behind the numbers */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ItemTable
          title="Committed work"
          subtitle="Assigned to instructors in scope"
          items={committedItems}
        />
        <ItemTable
          title="Pipeline work"
          subtitle="Incoming, not yet staffed"
          items={pipelineItems}
        />
      </div>
    </div>
  );
}

function sortItems(items: CapacityForecastItem[]): CapacityForecastItem[] {
  // Hours desc; null-hours (unestimated) last, then by label.
  return [...items].sort((a, b) => {
    if ((a.hours ?? -1) !== (b.hours ?? -1)) return (b.hours ?? -1) - (a.hours ?? -1);
    return a.label.localeCompare(b.label);
  });
}

function ItemTable({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: CapacityForecastItem[];
}) {
  const total = items.reduce((s, i) => s + (i.hours ?? 0), 0);
  return (
    <section className="border-border bg-background overflow-hidden rounded-xl border">
      <div className="border-border flex items-baseline justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-foreground text-base font-bold">{title}</h3>
          <p className="text-muted-foreground text-xs">{subtitle}</p>
        </div>
        <span className="text-muted-foreground font-mono text-[11px]">
          <b className="text-foreground tabular-nums">{Math.round(total).toLocaleString()}</b> h
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground p-6 text-center text-sm italic">No items in range.</p>
      ) : (
        <ul className="divide-border divide-y">
          {items.map((item, i) => {
            const href = itemHref(item);
            return (
              <li
                key={`${item.source}-${item.link_id ?? item.label}-${String(i)}`}
                className="px-4 py-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {href ? (
                      <Link
                        href={href}
                        className="text-foreground hover:text-primary block truncate text-sm font-medium"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span className="text-foreground block truncate text-sm font-medium">
                        {item.label}
                      </span>
                    )}
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      <span className="bg-surface text-muted-foreground mr-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                        {SOURCE_LABEL[item.source] ?? item.source}
                      </span>
                      {timingText(item)}
                    </p>
                  </div>
                  <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
                    {item.hours == null ? "—" : `${Math.round(item.hours).toLocaleString()} h`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
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

type Tone = "ok" | "info" | "warning" | "danger";

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
}) {
  const color =
    tone === "danger"
      ? "var(--danger)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "info"
          ? "var(--primary)"
          : "var(--foreground)";
  return (
    <div className="border-border bg-background rounded-xl border p-4">
      <p className="text-muted-foreground font-mono text-[10px] font-medium uppercase tracking-[0.08em]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-medium tabular-nums leading-none" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-muted-foreground mt-2 text-[11px]">{sub}</p>}
    </div>
  );
}
