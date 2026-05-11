"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, TrashIcon } from "@heroicons/react/20/solid";
import {
  sessionsNeeded,
  type ImplClass,
  type ImplClassPrerequisite,
  type ImplClassTrainer,
  type ImplModule,
  type ImplTrainer,
} from "@arbor/shared";
import {
  addClassPrerequisite,
  createClass,
  deleteClass,
  removeClassPrerequisite,
  setClassTrainers,
  setStep,
  updateClass,
} from "../../actions";

type Props = {
  implementationId: string;
  classes: ImplClass[];
  modules: ImplModule[];
  trainers: ImplTrainer[];
  classTrainers: ImplClassTrainer[];
  prerequisites: ImplClassPrerequisite[];
};

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function ClassesEditor({
  implementationId,
  classes,
  modules,
  trainers,
  classTrainers,
  prerequisites,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openClassId, setOpenClassId] = useState<string | null>(null);

  const trainersByClass = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const ct of classTrainers) {
      const list = m.get(ct.impl_class_id) ?? [];
      list.push(ct.impl_trainer_id);
      m.set(ct.impl_class_id, list);
    }
    return m;
  }, [classTrainers]);

  const prereqsByClass = useMemo(() => {
    const m = new Map<string, ImplClassPrerequisite[]>();
    for (const p of prerequisites) {
      const list = m.get(p.impl_class_id) ?? [];
      list.push(p);
      m.set(p.impl_class_id, list);
    }
    return m;
  }, [prerequisites]);

  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const [newName, setNewName] = useState("");
  const [newModuleId, setNewModuleId] = useState("");
  const [newHours, setNewHours] = useState("2");
  const [newPerSession, setNewPerSession] = useState("12");
  const [newTotal, setNewTotal] = useState("0");

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createClass(implementationId, {
        name,
        module_id: newModuleId || null,
        hours_per_session: Number(newHours),
        expected_learners_per_session: Number(newPerSession),
        total_people_to_train: Number(newTotal),
        sort_order: classes.length,
      });
      if (result.ok) {
        setNewName("");
        setNewTotal("0");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleUpdate(c: ImplClass, patch: Record<string, unknown>) {
    startTransition(async () => {
      const result = await updateClass(c.id, implementationId, patch);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteClass(id, implementationId);
      if (result.ok) {
        if (openClassId === id) setOpenClassId(null);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleNext() {
    const hasPeople = classes.some((c) => c.total_people_to_train > 0);
    if (!hasPeople) {
      toast.error("Add at least one class with people to train before continuing.");
      return;
    }
    startTransition(async () => {
      await setStep(implementationId, 6);
      router.push(`/training-planner/${implementationId}/calculate`);
    });
  }

  const totalSessions = classes.reduce((acc, c) => acc + sessionsNeeded(c), 0);
  const totalHours = classes.reduce((acc, c) => acc + sessionsNeeded(c) * c.hours_per_session, 0);

  const open = openClassId ? (classMap.get(openClassId) ?? null) : null;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-xs">
        Define each class. The wizard auto-calculates{" "}
        <code>sessions_needed = ceil(total_people / expected_per_session)</code>. Click a row to
        edit prerequisites and assigned trainers.
      </p>

      {classes.length === 0 ? (
        <div className="border-border bg-surface rounded-lg border border-dashed p-8 text-center">
          <p className="text-foreground text-sm font-medium">No classes yet</p>
          <p className="text-muted-foreground mt-1 text-xs">Most implementations have 5–20.</p>
        </div>
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-muted-foreground text-xs">
              <tr>
                <Th className="w-1/5">Name</Th>
                <Th>Module</Th>
                <Th>Hrs/session</Th>
                <Th>Per session</Th>
                <Th>Total people</Th>
                <Th>Equipment</Th>
                <Th>Sessions</Th>
                <Th>Trainers</Th>
                <Th>Prereqs</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {classes.map((c) => {
                const sessions = sessionsNeeded(c);
                const trainerCount = (trainersByClass.get(c.id) ?? []).length;
                const prereqCount = (prereqsByClass.get(c.id) ?? []).length;
                return (
                  <tr key={c.id} className="hover:bg-surface/50">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenClassId(c.id);
                        }}
                        className="text-primary text-left font-medium hover:underline"
                      >
                        {c.name}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={c.module_id ?? ""}
                        disabled={pending}
                        onChange={(e) => {
                          handleUpdate(c, { module_id: e.target.value || null });
                        }}
                        className={fieldClass + " w-full"}
                      >
                        <option value="">— None —</option>
                        {modules.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.25"
                        min={0.25}
                        defaultValue={c.hours_per_session}
                        disabled={pending}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== c.hours_per_session) handleUpdate(c, { hours_per_session: v });
                        }}
                        className={fieldClass + " w-20 tabular-nums"}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        defaultValue={c.expected_learners_per_session}
                        disabled={pending}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== c.expected_learners_per_session) {
                            handleUpdate(c, { expected_learners_per_session: v });
                          }
                        }}
                        className={fieldClass + " w-20 tabular-nums"}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        defaultValue={c.total_people_to_train}
                        disabled={pending}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== c.total_people_to_train) {
                            handleUpdate(c, { total_people_to_train: v });
                          }
                        }}
                        className={fieldClass + " w-20 tabular-nums"}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        defaultValue={c.required_equipment_tags.join(", ")}
                        disabled={pending}
                        onBlur={(e) => {
                          const next = parseTagList(e.target.value);
                          if (!arraysEqual(next, c.required_equipment_tags)) {
                            handleUpdate(c, { required_equipment_tags: next });
                          }
                        }}
                        placeholder="e.g. iv-pump"
                        aria-label="Required equipment tags (comma-separated)"
                        className={fieldClass + " w-32"}
                      />
                    </td>
                    <td className="text-foreground px-3 py-2 text-xs font-medium tabular-nums">
                      {sessions.toString()}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                      {trainerCount.toString()}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                      {prereqCount.toString()}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          handleDelete(c.id);
                        }}
                        aria-label="Delete class"
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="bg-surface text-muted-foreground border-border border-t px-3 py-2 text-xs">
            Total sessions needed:{" "}
            <span className="text-foreground font-medium">{totalSessions.toString()}</span> · Total
            trainer hours required:{" "}
            <span className="text-foreground font-medium">{totalHours.toFixed(1)}h</span>
          </div>
        </div>
      )}

      {/* Add row */}
      <div className="border-border bg-background grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-12">
        <div className="md:col-span-3">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Class name</p>
          <input
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
            }}
            className={fieldClass + " w-full"}
          />
        </div>
        <div className="md:col-span-3">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Module</p>
          <select
            value={newModuleId}
            onChange={(e) => {
              setNewModuleId(e.target.value);
            }}
            className={fieldClass + " w-full"}
          >
            <option value="">— None —</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Hrs/session</p>
          <input
            type="number"
            step="0.25"
            min={0.25}
            value={newHours}
            onChange={(e) => {
              setNewHours(e.target.value);
            }}
            className={fieldClass + " w-full tabular-nums"}
          />
        </div>
        <div className="md:col-span-1">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Per session</p>
          <input
            type="number"
            min={1}
            value={newPerSession}
            onChange={(e) => {
              setNewPerSession(e.target.value);
            }}
            className={fieldClass + " w-full tabular-nums"}
          />
        </div>
        <div className="md:col-span-2">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Total people</p>
          <input
            type="number"
            min={0}
            value={newTotal}
            onChange={(e) => {
              setNewTotal(e.target.value);
            }}
            className={fieldClass + " w-full tabular-nums"}
          />
        </div>
        <div className="flex items-end md:col-span-1">
          <button
            type="button"
            disabled={pending || !newName.trim()}
            onClick={handleAdd}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex w-full items-center justify-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      <div className="border-border flex items-center justify-between border-t pt-4">
        <button
          type="button"
          onClick={() => {
            router.push(`/training-planner/${implementationId}/modules`);
          }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleNext}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          Save & continue
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <ClassDrawer
          implementationId={implementationId}
          klass={open}
          allClasses={classes}
          trainers={trainers}
          assignedTrainerIds={trainersByClass.get(open.id) ?? []}
          prerequisites={prereqsByClass.get(open.id) ?? []}
          classMap={classMap}
          onClose={() => {
            setOpenClassId(null);
          }}
        />
      )}
    </div>
  );
}

