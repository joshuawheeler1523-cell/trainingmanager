import { describe, it, expect } from "vitest";
import {
  classHoursPerWeek,
  recurringHoursPerWeek,
  adHocHoursForWeek,
  weeklyCapacity,
  groupWorkloadBySource,
  totalAnnualHours,
  type WorkloadRow,
} from "@arbor/shared";

describe("classHoursPerWeek", () => {
  it("spreads annual hours evenly across 52 weeks", () => {
    expect(classHoursPerWeek(104)).toBe(2);
    expect(classHoursPerWeek(0)).toBe(0);
  });

  it("returns the DOD scenario value (100h class) ≈ 1.923/week", () => {
    expect(classHoursPerWeek(100)).toBeCloseTo(100 / 52, 6);
  });
});

describe("recurringHoursPerWeek", () => {
  it("weekly + 2 hrs default = 2 hrs/week", () => {
    expect(
      recurringHoursPerWeek({
        frequency: "weekly",
        occurrences_per_year: null,
        hours_per_occurrence: 2,
      }),
    ).toBeCloseTo(2, 6);
  });

  it("monthly + 4 hrs override 20 = 80/52 hrs/week", () => {
    expect(
      recurringHoursPerWeek({
        frequency: "monthly",
        occurrences_per_year: 20,
        hours_per_occurrence: 4,
      }),
    ).toBeCloseTo(80 / 52, 6);
  });

  it("share_percent halves the per-week contribution", () => {
    expect(
      recurringHoursPerWeek({
        frequency: "weekly",
        occurrences_per_year: null,
        hours_per_occurrence: 2,
        share_percent: 50,
      }),
    ).toBeCloseTo(1, 6);
  });

  it("annually + 40 hrs default ≈ 40/52 hrs/week", () => {
    expect(
      recurringHoursPerWeek({
        frequency: "annually",
        occurrences_per_year: null,
        hours_per_occurrence: 40,
      }),
    ).toBeCloseTo(40 / 52, 6);
  });
});

describe("adHocHoursForWeek", () => {
  // 2026-01-05 is a Monday — week_start "2026-01-05" anchors that week.
  it("places the full hours in the week containing due_date", () => {
    expect(
      adHocHoursForWeek({
        due_date: "2026-01-08", // Thu of that week
        hours: 6,
        week_start: "2026-01-05",
      }),
    ).toBe(6);
  });

  it("returns 0 if due_date falls in a different week", () => {
    expect(
      adHocHoursForWeek({
        due_date: "2026-01-15",
        hours: 6,
        week_start: "2026-01-05",
      }),
    ).toBe(0);
  });

  it("returns 0 when due_date is null (task has no scheduled week)", () => {
    expect(
      adHocHoursForWeek({
        due_date: null,
        hours: 6,
        week_start: "2026-01-05",
      }),
    ).toBe(0);
  });

  it("Sunday due-date counts as the previous Monday's week", () => {
    // 2026-01-11 is a Sunday. Week-of contains 2026-01-05 .. 2026-01-11.
    expect(
      adHocHoursForWeek({
        due_date: "2026-01-11",
        hours: 3,
        week_start: "2026-01-05",
      }),
    ).toBe(3);
  });
});

describe("weeklyCapacity", () => {
  it("DOD scenario: 1880 / 52 ≈ 36.15", () => {
    expect(weeklyCapacity(1880)).toBeCloseTo(36.1538, 4);
  });
});

describe("groupWorkloadBySource", () => {
  it("buckets rows by source and preserves order within each bucket", () => {
    const rows: WorkloadRow[] = [
      {
        org_id: "o",
        instructor_id: "i",
        source: "class",
        source_id: "c1",
        source_label: "BLS",
        quantity: 5,
        annual_hours: 50,
        bucket_id: null,
      },
      {
        org_id: "o",
        instructor_id: "i",
        source: "recurring_task",
        source_id: "r1",
        source_label: "Huddle",
        quantity: null,
        annual_hours: 104,
        bucket_id: null,
      },
      {
        org_id: "o",
        instructor_id: "i",
        source: "class",
        source_id: "c2",
        source_label: "ACLS",
        quantity: 2,
        annual_hours: 16,
        bucket_id: null,
      },
    ];
    const grouped = groupWorkloadBySource(rows);
    expect(grouped.class).toHaveLength(2);
    expect(grouped.class[0]?.source_id).toBe("c1");
    expect(grouped.class[1]?.source_id).toBe("c2");
    expect(grouped.recurring_task).toHaveLength(1);
    expect(grouped.ad_hoc_task).toHaveLength(0);
  });
});

describe("totalAnnualHours", () => {
  it("sums numeric annual_hours across rows", () => {
    const rows: WorkloadRow[] = [
      {
        org_id: "o",
        instructor_id: "i",
        source: "class",
        source_id: "c1",
        source_label: "X",
        quantity: 1,
        annual_hours: 100,
        bucket_id: null,
      },
      {
        org_id: "o",
        instructor_id: "i",
        source: "recurring_task",
        source_id: "r1",
        source_label: "Y",
        quantity: null,
        annual_hours: 104,
        bucket_id: null,
      },
    ];
    expect(totalAnnualHours(rows)).toBe(204);
  });

  it("returns 0 for empty input", () => {
    expect(totalAnnualHours([])).toBe(0);
  });
});

// DOD reference scenario stitched together at the helper layer:
// 100h class + 104h recurring = 204h annual, 1880/52 weekly capacity ≈
// 10.85% utilization.
describe("DOD scenario (helpers)", () => {
  it("matches the prompt's expected utilization", () => {
    const cls = classHoursPerWeek(100);
    const rt = recurringHoursPerWeek({
      frequency: "weekly",
      occurrences_per_year: null,
      hours_per_occurrence: 2,
    });
    const cap = weeklyCapacity(1880);
    const util = ((cls + rt) / cap) * 100;
    expect(util).toBeCloseTo(10.85, 2);
  });
});
