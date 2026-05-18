"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  BarsArrowDownIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/20/solid";
import {
  sessionsNeeded,
  type ImplClass,
  type ImplClassPrerequisite,
  type ImplClassTrainer,
  type ImplModule,
  type ImplTrainer,
} from "@arbor/shared";
import type { ClassFeasibility } from "@/lib/training-planner/feasibility";
import {
  addClassPrerequisite,
  createClass,
  deleteClass,
  removeClassPrerequisite,
  reorderImplClasses,
  setClassTrainers,
  setStep,
  updateClass,
} from "../../actions";

type Props = {
  implementationId: string;
  windowStartDate: string | null;
  windowEndDate: string | null;
  classes: ImplClass[];
  modules: ImplModule[];
  trainers: ImplTrainer[];
  classTrainers: ImplClassTrainer[];
  prerequisites: ImplClassPrerequisite[];
  classFeasibility: ClassFeasibility[];
  distinctRoomsUsedTotal: number | null;
  distinctTrainersUsedTotal: number | null;
};

const fieldClass =
  "border-input bg-background text-foreground rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

// Standard FTE basis: 40 trainer hours per week. Used to translate class
// demand-hours into FTE-equivalents and integer trainer/room counts.
const FTE_HOURS_PER_WEEK = 40;

function computeWindowWeeks(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  if (e < s) return 0;
  const days = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
  return Math.max(1, Math.ceil(days / 7));
}

// Fields flushed on Save & continue / Back. Add and delete still
// round-trip immediately; junctions (class_trainers, prerequisites) are
// edited via the drawer and stay immediate-save because they don't have
// a row-level patch shape.
const PATCH_FIELDS = [
  "name",
  "module_id",
  "hours_per_session",
  "expected_learners_per_session",
  "total_people_to_train",
  "required_equipment_tags",
] as const satisfies readonly (keyof ImplClass)[];

