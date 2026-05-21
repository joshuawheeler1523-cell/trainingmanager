"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  PencilSquareIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  PlusIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/20/solid";
import SkillFormDialog from "./skill-form-dialog";
import { ManagerOnly } from "@/components/auth/role-gate";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import CsvImportDialog from "@/components/csv-import-dialog";
import { Badge, Eyebrow, Tabs, type TabItem } from "@/components/ui";
import { cn } from "@/lib/utils";
import { archiveSkill, importSkillsCsv, unarchiveSkill } from "./actions";
import { PROFICIENCY_VALUES } from "@arbor/shared";
import type { Skill, Proficiency } from "@arbor/shared";

type Tab = "library" | "coverage" | "matrix" | "gaps";

const TABS: { id: Tab; label: string }[] = [
  { id: "library", label: "Library" },
  { id: "coverage", label: "Coverage" },
  { id: "matrix", label: "Matrix" },
  { id: "gaps", label: "Gaps" },
];

export type CoverageCount = {
  skill_id: string;
  proficiency: Proficiency;
  count: number;
};

export type ClassGap = {
  class_id: string;
  class_name: string;
  required_count: number;
  qualified_count: number;
};

export type ExpiringCert = {
  instructor_skill_id: string;
  instructor_id: string;
  instructor_name: string;
  skill_id: string;
  skill_name: string;
  expires_at: string;
  days_until: number;
};

export type MatrixData = {
  instructors: { id: string; name: string }[];
  classes: { id: string; name: string; requiredSkillCount: number }[];
  // Per-class array of qualified instructor ids. Plain Record so this
  // serializes cleanly across the RSC boundary.
  qualifiedByClass: Record<string, string[]>;
};

type Props = {
  skills: Skill[];
  coverage: CoverageCount[];
  classGaps: ClassGap[];
  uncoveredSkillIds: string[];
  expiringCerts: ExpiringCert[];
  matrix: MatrixData;
};

export default function SkillsView({
  skills,
  coverage,
  classGaps,
  uncoveredSkillIds,
  expiringCerts,
  matrix,
}: Props) {
  const [tab, setTab] = useState<Tab>("library");
  const [showArchived, setShowArchived] = useState(false);

  const visibleSkills = skills.filter((s) => (showArchived ? s.is_archived : !s.is_archived));

  const tabItems: TabItem<Tab>[] = TABS.map((t) => ({ id: t.id, label: t.label }));

  return (
    <div>
      <Tabs<Tab>
        tabs={tabItems}
        value={tab}
        onChange={(id) => {
          setTab(id);
        }}
      />

      <div className="p-6">
        {tab === "library" && (
          <LibraryTab
            skills={visibleSkills}
            showArchived={showArchived}
            setShowArchived={setShowArchived}
          />
        )}
        {tab === "coverage" && (
          <CoverageTab skills={skills.filter((s) => !s.is_archived)} coverage={coverage} />
        )}
        {tab === "matrix" && <MatrixTab matrix={matrix} />}
        {tab === "gaps" && (
          <GapsTab
            skills={skills}
            classGaps={classGaps}
            uncoveredSkillIds={uncoveredSkillIds}
            expiringCerts={expiringCerts}
          />
        )}
      </div>
    </div>
  );
}

// ── Library tab ─────────────────────────────────────────────────────────────

