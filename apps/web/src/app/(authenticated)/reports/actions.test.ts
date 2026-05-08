import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

const mockGetCurrentOrgId = vi.fn();
vi.mock("@/lib/auth/current-org", () => ({
  getCurrentOrgId: mockGetCurrentOrgId,
}));

const { saveReport, recordReportRun, deleteSavedReport } = await import("./actions");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const SAVED_ID = "bbbbbbbb-0000-0000-0000-000000000000";

function makeInsertChain(result: { data?: unknown; error?: unknown }) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentOrgId.mockResolvedValue(ORG_ID);
});

describe("saveReport", () => {
  it("rejects an empty name", async () => {
    const result = await saveReport({ slug: "allocation", name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects an unknown slug", async () => {
    const result = await saveReport({ slug: "nope", name: "X" });
    expect(result.ok).toBe(false);
  });

  it("succeeds with valid input", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: SAVED_ID, slug: "allocation", name: "Q1 buckets", filters: {} },
        error: null,
      }),
    );
    const result = await saveReport({
      slug: "allocation",
      name: "Q1 buckets",
      filters: { bucket_ids: [] },
    });
    expect(result.ok).toBe(true);
  });

  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await saveReport({ slug: "allocation", name: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });
});

describe("deleteSavedReport", () => {
  it("returns NO_ORG when org context missing", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await deleteSavedReport(SAVED_ID);
    expect(result.ok).toBe(false);
  });
});

describe("recordReportRun", () => {
  it("rejects an unknown slug without hitting the DB", async () => {
    const result = await recordReportRun({
      slug: "not-a-real-report",
      filters: {},
      format: "preview",
      rowCount: null,
      durationMs: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("inserts a run row for a valid slug", async () => {
    mockFrom.mockReturnValue(
      makeInsertChain({
        data: { id: "run-1" },
        error: null,
      }),
    );
    const result = await recordReportRun({
      slug: "allocation",
      filters: {},
      format: "csv",
      rowCount: 3,
      durationMs: 42,
    });
    expect(result.ok).toBe(true);
  });
});

describe("report shared helpers", () => {
  it("utilizationBand bands match the documented thresholds", async () => {
    const { utilizationBand } = await import("@arbor/shared");
    expect(utilizationBand(null)).toBe(null);
    expect(utilizationBand(20)).toBe("under_utilized");
    expect(utilizationBand(40)).toBe("balanced");
    expect(utilizationBand(85)).toBe("at_risk");
    expect(utilizationBand(110)).toBe("over_allocated");
  });

  it("filterSchemaForSlug returns a schema that defaults missing fields", async () => {
    const { allocationReportFilters, skillGapReportFilters } = await import("@arbor/shared");
    const allocation = allocationReportFilters.parse({});
    expect(allocation.bucket_ids).toEqual([]);
    const skill = skillGapReportFilters.parse({});
    expect(skill.expiry_window_days).toBe(90);
  });
});

describe("exporters", () => {
  it("writeCsv encodes commas + quotes per RFC 4180", async () => {
    const { writeCsv } = await import("@/lib/reports/exporters");
    const csv = writeCsv([
      {
        name: "Test",
        columns: ["A", "B"],
        rows: [
          { A: 'has "quote"', B: "has, comma" },
          { A: "plain", B: 42 },
        ],
      },
    ]);
    expect(csv).toContain('"has ""quote"""');
    expect(csv).toContain('"has, comma"');
    expect(csv).toContain("plain,42");
  });

  it("writeXlsx returns a non-empty Uint8Array workbook", async () => {
    const { writeXlsx } = await import("@/lib/reports/exporters");
    const bytes = writeXlsx([{ name: "S1", columns: ["A"], rows: [{ A: "x" }] }]);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(100);
  });
});