function parseTagList(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0),
    ),
  );
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
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

// ── Class drawer (trainers + prerequisites) ─────────────────────────────────

function ClassDrawer({
  implementationId,
  klass,
  allClasses,
  trainers,
  assignedTrainerIds,
  prerequisites,
  classMap,
  onClose,
}: {
  implementationId: string;
  klass: ImplClass;
  allClasses: ImplClass[];
  trainers: ImplTrainer[];
  assignedTrainerIds: string[];
  prerequisites: ImplClassPrerequisite[];
  classMap: Map<string, ImplClass>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pickPrereq, setPickPrereq] = useState("");

  function toggleTrainer(trainerId: string) {
    const next = new Set(assignedTrainerIds);
    if (next.has(trainerId)) next.delete(trainerId);
    else next.add(trainerId);
    startTransition(async () => {
      const result = await setClassTrainers(klass.id, implementationId, Array.from(next));
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  function addPrereq() {
    if (!pickPrereq) return;
    startTransition(async () => {
      const result = await addClassPrerequisite(klass.id, implementationId, pickPrereq);
      if (result.ok) {
        setPickPrereq("");
        router.refresh();
      } else if (result.error.code === "CYCLE") {
        toast.error(result.error.message);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function removePrereq(rowId: string) {
    startTransition(async () => {
      const result = await removeClassPrerequisite(rowId, implementationId);
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });
  }

  const prereqIds = new Set(prerequisites.map((p) => p.prerequisite_id));
  const candidatePrereqs = allClasses.filter((c) => c.id !== klass.id && !prereqIds.has(c.id));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="border-border bg-background flex w-full max-w-xl flex-col border-l shadow-xl"
        onClick={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
      >
        <div className="border-border flex items-start justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-foreground text-base font-semibold">{klass.name}</h2>
            <p className="text-muted-foreground text-xs">
              {klass.hours_per_session.toString()}h/session ·{" "}
              {klass.expected_learners_per_session.toString()} per session ·{" "}
              {klass.total_people_to_train.toString()} total
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
          {/* Trainers */}
          <section>
            <h3 className="text-foreground mb-2 text-sm font-semibold">
              Eligible trainers ({assignedTrainerIds.length.toString()})
            </h3>
            <p className="text-muted-foreground mb-2 text-xs">
              Multiple eligible trainers gives the scheduler more flexibility.
            </p>
            {trainers.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No trainers added — go back to Step 3 first.
              </p>
            ) : (
              <ul className="border-border divide-border divide-y rounded-md border">
                {trainers.map((t) => {
                  const checked = assignedTrainerIds.includes(t.id);
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={pending}
                        onChange={() => {
                          toggleTrainer(t.id);
                        }}
                      />
                      <span className="text-foreground flex-1">{t.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {t.availability_hours_per_week.toString()}h/wk
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Prerequisites */}
          <section>
            <h3 className="text-foreground mb-2 text-sm font-semibold">
              Prerequisites ({prerequisites.length.toString()})
            </h3>
            {prerequisites.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No prerequisites — this class can run any time.
              </p>
            ) : (
              <ul className="border-border divide-border divide-y rounded-md border">
                {prerequisites.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-foreground">
                      {classMap.get(p.prerequisite_id)?.name ?? "—"}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        removePrereq(p.id);
                      }}
                      aria-label="Remove prerequisite"
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {candidatePrereqs.length > 0 && (
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <p className="text-muted-foreground mb-1 text-xs font-medium">Add prerequisite</p>
                  <select
                    value={pickPrereq}
                    onChange={(e) => {
                      setPickPrereq(e.target.value);
                    }}
                    className={fieldClass + " w-full"}
                  >
                    <option value="">Select class…</option>
                    {candidatePrereqs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={pending || !pickPrereq}
                  onClick={addPrereq}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