function LibraryTab({
  skills,
  showArchived,
  setShowArchived,
}: {
  skills: Skill[];
  showArchived: boolean;
  setShowArchived: (v: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleArchive(id: string) {
    startTransition(async () => {
      const result = await archiveSkill(id);
      if (result.ok) {
        toast.success("Skill archived");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleRestore(id: string) {
    startTransition(async () => {
      const result = await unarchiveSkill(id);
      if (result.ok) {
        toast.success("Skill restored");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
            }}
            className="border-border h-3.5 w-3.5 rounded"
          />
          Show archived
        </label>

        <div className="flex items-center gap-2">
          <CsvImportDialog
            entity="skills"
            description="Upsert skills by name (case-insensitive). Existing skills with a matching name will be updated; new names will be inserted."
            columns={[
              { key: "name", required: true, help: "Display name; max 200 chars" },
              { key: "category", required: false, help: "Optional grouping label" },
              { key: "description", required: false },
              {
                key: "is_certification",
                required: false,
                help: "true / yes / 1 — anything else is false",
              },
              { key: "certifying_authority", required: false, help: "Issuing body, if cert" },
            ]}
            serverAction={importSkillsCsv}
            trigger={
              <button
                type="button"
                className="border-border text-foreground hover:bg-surface inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
              >
                <ArrowUpTrayIcon className="h-4 w-4" />
                Import CSV
              </button>
            }
          />
          <ManagerOnly>
            <SkillFormDialog
              mode="create"
              trigger={
                <button
                  type="button"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add skill
                </button>
              }
              onSuccess={() => {
                router.refresh();
              }}
            />
          </ManagerOnly>
        </div>
      </div>

      {skills.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            {showArchived
              ? "No archived skills."
              : "No skills yet — click “Add skill” to start your library."}
          </p>
        </div>
      ) : (
        <div className="border-border bg-background overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-border border-b border-dashed">
              <tr>
                <ThSkills>Name</ThSkills>
                <ThSkills>Category</ThSkills>
                <ThSkills>Type</ThSkills>
                <ThSkills>Authority</ThSkills>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {skills.map((s) => (
                <tr key={s.id} className="hover:bg-surface">
                  <td className="font-display text-foreground px-4 py-3 text-base font-medium leading-tight">
                    {s.name}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-xs">{s.category ?? "—"}</td>
                  <td className="px-4 py-3">
                    {s.is_certification ? (
                      <Badge variant="info">Certification</Badge>
                    ) : (
                      <span className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[0.04em]">
                        Skill
                      </span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 font-mono text-[11px] tracking-[0.02em]">
                    {s.certifying_authority ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ManagerOnly>
                      <div className="flex items-center justify-end gap-2">
                        <SkillFormDialog
                          mode="edit"
                          skill={s}
                          trigger={
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                            >
                              <PencilSquareIcon className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          }
                          onSuccess={() => {
                            router.refresh();
                          }}
                        />
                        {s.is_archived ? (
                          <ConfirmDialog
                            trigger={
                              <button
                                type="button"
                                disabled={pending}
                                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs disabled:opacity-50"
                              >
                                <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                                Restore
                              </button>
                            }
                            title="Restore skill?"
                            description="This skill will be visible in the library again."
                            confirmLabel="Restore"
                            onConfirm={() => {
                              handleRestore(s.id);
                            }}
                          />
                        ) : (
                          <ConfirmDialog
                            trigger={
                              <button
                                type="button"
                                disabled={pending}
                                className="text-destructive hover:text-destructive/80 inline-flex items-center gap-1 text-xs disabled:opacity-50"
                              >
                                <ArchiveBoxIcon className="h-3.5 w-3.5" />
                                Archive
                              </button>
                            }
                            title="Archive skill?"
                            description="This skill will be hidden from the library. Existing instructor skills are kept."
                            confirmLabel="Archive"
                            destructive
                            onConfirm={() => {
                              handleArchive(s.id);
                            }}
                          />
                        )}
                      </div>
                    </ManagerOnly>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Shared mono uppercase table header for the editorial skills tables.
function ThSkills({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "text-muted-foreground px-4 py-3 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em]",
        className,
      )}
    >
      {children}
    </th>
  );
}

// ── Coverage tab ────────────────────────────────────────────────────────────

function CoverageTab({ skills, coverage }: { skills: Skill[]; coverage: CoverageCount[] }) {
  function countAt(skillId: string, proficiency: Proficiency): number {
    return (
      coverage.find((c) => c.skill_id === skillId && c.proficiency === proficiency)?.count ?? 0
    );
  }

  if (skills.length === 0) {
    return (
      <div className="border-border bg-surface rounded-xl border border-dashed p-10 text-center">
        <p className="text-muted-foreground text-sm">Add skills to the library to see coverage.</p>
      </div>
    );
  }

  return (
    <div className="border-border bg-background overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="border-border border-b border-dashed">
          <tr>
            <ThSkills>Skill</ThSkills>
            {PROFICIENCY_VALUES.map((p) => (
              <ThSkills key={p} className="text-right capitalize">
                {p}
              </ThSkills>
            ))}
            <ThSkills className="text-right">Total</ThSkills>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {skills.map((s) => {
            const total = PROFICIENCY_VALUES.reduce((sum, p) => sum + countAt(s.id, p), 0);
            return (
              <tr key={s.id} className="hover:bg-surface">
                <td className="font-display text-foreground px-4 py-3 text-base font-medium leading-tight">
                  {s.name}
                </td>
                {PROFICIENCY_VALUES.map((p) => {
                  const n = countAt(s.id, p);
                  return (
                    <td
                      key={p}
                      className={cn(
                        "px-4 py-3 text-right font-mono text-[11.5px] tabular-nums",
                        n === 0 ? "text-muted-foreground" : "text-foreground font-medium",
                      )}
                    >
                      {n}
                    </td>
                  );
                })}
                <td
                  className={cn(
                    "font-display px-4 py-3 text-right text-base font-medium tabular-nums",
                    total === 0 ? "text-[var(--red)]" : "text-foreground",
                  )}
                >
                  {total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Matrix tab ──────────────────────────────────────────────────────────────
// Instructor × Class pivot of who can teach what. Reuses the
// qualified_instructors_for_class RPC data already fetched on the page,
// so no new SQL. Cells: ✓ green if qualified, blank rose if not, "—" gray
// when the class has no required skills (then everyone "qualifies"
// vacuously). Filters for single-point-of-failure spotting.

function MatrixTab({ matrix }: { matrix: MatrixData }) {
  const [filter, setFilter] = useState<"all" | "spof" | "uncovered">("all");
  const [query, setQuery] = useState("");

  const qualifiedSets = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const [cid, ids] of Object.entries(matrix.qualifiedByClass)) {
      m.set(cid, new Set(ids));
    }
    return m;
  }, [matrix.qualifiedByClass]);

  // Per-class qualified count, for SPOF filter + footer.
  const qualifiedCountByClass = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of matrix.classes) {
      m.set(c.id, qualifiedSets.get(c.id)?.size ?? 0);
    }
    return m;
  }, [matrix.classes, qualifiedSets]);

  // Per-instructor qualified count, for the right-hand column.
  const qualifiedCountByInstructor = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of matrix.instructors) m.set(i.id, 0);
    for (const ids of qualifiedSets.values()) {
      for (const iid of ids) {
        m.set(iid, (m.get(iid) ?? 0) + 1);
      }
    }
    return m;
  }, [matrix.instructors, qualifiedSets]);

  // Apply filters.
  const visibleClasses = useMemo(() => {
    let cs = matrix.classes;
    if (filter === "spof") cs = cs.filter((c) => (qualifiedCountByClass.get(c.id) ?? 0) === 1);
    if (filter === "uncovered") cs = cs.filter((c) => (qualifiedCountByClass.get(c.id) ?? 0) === 0);
    const q = query.trim().toLowerCase();
    if (q) cs = cs.filter((c) => c.name.toLowerCase().includes(q));
    return cs;
  }, [matrix.classes, filter, qualifiedCountByClass, query]);

  if (matrix.classes.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-sm italic">
        No classes have required skills yet. Add skill requirements to a class via{" "}
        <Link href="/classes" className="underline">
          /classes
        </Link>{" "}
        to populate the matrix.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-muted-foreground text-xs">
        <p>
          Rows are instructors. Columns are classes with required skills. A green{" "}
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 align-middle text-[10px] font-bold text-white">
            ✓
          </span>{" "}
          means the instructor has every required skill at the required proficiency.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          placeholder="Filter classes…"
          className="border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm"
        />
        <div role="tablist" className="inline-flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "all", label: "All", count: matrix.classes.length },
              {
                id: "spof",
                label: "Single point of failure",
                count: matrix.classes.filter((c) => (qualifiedCountByClass.get(c.id) ?? 0) === 1)
                  .length,
              },
              {
                id: "uncovered",
                label: "Uncovered",
                count: matrix.classes.filter((c) => (qualifiedCountByClass.get(c.id) ?? 0) === 0)
                  .length,
              },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFilter(f.id);
              }}
              aria-pressed={filter === f.id}
              className={cn(
                "rounded-[3px] px-2 py-1 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.06em] transition-colors",
                filter === f.id
                  ? "bg-[var(--ink,var(--foreground))] text-[var(--cream,var(--background))]"
                  : "bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              <span className="ml-1.5 tabular-nums opacity-70">{f.count.toString()}</span>
            </button>
          ))}
        </div>
      </div>

      {visibleClasses.length === 0 ? (
        <p className="text-muted-foreground py-8 text-sm italic">No classes match the filter.</p>
      ) : (
        <div className="border-border overflow-auto rounded-lg border">
          <table className="text-xs">
            <thead className="bg-surface sticky top-0 z-10">
              <tr>
                <th className="bg-surface border-border sticky left-0 z-20 min-w-48 border-r px-3 py-2 text-left font-medium uppercase tracking-wide">
                  Trainer
                </th>
                {visibleClasses.map((c) => {
                  const qCount = qualifiedCountByClass.get(c.id) ?? 0;
                  return (
                    <th
                      key={c.id}
                      className="text-muted-foreground border-border min-w-28 max-w-40 border-r px-2 py-2 text-left align-bottom font-medium"
                      title={`${c.name} — ${qCount.toString()} qualified · ${c.requiredSkillCount.toString()} required skills`}
                    >
                      <div className="truncate">{c.name}</div>
                      <div
                        className={`mt-0.5 text-[10px] tabular-nums ${
                          qCount === 0
                            ? "text-rose-600 dark:text-rose-400"
                            : qCount === 1
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground"
                        }`}
                      >
                        {qCount.toString()} qual.
                      </div>
                    </th>
                  );
                })}
                <th className="bg-surface border-border sticky right-0 z-10 min-w-20 border-l px-2 py-2 text-right font-medium uppercase tracking-wide">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {matrix.instructors.map((i) => {
                const total = qualifiedCountByInstructor.get(i.id) ?? 0;
                return (
                  <tr key={i.id} className="hover:bg-surface/30">
                    <td className="bg-background border-border sticky left-0 border-r px-3 py-1.5 font-medium">
                      <Link
                        href={`/instructors/${i.id}`}
                        className="text-foreground hover:text-primary truncate underline-offset-2 hover:underline"
                      >
                        {i.name}
                      </Link>
                    </td>
                    {visibleClasses.map((c) => {
                      const qualified = qualifiedSets.get(c.id)?.has(i.id) ?? false;
                      return (
                        <td
                          key={c.id}
                          className={`border-border border-r p-0 text-center ${
                            qualified
                              ? "bg-emerald-50 dark:bg-emerald-900/30"
                              : "bg-rose-50/40 dark:bg-rose-950/20"
                          }`}
                          title={qualified ? "Qualified" : "Missing required skill(s)"}
                        >
                          {qualified ? (
                            <span
                              aria-label="Qualified"
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-white dark:bg-emerald-600"
                            >
                              ✓
                            </span>
                          ) : (
                            <span
                              aria-label="Not qualified"
                              className="text-base font-medium text-rose-400/70 dark:text-rose-500/70"
                            >
                              ✕
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="bg-background border-border sticky right-0 border-l px-2 py-1.5 text-right tabular-nums">
                      <span
                        className={
                          total === 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                        }
                      >
                        {total.toString()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-muted-foreground text-[11px]">
        <strong>Single point of failure</strong> = a class only one trainer can teach (amber).{" "}
        <strong>Uncovered</strong> = nobody qualifies (rose). Fix on a class&apos;s{" "}
        <Link href="/classes" className="underline">
          /classes
        </Link>{" "}
        skill requirements, or add a skill cert via{" "}
        <Link href="/instructors" className="underline">
          /instructors
        </Link>
        .
      </p>
    </div>
  );
}

// ── Gaps tab ────────────────────────────────────────────────────────────────

function GapsTab({
  skills,
  classGaps,
  uncoveredSkillIds,
  expiringCerts,
}: {
  skills: Skill[];
  classGaps: ClassGap[];
  uncoveredSkillIds: string[];
  expiringCerts: ExpiringCert[];
}) {
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const uncovered = uncoveredSkillIds.map((id) => skillById.get(id)).filter((s): s is Skill => !!s);

  const buckets = {
    "0-30": expiringCerts.filter((c) => c.days_until <= 30),
    "31-60": expiringCerts.filter((c) => c.days_until > 30 && c.days_until <= 60),
    "61-90": expiringCerts.filter((c) => c.days_until > 60 && c.days_until <= 90),
  };

  return (
    <div className="space-y-6">
      {/* 1. Classes lacking qualified instructors */}
      <section className="border-border bg-background rounded-xl border p-6">
        <Eyebrow className="mb-1.5">Coverage gaps</Eyebrow>
        <h3 className="font-display text-foreground mb-4 text-lg font-medium leading-tight tracking-[-0.005em]">
          Classes without enough qualified instructors.
        </h3>
        {classGaps.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            All classes have at least one qualified instructor for their required skills.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {classGaps.map((g) => (
              <li key={g.class_id} className="flex items-center justify-between py-2.5">
                <Link
                  href={`/classes/${g.class_id}`}
                  className="font-display text-foreground text-base font-medium leading-tight hover:underline"
                >
                  {g.class_name}
                </Link>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-[var(--red)]">
                  <b className="font-medium tabular-nums">{g.qualified_count}</b> qualified ·{" "}
                  <b className="font-medium tabular-nums">{g.required_count}</b> required skill
                  {g.required_count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2. Skills with zero qualified instructors */}
      <section className="border-border bg-background rounded-xl border p-6">
        <Eyebrow className="mb-1.5">Orphan skills</Eyebrow>
        <h3 className="font-display text-foreground mb-4 text-lg font-medium leading-tight tracking-[-0.005em]">
          Skills with no qualified instructors.
        </h3>
        {uncovered.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Every active skill has at least one instructor.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {uncovered.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5">
                <span className="font-display text-foreground text-base font-medium leading-tight">
                  {s.name}
                </span>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-[var(--red)]">
                  0 instructors
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. Expiring certifications */}
      <section className="border-border bg-background rounded-xl border p-6">
        <Eyebrow className="mb-1.5">Expiring soon</Eyebrow>
        <h3 className="font-display text-foreground mb-4 text-lg font-medium leading-tight tracking-[-0.005em]">
          Certifications expiring in 90 days.
        </h3>
        {expiringCerts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No certifications expiring in the next 90 days.
          </p>
        ) : (
          <div className="space-y-5">
            {(["0-30", "31-60", "61-90"] as const).map((bucket) =>
              buckets[bucket].length === 0 ? null : (
                <div key={bucket}>
                  <Eyebrow variant="mute" className="mb-2">
                    {bucket} days
                    <span className="text-muted-foreground ml-1 font-normal normal-case tracking-normal">
                      ({buckets[bucket].length})
                    </span>
                  </Eyebrow>
                  <ul className="divide-border divide-y">
                    {buckets[bucket].map((c) => (
                      <li
                        key={c.instructor_skill_id}
                        className="flex items-center justify-between py-2"
                      >
                        <div className="flex flex-col">
                          <Link
                            href={`/instructors/${c.instructor_id}`}
                            className="font-display text-foreground text-base font-medium leading-tight hover:underline"
                          >
                            {c.instructor_name}
                          </Link>
                          <span className="text-muted-foreground font-mono text-[10.5px] tracking-[0.02em]">
                            {c.skill_name}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "font-mono text-[10.5px] uppercase tracking-[0.04em]",
                            bucket === "0-30" ? "text-[var(--red)]" : "text-muted-foreground",
                          )}
                        >
                          <b className="font-medium tabular-nums">{c.days_until}d</b> ·{" "}
                          <span className="tabular-nums">{c.expires_at}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}