export default function ClassesEditor({
  implementationId,
  windowStartDate,
  windowEndDate,
  classes: initialClasses,
  modules,
  trainers,
  classTrainers,
  prerequisites,
  classFeasibility,
  distinctRoomsUsedTotal,
  distinctTrainersUsedTotal,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openClassId, setOpenClassId] = useState<string | null>(null);

  // Local-first state — same pattern as rooms/modules/trainers. Field
  // edits never round-trip until flushDirty fires from Back or Save &
  // continue. Add/delete update local state on server success so the
  // table reflects them without a full refetch.
  const [rows, setRows] = useState<ImplClass[]>(initialClasses);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  function patchLocal(id: string, patch: Partial<ImplClass>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirtyIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

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

  const classMap = useMemo(() => new Map(rows.map((c) => [c.id, c])), [rows]);

  const feasibilityById = useMemo(
    () => new Map(classFeasibility.map((cf) => [cf.classId, cf])),
    [classFeasibility],
  );

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
        sort_order: rows.length,
      });
      if (result.ok) {
        setRows((prev) => [...prev, result.data]);
        setNewName("");
        setNewTotal("0");
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteClass(id, implementationId);
      if (result.ok) {
        if (openClassId === id) setOpenClassId(null);
        setRows((prev) => prev.filter((r) => r.id !== id));
        setDirtyIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        toast.error(result.error.message);
      }
    });
  }

  async function flushDirty(): Promise<boolean> {
    if (dirtyIds.size === 0) return true;
    const dirty = rows.filter((r) => dirtyIds.has(r.id));
    const results = await Promise.all(
      dirty.map((r) => {
        const patch: Partial<ImplClass> = {};
        for (const k of PATCH_FIELDS) {
          (patch as Record<string, unknown>)[k] = r[k];
        }
        return updateClass(r.id, implementationId, patch);
      }),
    );
    const failed = results.filter((res): res is Extract<typeof res, { ok: false }> => !res.ok);
    if (failed.length > 0) {
      const firstMsg = failed[0]?.error.message ?? "Save failed";
      toast.error(
        `${failed.length.toString()} of ${dirty.length.toString()} saves failed: ${firstMsg}`,
      );
      return false;
    }
    setDirtyIds(new Set());
    return true;
  }

  function handleBack() {
    startTransition(async () => {
      const ok = await flushDirty();
      if (!ok) return;
      router.push(`/training-planner/${implementationId}/modules`);
    });
  }

  function handleNext() {
    const hasPeople = rows.some((c) => c.total_people_to_train > 0);
    if (!hasPeople) {
      toast.error("Add at least one class with people to train before continuing.");
      return;
    }
    startTransition(async () => {
      const ok = await flushDirty();
      if (!ok) return;
      await setStep(implementationId, 6);
      router.push(`/training-planner/${implementationId}/calculate`);
    });
  }

  // Alphabetize via a single bulk server action so the round trip count
  // doesn't scale with class count. Flushes pending field edits first.
  function handleSort() {
    const sorted = rows
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const orderings = sorted
      .map((c, i) => ({ id: c.id, sort_order: i, oldOrder: c.sort_order }))
      .filter((x) => x.sort_order !== x.oldOrder)
      .map(({ id, sort_order }) => ({ id, sort_order }));
    if (orderings.length === 0) {
      toast.info("Already in alphabetical order");
      return;
    }
    startTransition(async () => {
      const ok = await flushDirty();
      if (!ok) return;
      const result = await reorderImplClasses(implementationId, orderings);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setRows((prev) => {
        const byId = new Map(prev.map((r) => [r.id, r]));
        return sorted.map((c, i) => {
          const live = byId.get(c.id);
          return live ? { ...live, sort_order: i } : c;
        });
      });
    });
  }

  const windowWeeks = computeWindowWeeks(windowStartDate, windowEndDate);
  const fteDenominator = windowWeeks * FTE_HOURS_PER_WEEK; // 0 when window unset

  const totalSessions = rows.reduce((acc, c) => acc + sessionsNeeded(c), 0);
  const totalHours = rows.reduce((acc, c) => acc + sessionsNeeded(c) * c.hours_per_session, 0);
  // Aggregate FTE / rooms computed from total hours (not summed per-class)
  // so the bottom-line is honest about resource sharing across classes —
  // summing per-class rounding-ups would inflate.
  const totalTrainerFte = fteDenominator > 0 ? totalHours / fteDenominator : null;
  const totalRoomsNeeded =
    fteDenominator > 0
      ? Math.max(totalHours > 0 ? 1 : 0, Math.ceil(totalHours / fteDenominator))
      : null;

  const open = openClassId ? (classMap.get(openClassId) ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Define each class. The wizard auto-calculates{" "}
          <code>sessions_needed = ceil(total_people / expected_per_session)</code>. Click a row to
          edit prerequisites and assigned trainers.
        </p>
        <button
          type="button"
          disabled={pending || rows.length < 2}
          onClick={handleSort}
          title="Reorder classes alphabetically by name"
          className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.04em] disabled:opacity-50"
        >
          <BarsArrowDownIcon className="h-3.5 w-3.5" />
          Sort A–Z
        </button>
      </div>

      {rows.length === 0 ? (
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
                <Th>Hours</Th>
                <Th>Trainer FTE</Th>
                <Th>Rooms</Th>
                <Th>Trainers</Th>
                <Th>Prereqs</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((c) => {
                const sessions = sessionsNeeded(c);
                const hours = sessions * c.hours_per_session;
                const trainerFte = fteDenominator > 0 ? hours / fteDenominator : null;
                const roomsEstimate =
                  fteDenominator > 0
                    ? Math.max(hours > 0 ? 1 : 0, Math.ceil(hours / fteDenominator))
                    : null;
                // Prefer sim-based distinct-rooms when the sim placed at
                // least one session for this class; otherwise show the FTE
                // estimate with an "est." annotation.
                const cf = feasibilityById.get(c.id);
                const simRoomsUsed =
                  cf && cf.distinctRoomsUsed != null && cf.sessionsScheduled > 0
                    ? cf.distinctRoomsUsed
                    : null;
                const roomsToShow = simRoomsUsed ?? roomsEstimate;
                const roomsSource: "sim" | "est" = simRoomsUsed != null ? "sim" : "est";
                const trainerCount = (trainersByClass.get(c.id) ?? []).length;
                const prereqCount = (prereqsByClass.get(c.id) ?? []).length;
                const dirty = dirtyIds.has(c.id);
                return (
                  <tr
                    key={c.id}
                    className={`hover:bg-surface/50 ${dirty ? "bg-[var(--cream,transparent)]" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          key={`${c.id}-name`}
                          defaultValue={c.name}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== c.name) patchLocal(c.id, { name: v });
                          }}
                          aria-label="Class name"
                          className={fieldClass + " min-w-0 flex-1 font-medium"}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setOpenClassId(c.id);
                          }}
                          aria-label="Open class details"
                          title="Edit prerequisites + assigned trainers"
                          className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1"
                        >
                          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={c.module_id ?? ""}
                        onChange={(e) => {
                          patchLocal(c.id, { module_id: e.target.value || null });
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
                        key={`${c.id}-hps`}
                        type="number"
                        step="0.25"
                        min={0.25}
                        defaultValue={c.hours_per_session}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== c.hours_per_session) patchLocal(c.id, { hours_per_session: v });
                        }}
                        className={fieldClass + " w-20 tabular-nums"}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        key={`${c.id}-eps`}
                        type="number"
                        min={1}
                        defaultValue={c.expected_learners_per_session}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== c.expected_learners_per_session) {
                            patchLocal(c.id, { expected_learners_per_session: v });
                          }
                        }}
                        className={fieldClass + " w-20 tabular-nums"}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        key={`${c.id}-tot`}
                        type="number"
                        min={0}
                        defaultValue={c.total_people_to_train}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== c.total_people_to_train) {
                            patchLocal(c.id, { total_people_to_train: v });
                          }
                        }}
                        className={fieldClass + " w-20 tabular-nums"}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        key={`${c.id}-tags`}
                        defaultValue={c.required_equipment_tags.join(", ")}
                        onBlur={(e) => {
                          const next = parseTagList(e.target.value);
                          if (!arraysEqual(next, c.required_equipment_tags)) {
                            patchLocal(c.id, { required_equipment_tags: next });
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
                      {hours.toFixed(1)}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                      {trainerFte == null ? "—" : trainerFte.toFixed(2)}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-xs tabular-nums">
                      {roomsToShow == null ? (
                        "—"
                      ) : (
                        <>
                          {roomsToShow.toString()}
                          {roomsSource === "est" && (
                            <span className="text-muted-foreground/70 ml-1 text-[10px] not-italic">
                              est.
                            </span>
                          )}
                        </>
                      )}
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
          <div className="bg-surface text-muted-foreground border-border space-y-1 border-t px-3 py-2 text-xs">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                Total sessions:{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {totalSessions.toString()}
                </span>
              </span>
              <span>
                Total hours:{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {totalHours.toFixed(1)}
                </span>
              </span>
              <span>
                Total trainer FTE:{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {totalTrainerFte == null ? "—" : totalTrainerFte.toFixed(2)}
                </span>
              </span>
              <span>
                Rooms used (union):{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {distinctRoomsUsedTotal != null
                    ? distinctRoomsUsedTotal.toString()
                    : totalRoomsNeeded == null
                      ? "—"
                      : `${totalRoomsNeeded.toString()} est.`}
                </span>
              </span>
              <span>
                Trainers used (union):{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {distinctTrainersUsedTotal != null ? distinctTrainersUsedTotal.toString() : "—"}
                </span>
              </span>
            </div>
            <p className="text-[11px] italic">
              FTE = total hours ÷ ({FTE_HOURS_PER_WEEK.toString()}h/wk ×{" "}
              {windowWeeks > 0 ? windowWeeks.toString() + " window weeks" : "set window dates"}).
              Rooms/Trainers come from the same simulator the Calculate step uses — actual distinct
              resources the scheduler placed across all classes. Rows show &quot;est.&quot; when the
              simulator couldn&apos;t place that class (e.g. window dates or rooms not yet
              configured).
            </p>
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
          disabled={pending}
          onClick={handleBack}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm disabled:opacity-50"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-center gap-3">
          {dirtyIds.size > 0 && (
            <span className="text-muted-foreground font-mono text-[10.5px] uppercase tracking-[0.04em]">
              {dirtyIds.size.toString()} unsaved
            </span>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={handleNext}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save & continue"}
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && (
        <ClassDrawer
          implementationId={implementationId}
          klass={open}
          allClasses={rows}
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
  assignedTrainerIds: initialAssignedIds,
  prerequisites: initialPrereqs,
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
  const [pending, startTransition] = useTransition();
  const [pickPrereq, setPickPrereq] = useState("");

  // Local-first state for assignments + prereqs. Clicks update state
  // instantly; server saves run in the background. No router.refresh
  // needed because the parent's classMap derives from local rows state
  // and the drawer's own state holds the assignment truth while open.
  const [assignedIds, setAssignedIds] = useState<Set<string>>(() => new Set(initialAssignedIds));
  const [prereqs, setPrereqs] = useState<ImplClassPrerequisite[]>(initialPrereqs);

  // Serialize setClassTrainers calls so rapid checkbox clicks can't
  // arrive at the server out of order. Each click queues behind the
  // previous save with a snapshot of the post-click assignment set.
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  function toggleTrainer(trainerId: string) {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(trainerId)) next.delete(trainerId);
      else next.add(trainerId);
      const snapshot = Array.from(next);
      saveQueue.current = saveQueue.current
        .catch(() => {
          /* never let a previous failure block the next save */
        })
        .then(() => setClassTrainers(klass.id, implementationId, snapshot))
        .then((r) => {
          if (!r.ok) toast.error(r.error.message);
        });
      return next;
    });
  }

  function addPrereq() {
    if (!pickPrereq) return;
    const prereqId = pickPrereq;
    setPickPrereq("");
    startTransition(async () => {
      const result = await addClassPrerequisite(klass.id, implementationId, prereqId);
      if (result.ok) {
        setPrereqs((prev) => [...prev, result.data]);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function removePrereq(rowId: string) {
    setPrereqs((prev) => prev.filter((p) => p.id !== rowId));
    // Fire and forget — the optimistic removal is already shown.
    void removeClassPrerequisite(rowId, implementationId).then((r) => {
      if (!r.ok) toast.error(r.error.message);
    });
  }

  const prereqIds = new Set(prereqs.map((p) => p.prerequisite_id));
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
              Eligible trainers ({assignedIds.size.toString()})
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
                  const checked = assignedIds.has(t.id);
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
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
              Prerequisites ({prereqs.length.toString()})
            </h3>
            {prereqs.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No prerequisites — this class can run any time.
              </p>
            ) : (
              <ul className="border-border divide-border divide-y rounded-md border">
                {prereqs.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-foreground">
                      {classMap.get(p.prerequisite_id)?.name ?? "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        removePrereq(p.id);
                      }}
                      aria-label="Remove prerequisite"
                      className="text-muted-foreground hover:text-destructive"
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
