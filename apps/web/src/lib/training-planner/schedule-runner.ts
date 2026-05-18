// Orchestrator that runs the CSP solver against the live database.
//
// Pulls everything the solver needs in one batch of queries, builds the
// SolverInput, runs solve(), and (when not a dry-run, and when not an
// anchor-with-gaps abort) replaces the impl's draft sessions with the
// solver's placements. Returns the same ScheduleGenResult shape the old
// pl/pgSQL RPC produced so the UI doesn't have to change.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImplClassPrerequisite } from "@arbor/shared";
import type { Database } from "@/lib/supabase/database.types";
import {
  solve,
  type BusyInterval,
  type ClassDiagnosis,
  type ClassTrainerLink,
  type HeadlineFix,
  type Placement,
  type SolverInput,
} from "./schedule-solver";

type DB = SupabaseClient<Database>;

export type ScheduleRunResult = {
  sessions: number;
  conflicts: number;
  capacity_gaps: {
    class_id: string;
    class_name: string;
    session_index: number;
    reason: string;
  }[];
  /** Per-class failure breakdown for the unplaced sessions. Empty when
   *  capacity_gaps is empty. Sorted by sessions-unplaced descending. */
  diagnoses: ClassDiagnosis[];
  /** Single highest-impact fix to surface as a headline. Null when no gaps. */
  headline_fix: HeadlineFix | null;
  recommendations?: {
    trainer_hours_per_week_to_add?: number;
    trainers_to_add?: number;
    weeks_to_extend?: number;
  };
  anchor_impls?: { id: string; name: string }[];
  aborted?: boolean;
};

export async function runSchedule(
  supabase: DB,
  orgId: string,
  departmentId: string,
  implementationId: string,
  anchorImpls: string[],
  options: { dryRun: boolean },
): Promise<
  { ok: true; data: ScheduleRunResult } | { ok: false; error: { code: string; message: string } }
