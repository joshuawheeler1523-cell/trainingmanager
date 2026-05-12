import { describe, it, expect } from "vitest";
import { fromCalendarLocal, toCalendarLocal } from "./timezone";

describe("fromCalendarLocal", () => {
  it("converts a summer EDT wall time to the correct UTC ISO (UTC-4)", () => {
    // wall = 13:00 on June 15, 2026 (EDT). 13:00 EDT == 17:00 UTC.
    const fakeLocal = new Date(2026, 5, 15, 13, 0, 0);
    expect(fromCalendarLocal(fakeLocal, "America/New_York")).toBe("2026-06-15T17:00:00.000Z");
  });

  it("converts a winter EST wall time to the correct UTC ISO (UTC-5)", () => {
    // wall = 13:00 on Jan 15, 2026 (EST). 13:00 EST == 18:00 UTC.
    const fakeLocal = new Date(2026, 0, 15, 13, 0, 0);
    expect(fromCalendarLocal(fakeLocal, "America/New_York")).toBe("2026-01-15T18:00:00.000Z");
  });

  it("converts a PST wall time to the correct UTC ISO (UTC-8)", () => {
    // wall = 09:00 on Jan 15, 2026 (PST). 09:00 PST == 17:00 UTC.
    const fakeLocal = new Date(2026, 0, 15, 9, 0, 0);
    expect(fromCalendarLocal(fakeLocal, "America/Los_Angeles")).toBe("2026-01-15T17:00:00.000Z");
  });

  it("is a left-inverse of toCalendarLocal for an EDT instant", () => {
    const orig = "2026-06-15T17:00:00.000Z";
    const fake = toCalendarLocal(orig, "America/New_York");
    expect(fromCalendarLocal(fake, "America/New_York")).toBe(orig);
  });

  it("is a left-inverse of toCalendarLocal for an EST instant", () => {
    const orig = "2026-01-15T18:00:00.000Z";
    const fake = toCalendarLocal(orig, "America/New_York");
    expect(fromCalendarLocal(fake, "America/New_York")).toBe(orig);
  });

  it("is a left-inverse of toCalendarLocal for a PST instant", () => {
    const orig = "2026-01-15T17:00:00.000Z";
    const fake = toCalendarLocal(orig, "America/Los_Angeles");
    expect(fromCalendarLocal(fake, "America/Los_Angeles")).toBe(orig);
  });

  it("handles a wall time that straddles a DST 'fall back' (still terminates)", () => {
    // Nov 1, 2026 — 09:00 wall, well after the 02:00 EDT → 01:00 EST jump
    // (which lands at 06:00 UTC). 09:00 EST == 14:00 UTC.
    const fakeLocal = new Date(2026, 10, 1, 9, 0, 0);
    expect(fromCalendarLocal(fakeLocal, "America/New_York")).toBe("2026-11-01T14:00:00.000Z");
  });
});

describe("toCalendarLocal", () => {
  it("extracts the EDT wall clock fields from a UTC instant", () => {
    const fake = toCalendarLocal("2026-06-15T17:00:00.000Z", "America/New_York");
    expect(fake.getFullYear()).toBe(2026);
    expect(fake.getMonth()).toBe(5);
    expect(fake.getDate()).toBe(15);
    expect(fake.getHours()).toBe(13);
    expect(fake.getMinutes()).toBe(0);
  });

  it("extracts the EST wall clock fields from a UTC instant", () => {
    const fake = toCalendarLocal("2026-01-15T18:00:00.000Z", "America/New_York");
    expect(fake.getHours()).toBe(13);
  });
});
