import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Shape returned to the page client. Two sides of a conflict pair plus
// the shared instructor identity that caused them to clash.
export type ConflictPair = {
  pair_key: string; // stable: `${aId}::${bId}` with a<b
  instructor_id: string;
  instructor_name: string;
  side_a: ConflictSide;
  side_b: ConflictSide;
  overlap_start: string;
  overlap_end: string;
  overlap_hours: number;
};

export type ConflictSide = {
  session_id: string;
  scheduled_start: string;
  scheduled_end: string;
  implementation_id: string;
  implementation_name: string;
  impl_class_id: string;
  class_name: string;
  impl_room_id: string | null;
  room_name: string | null;
  impl_trainer_id: string;
  trainer_name: string;
  learners_count: number | null;
};

// Find every pair of draft impl_sessions across DIFFERENT live impls
// in this org where the two sessions share an underlying instructor
// (via impl_trainers.instructor_id) AND their time intervals overlap.
//
// Scope:
//   - Both sessions must be draft (v1 doesn't touch published).
//   - Both impls live (not deleted / archived / cancelled).
//   - Different impls only — same-impl conflicts are a generator bug
//     and surface separately.
//
// Output is deduplicated per unordered pair: we key on min(id)::max(id)
// so we never emit (A,B) and (B,A) both.
export const fetchCrossImplConflicts = cache(_fetchCrossImplConflicts);

async function _fetchCrossImplConflicts(orgId: string): Promise<ConflictPair[]> {
  const supabase = await createClient();
  // Pull all candidate draft sessions in one shot — RLS scopes to org,
  // status filter and impl-status filter are inline.
  const { data: rows, error } = await supabase
    .from("impl_sessions")
    .select(
      `
        id,
        impl_class_id,
        impl_trainer_id,
        impl_room_id,
        scheduled_start,
        scheduled_end,
        learners_count,
        implementation_id,
        implementations!inner ( id, name, status, deleted_at ),
        impl_classes!inner ( id, name ),
        impl_trainers!inner ( id, name, instructor_id ),
        impl_rooms ( id, name )
      `,
    )
    .eq("org_id", orgId)
    .eq("status", "draft")
    .not("impl_trainer_id", "is", null);

  if (error) return [];

  type Row = {
    id: string;
    impl_class_id: string;
    impl_trainer_id: string;
    impl_room_id: string | null;
    scheduled_start: string;
    scheduled_end: string;
    learners_count: number | null;
    implementation_id: string;
    implementations: { id: string; name: string; status: string; deleted_at: string | null };
    impl_classes: { id: string; name: string };
    impl_trainers: { id: string; name: string; instructor_id: string | null };
    impl_rooms: { id: string; name: string } | null;
  };

  const live = (rows as unknown as Row[]).filter(
    (r) =>
      r.implementations.deleted_at == null &&
      r.implementations.status !== "archived" &&
      r.implementations.status !== "cancelled" &&
      r.impl_trainers.instructor_id != null,
  );

  // Bucket by underlying instructor — that's the cross-impl bridge.
  const byInstructor = new Map<string, Row[]>();
  for (const r of live) {
    const key = r.impl_trainers.instructor_id;
    if (!key) continue;
    const arr = byInstructor.get(key) ?? [];
    arr.push(r);
    byInstructor.set(key, arr);
  }

  // For each instructor with ≥2 sessions across different impls, find
  // overlapping pairs.
  const pairs = new Map<string, ConflictPair>();
  for (const [instructorId, sessions] of byInstructor) {
    if (sessions.length < 2) continue;
    for (let i = 0; i < sessions.length; i++) {
      const a = sessions[i];
      if (!a) continue;
      for (let j = i + 1; j < sessions.length; j++) {
        const b = sessions[j];
        if (!b) continue;
        if (a.implementation_id === b.implementation_id) continue;
        const aStart = new Date(a.scheduled_start).getTime();
        const aEnd = new Date(a.scheduled_end).getTime();
        const bStart = new Date(b.scheduled_start).getTime();
        const bEnd = new Date(b.scheduled_end).getTime();
        // [aStart, aEnd) and [bStart, bEnd) overlap iff aStart < bEnd
        // && bStart < aEnd.
        if (aStart >= bEnd || bStart >= aEnd) continue;
        const overlapStart = Math.max(aStart, bStart);
        const overlapEnd = Math.min(aEnd, bEnd);
        // Canonical pair key (smaller id first) so each pair appears once.
        const [first, second] = [a, b].sort((x, y) => x.id.localeCompare(y.id));
        if (!first || !second) continue;
        const key = `${first.id}::${second.id}`;
        if (pairs.has(key)) continue;
        pairs.set(key, {
          pair_key: key,
          instructor_id: instructorId,
          instructor_name: first.impl_trainers.name,
          side_a: rowToSide(first),
          side_b: rowToSide(second),
          overlap_start: new Date(overlapStart).toISOString(),
          overlap_end: new Date(overlapEnd).toISOString(),
          overlap_hours: (overlapEnd - overlapStart) / 3600_000,
        });
      }
    }
  }

  // Earliest overlap first so the planner works in chronological order.
  return [...pairs.values()].sort((x, y) => x.overlap_start.localeCompare(y.overlap_start));

  function rowToSide(r: Row): ConflictSide {
    return {
      session_id: r.id,
      scheduled_start: r.scheduled_start,
      scheduled_end: r.scheduled_end,
      implementation_id: r.implementation_id,
      implementation_name: r.implementations.name,
      impl_class_id: r.impl_class_id,
      class_name: r.impl_classes.name,
      impl_room_id: r.impl_room_id,
      room_name: r.impl_rooms?.name ?? null,
      impl_trainer_id: r.impl_trainer_id,
      trainer_name: r.impl_trainers.name,
      learners_count: r.learners_count,
    };
  }
}

// Convenience wrapper used by the sidebar badge — shares the same React.cache
// instance so the layout's count fetch dedupes with whatever the page hits.
export async function fetchCrossImplConflictCount(orgId: string): Promise<number> {
  const pairs = await fetchCrossImplConflicts(orgId);
  return pairs.length;
}

// Same data, narrowed to pairs that involve a specific implementation. Used by
// the Calculate page's banner so the planner sees "this impl has conflicts"
// before opening the resolver.
export async function fetchCrossImplConflictsForImpl(
  orgId: string,
  implementationId: string,
): Promise<ConflictPair[]> {
  const pairs = await fetchCrossImplConflicts(orgId);
  return pairs.filter(
    (p) =>
      p.side_a.implementation_id === implementationId ||
      p.side_b.implementation_id === implementationId,
  );
}