> {
  // 1. Load the impl itself + the org's tz.
  const { data: impl, error: implErr } = await supabase
    .from("implementations")
    .select("*, organizations!inner(time_zone)")
    .eq("id", implementationId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (implErr) return { ok: false, error: { code: implErr.code, message: implErr.message } };
  if (!impl)
    return { ok: false, error: { code: "NOT_FOUND", message: "Implementation not found" } };
  if (!impl.window_start_date || !impl.window_end_date) {
    return {
      ok: false,
      error: { code: "NO_WINDOW", message: "Implementation window dates are required" },
    };
  }
  const orgTz =
    (impl.organizations as unknown as { time_zone: string | null } | null)?.time_zone ??
    "America/New_York";

  // Cutoff: min(window_end, go_live - buffer_days). If that runs before
  // window_start, push it back by a day so the date range is just empty
  // (mirrors the SQL).
  const cutoffDate = computeCutoff(
    impl.window_start_date,
    impl.window_end_date,
    impl.go_live_date,
    impl.go_live_buffer_days,
  );

  // 2. Load resources in parallel.
  const [
    { data: rooms, error: roomsErr },
    { data: trainers, error: trainersErr },
    { data: classes, error: classesErr },
    { data: classTrainers, error: ctErr },
    { data: prerequisites, error: prereqErr },
    { data: pto, error: ptoErr },
    { data: publishedSelf, error: pubSelfErr },
  ] = await Promise.all([
    supabase
      .from("impl_rooms")
      .select("*")
      .eq("implementation_id", implementationId)
      .eq("org_id", orgId)
      .order("sort_order"),
    supabase
      .from("impl_trainers")
      .select("*")
      .eq("implementation_id", implementationId)
      .eq("org_id", orgId)
      .order("sort_order"),
    supabase
      .from("impl_classes")
      .select("*")
      .eq("implementation_id", implementationId)
      .eq("org_id", orgId)
      .order("sort_order"),
    supabase
      .from("impl_class_trainers")
      .select("impl_class_id, impl_trainer_id")
      .eq("org_id", orgId),
    supabase.from("impl_class_prerequisites").select("*").eq("org_id", orgId),
    supabase
      .from("impl_trainer_unavailability")
      .select("impl_trainer_id, starts_at, ends_at")
      .eq("org_id", orgId),
    supabase
      .from("impl_sessions")
      .select("impl_trainer_id, impl_room_id, scheduled_start, scheduled_end")
      .eq("implementation_id", implementationId)
      .eq("org_id", orgId)
      .eq("status", "published"),
  ]);

  for (const e of [roomsErr, trainersErr, classesErr, ctErr, prereqErr, ptoErr, pubSelfErr]) {
    if (e) return { ok: false, error: { code: e.code, message: e.message } };
  }

  // Normalize: Supabase types data as `T[] | null` even when select() is
  // collection-shaped. The errors above guarantee data is non-null, but
  // tsc doesn't see the flow analysis, so coalesce explicitly.
  const roomList = rooms ?? [];
  const trainerList = trainers ?? [];
  const classList = classes ?? [];
  const classTrainerList = classTrainers ?? [];
  const prereqList = prerequisites ?? [];
  const ptoList = pto ?? [];
  const publishedSelfList = publishedSelf ?? [];

  // 3. Build busy intervals + initial weekly hours.
  const busyTrainers: BusyInterval[] = [];
  const busyRooms: BusyInterval[] = [];
  const initialTrainerWeekHours: Record<string, number> = {};

  // Same-impl published sessions: take seats on both trainer and room
  // and burn weekly hours for the trainer.
  const ourTrainerIds = new Set(trainerList.map((t) => t.id));
  for (const s of publishedSelfList) {
    if (s.impl_trainer_id) {
      busyTrainers.push({
        resourceId: s.impl_trainer_id,
        start: s.scheduled_start,
        end: s.scheduled_end,
      });
      if (ourTrainerIds.has(s.impl_trainer_id)) {
        const wk = isoWeekKey(new Date(s.scheduled_start));
        const hrs =
          (new Date(s.scheduled_end).getTime() - new Date(s.scheduled_start).getTime()) / 3_600_000;
        const k = `${s.impl_trainer_id}::${wk}`;
        initialTrainerWeekHours[k] = (initialTrainerWeekHours[k] ?? 0) + hrs;
      }
    }
    if (s.impl_room_id) {
      busyRooms.push({
        resourceId: s.impl_room_id,
        start: s.scheduled_start,
        end: s.scheduled_end,
      });
    }
  }

  // PTO: only our trainers'.
  for (const u of ptoList) {
    if (!ourTrainerIds.has(u.impl_trainer_id)) continue;
    busyTrainers.push({
      resourceId: u.impl_trainer_id,
      start: u.starts_at,
      end: u.ends_at,
    });
  }

  // Cross-impl busy: for each of our trainers with an instructor_id,
  // pull every published session in other live impls where the OTHER
  // impl's trainer shares that instructor_id. Plus anchor-mode draft
  // sessions in the explicitly anchored impls.
  const ourInstructorIds = new Set<string>();
  const trainerByInstructorId = new Map<string, string>();
  for (const t of trainerList) {
    if (t.instructor_id) {
      ourInstructorIds.add(t.instructor_id);
      trainerByInstructorId.set(t.instructor_id, t.id);
    }
  }

  let anchorImplNames: { id: string; name: string }[] = [];
  if (ourInstructorIds.size > 0) {
    // Cross-impl always-on: PUBLISHED sessions in other live impls.
    const { data: crossPub, error: crossErr } = await supabase
      .from("impl_sessions")
      .select(
        "scheduled_start, scheduled_end, implementation_id, impl_trainers!inner(instructor_id), implementations!inner(org_id, deleted_at, status)",
      )
      .neq("implementation_id", implementationId)
      .eq("status", "published")
      .in("impl_trainers.instructor_id", Array.from(ourInstructorIds));
    if (crossErr) return { ok: false, error: { code: crossErr.code, message: crossErr.message } };

    for (const s of crossPub as unknown as {
      scheduled_start: string;
      scheduled_end: string;
      impl_trainers: { instructor_id: string | null };
      implementations: { org_id: string; deleted_at: string | null; status: string };
    }[]) {
      if (s.implementations.org_id !== orgId) continue;
      if (s.implementations.deleted_at) continue;
      if (["cancelled", "archived"].includes(s.implementations.status)) continue;
      const instructorId = s.impl_trainers.instructor_id;
      if (!instructorId) continue;
      const myTrainerId = trainerByInstructorId.get(instructorId);
      if (!myTrainerId) continue;
      busyTrainers.push({
        resourceId: myTrainerId,
        start: s.scheduled_start,
        end: s.scheduled_end,
      });
    }

    // Anchor pre-seed: DRAFT + PUBLISHED sessions in explicitly anchored impls.
    if (anchorImpls.length > 0) {
      const { data: anchorSessions, error: anchorErr } = await supabase
        .from("impl_sessions")
        .select(
          "scheduled_start, scheduled_end, implementation_id, impl_trainers!inner(instructor_id), implementations!inner(org_id, deleted_at, name)",
        )
        .in("implementation_id", anchorImpls)
        .neq("implementation_id", implementationId)
        .in("status", ["draft", "published"])
        .in("impl_trainers.instructor_id", Array.from(ourInstructorIds));
      if (anchorErr)
        return { ok: false, error: { code: anchorErr.code, message: anchorErr.message } };
      for (const s of anchorSessions as unknown as {
        scheduled_start: string;
        scheduled_end: string;
        impl_trainers: { instructor_id: string | null };
        implementations: { org_id: string; deleted_at: string | null; name: string };
      }[]) {
        if (s.implementations.org_id !== orgId) continue;
        if (s.implementations.deleted_at) continue;
        const instructorId = s.impl_trainers.instructor_id;
        if (!instructorId) continue;
        const myTrainerId = trainerByInstructorId.get(instructorId);
        if (!myTrainerId) continue;
        busyTrainers.push({
          resourceId: myTrainerId,
          start: s.scheduled_start,
          end: s.scheduled_end,
        });
      }

      // Collect anchor impl names for the result, sorted.
      const { data: anchorNameRows } = await supabase
        .from("implementations")
        .select("id, name")
        .in("id", anchorImpls)
        .eq("org_id", orgId);
      anchorImplNames = ((anchorNameRows ?? []) as { id: string; name: string }[])
        .filter((a) => a.id !== implementationId)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  // 4. Run the solver.
  const solverInput: SolverInput = {
    windowStartDate: impl.window_start_date,
    windowEndDate: impl.window_end_date,
    cutoffDate,
    orgTimeZone: orgTz,
    lunchBreakStartMinutes: impl.lunch_break_start_minutes,
    lunchBreakLengthMinutes: impl.lunch_break_length_minutes,
    businessHoursStartLocal: impl.business_hours_start_local,
    businessHoursEndLocal: impl.business_hours_end_local,
    rooms: roomList,
    trainers: trainerList,
    classes: classList,
    classTrainers: (classTrainerList as ClassTrainerLink[]).filter((ct) =>
      classList.some((c) => c.id === ct.impl_class_id),
    ),
    prerequisites: (prereqList as ImplClassPrerequisite[]).filter((p) =>
      classList.some((c) => c.id === p.impl_class_id),
    ),
    busyTrainers,
    busyRooms,
    initialTrainerWeekHours,
    anchoredImplNames: anchorImplNames.map((a) => a.name),
  };

  const solverResult = solve(solverInput);

  // 5. Recommendations math (matches the old SQL deficit formula).
  const windowWeeks = Math.max(
    1,
    Math.ceil(
      (parseUtcDate(impl.window_end_date).getTime() -
        parseUtcDate(impl.window_start_date).getTime()) /
        (7 * 86_400_000) +
        1 / 7,
    ),
  );
  const totalTrainerHoursNeeded = classList.reduce((acc, c) => {
    const sessions = Math.ceil(
      c.total_people_to_train / Math.max(c.expected_learners_per_session, 1),
    );
    return acc + sessions * c.hours_per_session;
  }, 0);
  const totalTrainerHoursAvailable = trainerList.reduce(
    (acc, t) => acc + t.availability_hours_per_week * windowWeeks,
    0,
  );
  const trainerCount = trainerList.length;
  const avgHpw =
    trainerCount === 0
      ? 30
      : trainerList.reduce((acc, t) => acc + t.availability_hours_per_week, 0) / trainerCount;
  const deficit = totalTrainerHoursNeeded - totalTrainerHoursAvailable;

  let recommendations: ScheduleRunResult["recommendations"] | undefined;
  if (solverResult.gaps.length > 0 && deficit > 0 && avgHpw > 0) {
    recommendations = {
      trainer_hours_per_week_to_add: Math.ceil(deficit / windowWeeks),
      trainers_to_add: Math.ceil(deficit / windowWeeks / avgHpw),
      weeks_to_extend: Math.ceil(deficit / Math.max(totalTrainerHoursAvailable / windowWeeks, 1)),
    };
  }

  // 6. Decide whether to commit.
  const anchorMode = anchorImpls.length > 0;
  const aborted = anchorMode && solverResult.gaps.length > 0;
  const shouldCommit = !options.dryRun && !aborted;

  if (shouldCommit) {
    const writeResult = await writePlacements(
      supabase,
      orgId,
      departmentId,
      implementationId,
      solverResult.placements,
    );
    if (!writeResult.ok) return writeResult;
  }

  const data: ScheduleRunResult = {
    sessions: aborted ? 0 : solverResult.placements.length,
    conflicts: solverResult.gaps.length,
    capacity_gaps: solverResult.gaps.map((g) => ({
      class_id: g.classId,
      class_name: g.className,
      session_index: g.sessionIndex,
      reason: g.reason,
    })),
    diagnoses: solverResult.diagnoses,
    headline_fix: solverResult.headlineFix,
    anchor_impls: anchorImplNames,
    aborted,
  };
  if (recommendations) data.recommendations = recommendations;
  return { ok: true, data };
}

async function writePlacements(
  supabase: DB,
  orgId: string,
  departmentId: string,
  implementationId: string,
  placements: Placement[],
): Promise<{ ok: true } | { ok: false; error: { code: string; message: string } }> {
  // Replace existing drafts. Published sessions stay put.
  const { error: delErr } = await supabase
    .from("impl_sessions")
    .delete()
    .eq("implementation_id", implementationId)
    .eq("org_id", orgId)
    .eq("status", "draft");
  if (delErr) return { ok: false, error: { code: delErr.code, message: delErr.message } };

  if (placements.length === 0) return { ok: true };

  const rows = placements.map((p) => ({
    org_id: orgId,
    department_id: departmentId,
    implementation_id: implementationId,
    impl_class_id: p.classId,
    impl_trainer_id: p.trainerId,
    impl_room_id: p.roomId,
    scheduled_start: p.start,
    scheduled_end: p.end,
    learners_count: p.learnersCount,
    status: "draft" as const,
  }));
  const { error: insErr } = await supabase.from("impl_sessions").insert(rows);
  if (insErr) return { ok: false, error: { code: insErr.code, message: insErr.message } };
  return { ok: true };
}

function computeCutoff(
  windowStart: string,
  windowEnd: string,
  goLive: string | null,
  bufferDays: number,
): string {
  if (!goLive) return windowEnd;
  const goLiveDate = parseUtcDate(goLive);
  goLiveDate.setUTCDate(goLiveDate.getUTCDate() - bufferDays);
  const earlier = goLiveDate < parseUtcDate(windowEnd) ? goLiveDate : parseUtcDate(windowEnd);
  if (earlier < parseUtcDate(windowStart)) {
    // Empty range — pull a day before the window start so daysInRange
    // yields nothing.
    const before = parseUtcDate(windowStart);
    before.setUTCDate(before.getUTCDate() - 1);
    return fmtUtcDate(before);
  }
  return fmtUtcDate(earlier);
}

function parseUtcDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

function fmtUtcDate(d: Date): string {
  const y = d.getUTCFullYear().toString();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoWeekKey(d: Date): string {
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (dow - 1));
  const target = new Date(
    Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()),
  );
  const dayNum = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear().toString()}-W${week.toString().padStart(2, "0")}`;
}
