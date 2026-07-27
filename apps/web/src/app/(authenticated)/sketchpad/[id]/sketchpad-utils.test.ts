import { describe, it, expect } from "vitest";
import {
  colorForClass,
  dayDate,
  daysBetweenInclusive,
  intervalsOverlap,
  isoForOffset,
  parseDurationToMinutes,
  parsePasteText,
  parseTimeToMinutes,
  sameDay,
  ymd,
} from "./sketchpad-utils";

const ROOMS = [
  { id: "room-a", name: "Room A" },
  { id: "room-b", name: "Sim Lab " },
];

// Fixed local-midnight reference so assertions don't drift with the clock.
const DAY = new Date(2026, 6, 15); // 15 Jul 2026, local

describe("parseTimeToMinutes", () => {
  it.each([
    ["09:00", 540],
    ["9:00", 540],
    ["00:00", 0],
    ["23:59", 1439],
    ["12:00 pm", 720],
    ["12:00 am", 0],
    ["1:30 PM", 810],
    ["11:45 am", 705],
  ])("parses %s", (raw, expected) => {
    expect(parseTimeToMinutes(raw)).toBe(expected);
  });

  it.each([["25:00"], ["9:60"], ["nine"], [""], ["0900"], ["9"]])("rejects %s", (raw) => {
    expect(parseTimeToMinutes(raw)).toBeNull();
  });
});

describe("parseDurationToMinutes", () => {
  it.each([
    ["60", 60],
    ["60m", 60],
    ["60min", 60],
    ["90 minutes", 90],
    ["1h", 60],
    ["1.5h", 90],
    ["2 hours", 120],
    ["0.25h", 15],
  ])("parses %s", (raw, expected) => {
    expect(parseDurationToMinutes(raw)).toBe(expected);
  });

  it.each([["soon"], [""], ["1h30m"], ["-30"]])("rejects %s", (raw) => {
    expect(parseDurationToMinutes(raw)).toBeNull();
  });
});

describe("parsePasteText", () => {
  it("parses a tab-separated row and resolves the room by name", () => {
    const { rows, errors } = parsePasteText("Smith\tEMR Provider\t9:00\t2h\tRoom A", DAY, ROOMS);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.trainer_name).toBe("Smith");
    expect(row?.class_name).toBe("EMR Provider");
    expect(row?.room_id).toBe("room-a");
    // 09:00 local + 2h = 11:00 local
    expect(new Date(row?.starts_at ?? "").getHours()).toBe(9);
    expect(new Date(row?.ends_at ?? "").getHours()).toBe(11);
  });

  it("parses a comma-separated row equivalently", () => {
    const { rows, errors } = parsePasteText(
      "Smith, EMR Provider, 09:00, 120min, Room A",
      DAY,
      ROOMS,
    );
    expect(errors).toEqual([]);
    expect(rows[0]?.room_id).toBe("room-a");
    expect(new Date(rows[0]?.ends_at ?? "").getHours()).toBe(11);
  });

  it("matches room names case- and whitespace-insensitively", () => {
    const { rows } = parsePasteText("Smith\tClass\t9:00\t1h\t  sim lab  ", DAY, ROOMS);
    expect(rows[0]?.room_id).toBe("room-b");
  });

  it("still imports the row when the room is unknown, but reports it", () => {
    const { rows, errors } = parsePasteText("Smith\tClass\t9:00\t1h\tRoom Z", DAY, ROOMS);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.room_id).toBeNull();
    expect(errors[0]).toContain("Room Z");
    expect(errors[0]).toContain("Unassigned");
  });

  it("leaves room_id null when the column is omitted", () => {
    const { rows, errors } = parsePasteText("Smith\tClass\t9:00\t1h", DAY, ROOMS);
    expect(rows[0]?.room_id).toBeNull();
    expect(errors).toEqual([]);
  });

  it("reports the 1-based line number for a bad row and keeps the good ones", () => {
    const { rows, errors } = parsePasteText(
      ["Smith\tClass A\t9:00\t1h", "garbage", "Jones\tClass B\t13:00\t30m"].join("\n"),
      DAY,
      ROOMS,
    );

    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Line 2");
  });

  it("skips blank lines without emitting errors", () => {
    const { rows, errors } = parsePasteText("\n\nSmith\tClass\t9:00\t1h\n\n", DAY, ROOMS);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  it("rejects a row whose duration does not parse", () => {
    const { rows, errors } = parsePasteText("Smith\tClass\t9:00\tages", DAY, ROOMS);
    expect(rows).toEqual([]);
    expect(errors[0]).toContain("duration");
  });
});

describe("date helpers", () => {
  it("dayDate offsets from a YYYY-MM-DD start in local time", () => {
    expect(ymd(dayDate("2026-07-15", 0))).toBe("2026-07-15");
    expect(ymd(dayDate("2026-07-15", 3))).toBe("2026-07-18");
  });

  it("dayDate crosses a month boundary", () => {
    expect(ymd(dayDate("2026-07-30", 3))).toBe("2026-08-02");
  });

  it("daysBetweenInclusive counts a single day as 1", () => {
    expect(daysBetweenInclusive("2026-07-15", "2026-07-15")).toBe(1);
    expect(daysBetweenInclusive("2026-07-15", "2026-07-17")).toBe(3);
  });

  it("daysBetweenInclusive returns 0 for a reversed span", () => {
    expect(daysBetweenInclusive("2026-07-17", "2026-07-15")).toBe(0);
  });

  it("isoForOffset advances by the given minutes", () => {
    const start = new Date(2026, 6, 15, 9, 0, 0, 0).toISOString();
    expect(new Date(isoForOffset(start, 90)).getHours()).toBe(10);
    expect(new Date(isoForOffset(start, 90)).getMinutes()).toBe(30);
  });

  it("sameDay compares calendar days, not instants", () => {
    expect(sameDay(new Date(2026, 6, 15, 1), new Date(2026, 6, 15, 23))).toBe(true);
    expect(sameDay(new Date(2026, 6, 15), new Date(2026, 6, 16))).toBe(false);
  });
});

describe("intervalsOverlap", () => {
  const at = (h: number) => new Date(2026, 6, 15, h);

  it("treats touching intervals as non-overlapping (half-open)", () => {
    expect(intervalsOverlap(at(9), at(10), at(10), at(11))).toBe(false);
  });

  it("detects a partial overlap in both directions", () => {
    expect(intervalsOverlap(at(9), at(11), at(10), at(12))).toBe(true);
    expect(intervalsOverlap(at(10), at(12), at(9), at(11))).toBe(true);
  });

  it("detects full containment", () => {
    expect(intervalsOverlap(at(9), at(17), at(12), at(13))).toBe(true);
  });
});

describe("colorForClass", () => {
  it("is stable for the same name", () => {
    expect(colorForClass("EMR Provider")).toBe(colorForClass("EMR Provider"));
  });

  it("ignores case and surrounding whitespace", () => {
    expect(colorForClass("  emr provider ")).toBe(colorForClass("EMR Provider"));
  });

  it("always returns a palette colour, including for an empty name", () => {
    expect(colorForClass("")).toMatch(/^#[0-9a-f]{6}$/i);
    expect(colorForClass("Anything")).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
