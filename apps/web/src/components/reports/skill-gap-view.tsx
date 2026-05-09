"use client";

import type { SkillGapDataset } from "@arbor/shared";
import { Label, useLabel } from "@/components/labels";

export default function SkillGapView({ data }: { data: SkillGapDataset }) {
  const instructorPlural = useLabel("entity.instructor", { plural: true, lower: true });
  return (
    <div className="space-y-6">
      <Section
        title={`Insufficient coverage (${data.insufficient_coverage.length.toString()})`}
        empty={`Every skill has at least the threshold of qualified ${instructorPlural}.`}
        emptyTone="emerald"
      >
        {data.insufficient_coverage.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th className="w-1/2">Skill</Th>
                <Th>Qualified</Th>
                <Th>Threshold</Th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {data.insufficient_coverage.map((r) => (
                <tr key={r.skill_id}>
                  <td className="text-foreground px-3 py-2 font-medium">{r.skill_name}</td>
                  <td className="px-3 py-2 font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                    {r.qualified_count.toString()}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 tabular-nums">
                    {r.threshold.toString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title={`Expiring certifications (${data.expiring_certs.length.toString()})`}
        empty="No certifications expire in the chosen window."
        emptyTone="muted"
      >
        {data.expiring_certs.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th>
                  <Label kind="entity.instructor" />
                </Th>
                <Th>Skill</Th>
                <Th>Expires</Th>
                <Th>Days remaining</Th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {data.expiring_certs.map((r, i) => (
                <tr key={`${r.instructor_id}-${r.skill_id}-${i.toString()}`}>
                  <td className="text-foreground px-3 py-2">{r.instructor_name}</td>
                  <td className="text-foreground px-3 py-2">{r.skill_name}</td>
                  <td className="text-muted-foreground px-3 py-2 tabular-nums">{r.expires_at}</td>
                  <td
                    className={`px-3 py-2 font-medium tabular-nums ${r.days_remaining < 30 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}
                  >
                    {r.days_remaining.toString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title={`Over-coverage (${data.over_coverage.length.toString()})`}
        empty="No skills look over-covered."
        emptyTone="muted"
      >
        {data.over_coverage.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th className="w-1/2">Skill</Th>
                <Th>Qualified</Th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {data.over_coverage.map((r) => (
                <tr key={r.skill_id}>
                  <td className="text-foreground px-3 py-2">{r.skill_name}</td>
                  <td className="text-foreground px-3 py-2 tabular-nums">
                    {r.qualified_count.toString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  empty,
  emptyTone,
  children,
}: {
  title: string;
  empty: string;
  emptyTone: "emerald" | "muted";
  children: React.ReactNode;
}) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);
  const emptyCls =
    emptyTone === "emerald"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
      : "border-border bg-surface text-muted-foreground";
  return (
    <div>
      <h3 className="text-foreground mb-2 text-sm font-semibold">{title}</h3>
      {isEmpty ? (
        <p className={`rounded-md border p-3 text-xs ${emptyCls}`}>{empty}</p>
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">{children}</div>
      )}
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
