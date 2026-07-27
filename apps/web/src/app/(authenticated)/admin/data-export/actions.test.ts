import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ auth: { getUser: mockGetUser } })),
}));

const mockGetCurrentOrgId = vi.fn();
vi.mock("@/lib/auth/current-org", () => ({ getCurrentOrgId: mockGetCurrentOrgId }));

const mockIsManager = vi.fn();
vi.mock("@/lib/auth/role", () => ({ isManager: mockIsManager }));

const mockWriteAuditDenial = vi.fn();
vi.mock("@/lib/auth/audit-denial", () => ({ writeAuditDenial: mockWriteAuditDenial }));

const mockBuildOrgDataExport = vi.fn();
vi.mock("@/lib/data-export", () => ({ buildOrgDataExport: mockBuildOrgDataExport }));

const { startDataExportAction } = await import("./actions");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const USER_ID = "cccccccc-0000-0000-0000-000000000000";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentOrgId.mockResolvedValue(ORG_ID);
  mockIsManager.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
});

describe("startDataExportAction", () => {
  // This action packages the org's entire dataset into a downloadable ZIP,
  // so the role gate is the whole control on bulk egress.
  it("refuses a non-manager, records the denial, and builds nothing", async () => {
    mockIsManager.mockResolvedValue(false);

    const result = await startDataExportAction();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(mockWriteAuditDenial).toHaveBeenCalledWith(
      ORG_ID,
      "data_export",
      "startDataExport",
      "not_manager",
    );
    expect(mockBuildOrgDataExport).not.toHaveBeenCalled();
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("refuses when there is no active org", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);

    const result = await startDataExportAction();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
    expect(mockBuildOrgDataExport).not.toHaveBeenCalled();
  });

  it("builds the export scoped to the caller's own org", async () => {
    mockAdminFrom.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: "exp-1" }, error: null }),
        })),
      })),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    });
    mockBuildOrgDataExport.mockResolvedValue({
      sizeBytes: 2048,
      tableCount: 12,
      rowCount: 340,
      storagePath: `${ORG_ID}/exp-1.zip`,
    });

    const result = await startDataExportAction();

    expect(result.ok).toBe(true);
    // The org id must come from the session, never from caller input.
    expect(mockBuildOrgDataExport).toHaveBeenCalledWith(ORG_ID, "exp-1");
  });
});
