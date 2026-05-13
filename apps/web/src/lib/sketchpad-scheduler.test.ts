import { describe, it, expect } from "vitest";
import { placeSessions, type SchedulerInput } from "./sketchpad-scheduler";

function defined<T>(v: T | undefined, msg = "expected value to be defined"): T {
  if (v === undefined) throw new Error(msg);
  return v;
}

function buildInput(overrides: Partial<SchedulerInput> = {}): SchedulerInput {
  const base: SchedulerInput = {
    schedule: {
      startDate: "2026-06-01",
      dayCount: 5,
      hoursStart: 9,
      hoursEnd: 17,
      slotMinutes: 30,
    },
    rooms: [
      { id: "r-small", name: "Sim Lab A", capacity: 8 },
      { id: "r-big", name: "Sim Lab B", capacity: 20 },
    ],
    existing: [],
    request: {
      className: "EMR Provider",
      trainerName: "Smith",
      durationMinutes: 120,
      count: 1,
      learnerCount: null,
      preferredRoomId: null,
      preferredStartMinutes: null,
      distribution: "one-per-day",
    },
  };
  return { ...base, ...overrides };
}

describe("placeSessions — basic placement", () => {
  it("places a single session at the start of the day window", () => {
    const result = placeSessions(buildInput());
    expect(result.placed).toHaveLength(1);
    expect(result.unplaced).toHaveLength(0);
    const p = defined(result.placed[0]);
    expect(p.trainerName).toBe("Smith");
    expect(p.className).toBe("EMR Provider");
    const start = new Date(p.startsAt);
    expect(start.getHours()).toBe(9);
    expect(start.getMinutes()).toBe(0);
  });

  it("distributes 3 sessions across 3 distinct days when one-per-day", () => {
    const result = placeSessions(
      buildInput({
        request: {
          className: "X",
          trainerName: "Smith",
          durationMinutes: 60,
          count: 3,
          learnerCount: null,
          preferredRoomId: null,
          preferredStartMinutes: null,
          distribution: "one-per-day",
        },
      }),
    );
    expect(result.placed).toHaveLength(3);
    const days = result.placed.map((p) => new Date(p.startsAt).getDate());
    expect(new Set(days).size).toBe(3);
  });

  it("returns unplaced reasons when window is too small", () => {
    const result = placeSessions(
      buildInput({
        schedule: {
          startDate: "2026-06-01",
          dayCount: 1,
          hoursStart: 9,
          hoursEnd: 10,
          slotMinutes: 30,
        },
        request: {
          className: "X",
          trainerName: "Smith",
          durationMinutes: 120,
          count: 2,
          learnerCount: null,
          preferredRoomId: null,
          preferredStartMinutes: null,
          distribution: "one-per-day",
        },
      }),
    );
    expect(result.placed).toHaveLength(0);
    expect(result.unplaced).toHaveLength(2);
    expect(result.gaps.length).toBeGreaterThan(0);
  });
});

describe("placeSessions — conflicts", () => {
  it("skips a slot when the trainer is already busy", () => {
    const result = placeSessions(
      buildInput({
        existing: [
          {
            id: "e1",
            starts_at: new Date(2026, 5, 1, 9, 0).toISOString(),
            ends_at: new Date(2026, 5, 1, 11, 0).toISOString(),
            room_id: "r-small",
            trainer_name: "Smith",
          },
        ],
        request: {
          className: "X",
          trainerName: "Smith",
          durationMinutes: 60,
          count: 1,
          learnerCount: null,
          preferredRoomId: null,
          preferredStartMinutes: null,
          distribution: "one-per-day",
        },
      }),
    );
    expect(result.placed).toHaveLength(1);
    const start = new Date(defined(result.placed[0]).startsAt);
    // Must not overlap [9:00, 11:00) on day 0 — earliest valid is 11:00 same
    // day or 9:00 next day. Either is acceptable; just assert no overlap.
    const hourMs = 3600_000;
    const e1Start = new Date(2026, 5, 1, 9, 0).getTime();
    const e1End = new Date(2026, 5, 1, 11, 0).getTime();
    const pStart = start.getTime();
    const pEnd = pStart + 60 * 60 * 1000;
    const overlap = pStart < e1End && e1Start < pEnd;
    expect(overlap).toBe(false);
    expect(hourMs).toBeGreaterThan(0);
  });

  it("picks the other room when the first is occupied", () => {
    const result = placeSessions(
      buildInput({
        existing: [
          {
            id: "e1",
            starts_at: new Date(2026, 5, 1, 9, 0).toISOString(),
            ends_at: new Date(2026, 5, 1, 11, 0).toISOString(),
            room_id: "r-small", // best-fit room (smallest capacity)
            trainer_name: "Park",
          },
        ],
        request: {
          className: "X",
          trainerName: "Smith",
          durationMinutes: 60,
          count: 1,
          learnerCount: null,
          preferredRoomId: null,
          preferredStartMinutes: null,
          distribution: "one-per-day",
        },
      }),
    );
    expect(result.placed).toHaveLength(1);
    expect(defined(result.placed[0]).roomId).toBe("r-big");
  });
});

