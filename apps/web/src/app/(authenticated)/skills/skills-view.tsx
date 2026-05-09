"use client";

import { useState, useTransition } from "react";
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
import ConfirmDialog from "@/components/ui/confirm-dialog";
import CsvImportDialog from "@/components/csv-import-dialog";
import { archiveSkill, importSkillsCsv, unarchiveSkill } from "./actions";
import { PROFICIENCY_VALUES } from "@arbor/shared";
import type { Skill, Proficiency } from "@arbor/shared";

type Tab = "library" | "coverage" | "gaps";

const TABS: { id: Tab; label: string }[] = [
  { id: "library", label: "Library" },
  { id: "coverage", label: "Coverage" },
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

type Props = {
  skills: Skill[];
  coverage: CoverageCount[];
  classGaps: ClassGap[];
  uncoveredSkillIds: string[];
  expiringCerts: ExpiringCert[];
};

export default function SkillsView({
  skills,
  coverage,
  classGaps,
  uncoveredSkillIds,
  expiringCerts,
}: Props) {
  const [tab, setTab] = useState<Tab>("library");
  const [showArchived, setShowArchived] = useState(false);

  const visibleSkills = skills.filter((s) => (showArchived ? s.is_archived : !s.is_archived));

  return (
    <div>
      {/* Tabs */}
      <div className="border-border bg-background border-b px-6">
        <nav className="-mb-px flex gap-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
              }}
              className={`border-b-2 pb-3 pt-3 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

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
            <thead className="border-border bg-surface border-b">
              <tr>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Name
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Category
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Type
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
                  Authority
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {skills.map((s) => (
                <tr key={s.id} className="hover:bg-surface">
                  <td className="text-foreground px-4 py-3 text-sm font-medium">{s.name}</td>
                  <td className="text-muted-foreground px-4 py-3 text-xs">{s.category ?? "—"}</td>
                  <td className="px-4 py-3">
                    {s.is_certification ? (
                      <span className="bg-primary/10 text-primary inline-flex rounded-full px-2 py-0.5 text-xs font-medium">
                        Certification
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">Skill</span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-3 text-xs">
                    {s.certifying_authority ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
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
        <thead className="border-border bg-surface border-b">
          <tr>
            <th className="text-muted-foreground px-4 py-2.5 text-left text-xs font-medium">
              Skill
            </th>
            {PROFICIENCY_VALUES.map((p) => (
              <th
                key={p}
                className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium capitalize"
              >
                {p}
              </th>
            ))}
            <th className="text-muted-foreground px-4 py-2.5 text-right text-xs font-medium">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {skills.map((s) => {
            const total = PROFICIENCY_VALUES.reduce((sum, p) => sum + countAt(s.id, p), 0);
            return (
              <tr key={s.id} className="hover:bg-surface">
                <td className="text-foreground px-4 py-3 text-sm font-medium">{s.name}</td>
                {PROFICIENCY_VALUES.map((p) => {
                  const n = countAt(s.id, p);
                  return (
                    <td
                      key={p}
                      className={`px-4 py-3 text-right text-sm ${
                        n === 0 ? "text-muted-foreground" : "text-foreground font-medium"
                      }`}
                    >
                      {n}
                    </td>
                  );
                })}
                <td
                  className={`px-4 py-3 text-right text-sm font-semibold ${
                    total === 0 ? "text-destructive" : "text-foreground"
                  }`}
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
        <h3 className="text-foreground mb-4 text-sm font-semibold">
          Classes without enough qualified instructors
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
                  className="text-foreground text-sm font-medium hover:underline"
                >
                  {g.class_name}
                </Link>
                <span className="text-destructive text-xs font-medium">
                  {g.qualified_count} qualified, {g.required_count} required skill
                  {g.required_count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2. Skills with zero qualified instructors */}
      <section className="border-border bg-background rounded-xl border p-6">
        <h3 className="text-foreground mb-4 text-sm font-semibold">
          Skills with no qualified instructors
        </h3>
        {uncovered.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Every active skill has at least one instructor.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {uncovered.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5">
                <span className="text-foreground text-sm font-medium">{s.name}</span>
                <span className="text-destructive text-xs font-medium">0 instructors</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. Expiring certifications */}
      <section className="border-border bg-background rounded-xl border p-6">
        <h3 className="text-foreground mb-4 text-sm font-semibold">Expiring certifications</h3>
        {expiringCerts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No certifications expiring in the next 90 days.
          </p>
        ) : (
          <div className="space-y-4">
            {(["0-30", "31-60", "61-90"] as const).map((bucket) =>
              buckets[bucket].length === 0 ? null : (
                <div key={bucket}>
                  <p className="text-muted-foreground mb-2 text-xs font-medium">
                    {bucket} days ({buckets[bucket].length})
                  </p>
                  <ul className="divide-border divide-y">
                    {buckets[bucket].map((c) => (
                      <li
                        key={c.instructor_skill_id}
                        className="flex items-center justify-between py-2"
                      >
                        <div className="flex flex-col">
                          <Link
                            href={`/instructors/${c.instructor_id}`}
                            className="text-foreground text-sm font-medium hover:underline"
                          >
                            {c.instructor_name}
                          </Link>
                          <span className="text-muted-foreground text-xs">{c.skill_name}</span>
                        </div>
                        <span
                          className={`text-xs font-medium ${
                            bucket === "0-30" ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {c.days_until}d ({c.expires_at})
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
