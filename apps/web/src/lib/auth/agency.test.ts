import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ rpc: mockRpc })),
}));

const {
  getCurrentAgencyId,
  isAgencyAdmin,
  isAgencyMember,
  requireAgencyAdmin,
  AgencyForbiddenError,
} = await import("./agency");

const AGENCY_ID = "agency-aaaa-0000-0000-000000000000";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentAgencyId", () => {
  it("returns the agency id when RPC returns one", async () => {
    mockRpc.mockResolvedValue({ data: AGENCY_ID, error: null });
    expect(await getCurrentAgencyId()).toBe(AGENCY_ID);
    expect(mockRpc).toHaveBeenCalledWith("current_agency_id");
  });

  it("returns null when RPC returns null (user not in an agency)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await getCurrentAgencyId()).toBe(null);
  });

  it("returns null when RPC errors", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getCurrentAgencyId()).toBe(null);
  });
});

describe("isAgencyAdmin", () => {
  it("returns true when RPC returns true", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    expect(await isAgencyAdmin(AGENCY_ID)).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("is_agency_admin", { p_agency_id: AGENCY_ID });
  });

  it("returns false when RPC returns false", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    expect(await isAgencyAdmin(AGENCY_ID)).toBe(false);
  });

  it("returns false on RPC error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await isAgencyAdmin(AGENCY_ID)).toBe(false);
  });
});

describe("isAgencyMember", () => {
  it("returns true for any member", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    expect(await isAgencyMember(AGENCY_ID)).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("is_agency_member", { p_agency_id: AGENCY_ID });
  });
});

describe("requireAgencyAdmin", () => {
  it("resolves when caller is admin", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await expect(requireAgencyAdmin(AGENCY_ID)).resolves.toBeUndefined();
  });

  it("throws AgencyForbiddenError when caller is not admin", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    await expect(requireAgencyAdmin(AGENCY_ID)).rejects.toBeInstanceOf(AgencyForbiddenError);
  });

  it("error carries required + agencyId for downstream audit", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    try {
      await requireAgencyAdmin(AGENCY_ID);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AgencyForbiddenError);
      if (!(err instanceof AgencyForbiddenError)) throw err;
      expect(err.code).toBe("FORBIDDEN");
      expect(err.required).toEqual(["agency_admin"]);
      expect(err.agencyId).toBe(AGENCY_ID);
    }
  });
});
