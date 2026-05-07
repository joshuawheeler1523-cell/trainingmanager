import { describe, it, expect } from "vitest";
import {
  recommendOverAllocatedInstructors,
  recommendUndercoveredClasses,
  recommendOverConsumedBuckets,
  buildRecommendations,
  bucketBreakdown,
  projectedAnnualized,
  type CapacityRow,
  type WorkloadRow,
} from "@arbor/shared";

const ORG = "00000000-0000-0000-0000-000000000000";

function cap(overrides: Partial<CapacityRow>): CapacityRow {
  return {
    org_id: ORG,
    instructor_id: "inst-1",
    full_name: "Test Inst",
    annual_hours: 1880,
    assigned_hours: 0,
    utilization_pct: 0,
    utilization_status: "under_utilized",
    ...overrides,
  };
}

describe("recommendOverAllocatedInstructors", () => {
  it("flags only instructors at 95%+ utilization", () => {
    const rows = [
      cap({ instructor_id: "a", utilization_pct: 50 }),
      cap({ instructor_id: "b", full_name: "Beth", utilization_pct: 80 }),
      cap({ instructor_id: "c", full_name: "Cam", utilization_pct: 95, assigned_hours: 1786 }),
      cap({ instructor_id: "d", full_name: "Dee", utilization_pct: 110, assigned_hours: 2068 }),
    ];
    const recs = recommendOverAllocatedInstructors(rows);
    expect(recs).toHaveLength(2);
    // Most-utilized first
    expect(recs[0]?.id).toBe("inst-over-d");
    expect(recs[1]?.id).toBe("inst-over-c");
  });

  it("escalates 100%+ to critical severity", () => {
    const rows = [cap({ instructor_id: "x", utilization_pct: 110, assigned_hours: 2068 })];
    const recs = recommendOverAllocatedInstructors(rows);
    expect(recs[0]?.severity).toBe("critical");
  });

  it("uses warning severity at 95-99%", () => {
    const rows = [cap({ instructor_id: "y", utilization_pct: 96, assigned_hours: 1804 })];
    const recs = recommendOverAllocatedInstructors(rows);
    expect(recs[0]?.severity).toBe("warning");
  });

  it("includes a deep link to the instructor", () => {
    const rows = [cap({ instructor_id: "abc", utilization_pct: 99 })];
    const recs = recommendOverAllocatedInstructors(rows);
    expect(recs[0]?.link).toBe("/instructors/abc");
  });
});

describe("recommendUndercoveredClasses", () => {
  it("flags 0-qualified as critical and 1-qualified as warning", () => {
    const recs = recommendUndercoveredClasses([
      { class_id: "c1", class_name: "BLS", qualified_count: 0 },
      { class_id: "c2", class_name: "ACLS", qualified_count: 1 },
      { class_id: "c3", class_name: "PALS", qualified_count: 5 },
    ]);
    expect(recs).toHaveLength(2);
    expect(recs.find((r) => r.id === "class-cov-c1")?.severity).toBe("critical");
    expect(recs.find((r) => r.id === "class-cov-c2")?.severity).toBe("warning");
  });

  it("does not flag classes with multiple qualified instructors", () => {
    const recs = recommendUndercoveredClasses([
      { class_id: "c", class_name: "X", qualified_count: 2 },
    ]);
    expect(recs).toHaveLength(0);
  });
});

describe("recommendOverConsumedBuckets", () => {
  it("flags buckets at 110%+ of allocation target", () => {
    // Org capacity = 10,000 hrs. Target 50% on bucket A = 5,000 hrs.
    // Consumed 6,000 = 120% of target → flag.
    const recs = recommendOverConsumedBuckets(
      [
        {
          bucket_id: "b1",
          bucket_name: "Instruction",
          target_percent: 50,
          consumed_hours: 6000,
        },
        {
          bucket_id: "b2",
          bucket_name: "Admin",
          target_percent: 25,
          consumed_hours: 2500,
        },
      ],
      10000,
    );
    expect(recs).toHaveLength(1);
    expect(recs[0]?.id).toBe("bucket-over-b1");
  });

  it("escalates to critical at 125%+", () => {
    const recs = recommendOverConsumedBuckets(
      [
        {
          bucket_id: "b1",
          bucket_name: "Instruction",
          target_percent: 50,
          consumed_hours: 6500, // 130%
        },
      ],
      10000,
    );
    expect(recs[0]?.severity).toBe("critical");
  });

  it("returns no recommendations when org capacity is 0", () => {
    const recs = recommendOverConsumedBuckets(
      [
        {
          bucket_id: "b1",
          bucket_name: "Instruction",
          target_percent: 50,
          consumed_hours: 1000,
        },
      ],
      0,
    );
    expect(recs).toHaveLength(0);
  });

  it("ignores buckets with 0% target_percent", () => {
    const recs = recommendOverConsumedBuckets(
      [
        {
          bucket_id: "b1",
          bucket_name: "Unallocated",
          target_percent: 0,
          consumed_hours: 1000,
        },
      ],
      10000,
    );
    expect(recs).toHaveLength(0);
  });
});

describe("buildRecommendations", () => {
  it("orders critical before warning", () => {
    const recs = buildRecommendations({
      capacity: [
        cap({ instructor_id: "a", full_name: "Aria", utilization_pct: 96, assigned_hours: 1804 }),
      ],
      classCoverage: [{ class_id: "c1", class_name: "BLS", qualified_count: 0 }],
      bucketConsumption: [],
      totalOrgAnnualHours: 10000,
    });
    expect(recs[0]?.severity).toBe("critical");
    expect(recs[1]?.severity).toBe("warning");
  });
});

describe("bucketBreakdown", () => {
  function row(bucket_id: string | null, hours: number): WorkloadRow {
    return {
      org_id: ORG,
      instructor_id: "i1",
      source: "class",
      source_id: `s-${bucket_id ?? "none"}`,
      source_label: "X",
      quantity: 1,
      annual_hours: hours,
      bucket_id,
    };
  }

  it("aggregates hours per bucket and computes percentages", () => {
    const slices = bucketBreakdown(
      [row("a", 60), row("b", 40), row("a", 20)],
      [
        { id: "a", name: "Instruction", color: "#10b981" },
        { id: "b", name: "Admin", color: "#6366f1" },
      ],
    );
    // Instruction = 80, Admin = 40, total = 120
    expect(slices[0]?.bucket_id).toBe("a");
    expect(slices[0]?.hours).toBe(80);
    expect(slices[0]?.percent).toBeCloseTo((80 / 120) * 100, 4);
    expect(slices[1]?.hours).toBe(40);
  });

  it("buckets unbucketed hours under 'Unbucketed'", () => {
    const slices = bucketBreakdown([row(null, 50)], []);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.bucket_label).toBe("Unbucketed");
    expect(slices[0]?.bucket_id).toBeNull();
  });

  it("returns empty array for no rows", () => {
    expect(bucketBreakdown([], [])).toEqual([]);
  });
});

describe("projectedAnnualized", () => {
  it("scales 8 weekly numbers up to 52 weeks", () => {
    const weeks = Array.from({ length: 8 }, (_, i) => ({
      week_start: `2026-01-${String(5 + i * 7).padStart(2, "0")}`,
      projected_hours: 4,
      weekly_capacity: 36,
      utilization_pct: 11,
    }));
    // 8 × 4 = 32; annualized = 32 × (52 / 8) = 208
    expect(projectedAnnualized(weeks)).toBe(208);
  });

  it("returns 0 for empty input", () => {
    expect(projectedAnnualized([])).toBe(0);
  });
});