describe("placeSessions — best-fit room", () => {
  it("prefers the smallest room that fits the learner count", () => {
    const result = placeSessions(
      buildInput({
        rooms: [
          { id: "r-big", name: "Sim Lab B", capacity: 30 },
          { id: "r-tiny", name: "Sim Lab Tiny", capacity: 4 },
          { id: "r-mid", name: "Sim Lab Mid", capacity: 10 },
        ],
        request: {
          className: "X",
          trainerName: "Smith",
          durationMinutes: 60,
          count: 1,
          learnerCount: 8,
          preferredRoomId: null,
          preferredStartMinutes: null,
          distribution: "one-per-day",
        },
      }),
    );
    expect(defined(result.placed[0]).roomId).toBe("r-mid");
  });
});

describe("placeSessions — least-loaded trainer pick", () => {
  it("with two known trainers, picks the less-loaded one", () => {
    const result = placeSessions(
      buildInput({
        existing: [
          {
            id: "e1",
            starts_at: new Date(2026, 5, 1, 9, 0).toISOString(),
            ends_at: new Date(2026, 5, 1, 13, 0).toISOString(),
            room_id: "r-small",
            trainer_name: "Smith",
          },
          {
            id: "e2",
            starts_at: new Date(2026, 5, 1, 9, 0).toISOString(),
            ends_at: new Date(2026, 5, 1, 10, 0).toISOString(),
            room_id: "r-big",
            trainer_name: "Park",
          },
        ],
        request: {
          className: "X",
          trainerName: null,
          durationMinutes: 60,
          count: 1,
          learnerCount: null,
          preferredRoomId: null,
          preferredStartMinutes: null,
          distribution: "one-per-day",
        },
      }),
    );
    expect(result.placed).toHaveLength(1);
    // Park has 1h load, Smith has 4h — Park should be picked.
    expect(defined(result.placed[0]).trainerName).toBe("Park");
  });

  it("returns an unplaced row when no trainer is specified and none are known", () => {
    const result = placeSessions(
      buildInput({
        existing: [],
        request: {
          className: "X",
          trainerName: null,
          durationMinutes: 60,
          count: 1,
          learnerCount: null,
          preferredRoomId: null,
          preferredStartMinutes: null,
          distribution: "one-per-day",
        },
      }),
    );
    expect(result.placed).toHaveLength(0);
    expect(defined(result.unplaced[0]).reason).toMatch(/no known trainers/i);
  });
});

describe("placeSessions — preferred start time", () => {
  it("honors a preferred minutes-of-day offset", () => {
    const result = placeSessions(
      buildInput({
        request: {
          className: "X",
          trainerName: "Smith",
          durationMinutes: 60,
          count: 1,
          learnerCount: null,
          preferredRoomId: null,
          preferredStartMinutes: 13 * 60, // 1:00 PM
          distribution: "one-per-day",
        },
      }),
    );
    const start = new Date(defined(result.placed[0]).startsAt);
    expect(start.getHours()).toBe(13);
    expect(start.getMinutes()).toBe(0);
  });
});
