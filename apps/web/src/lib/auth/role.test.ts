import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      rpc: mockRpc,
    }),
  ),
}));

const { getCurrentRole, requireRole, RoleForbiddenError, ROLES } = await import("./role");

const ORG_ID = "org-aaaa-0000-0000-000000000000";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ROLES constant", () => {
  it("contains exactly the three canonical roles", () => {
    expect(ROLES).toEqual(["manager", "instructor", "viewer"]);
  });
});

describe("getCurrentRole", () => {
  it("returns 'manager' when RPC returns 'manager'", async () => {
    mockRpc.mockResolvedValue({ data: "manager", error: null });
    expect(await getCurrentRole(ORG_ID)).toBe("manager");
    expect(mockRpc).toHaveBeenCalledWith("user_role_in_org", { p_org_id: ORG_ID });
  });

  it("returns 'instructor' when RPC returns 'instructor'", async () => {
    mockRpc.mockResolvedValue({ data: "instructor", error: null });
    expect(await getCurrentRole(ORG_ID)).toBe("instructor");
  });

  it("returns 'viewer' when RPC returns 'viewer'", async () => {
    mockRpc.mockResolvedValue({ data: "viewer", error: null });
    expect(await getCurrentRole(ORG_ID)).toBe("viewer");
  });

  it("returns null when RPC returns null (not a member)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await getCurrentRole(ORG_ID)).toBe(null);
  });

  it("returns null when RPC returns an error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    expect(await getCurrentRole(ORG_ID)).toBe(null);
  });

  it("returns null for legacy/unknown role values (defensive)", async () => {
    mockRpc.mockResolvedValue({ data: "org_admin", error: null });
    expect(await getCurrentRole(ORG_ID)).toBe(null);
  });

  it("returns null for arbitrary string", async () => {
    mockRpc.mockResolvedValue({ data: "weird", error: null });
    expect(await getCurrentRole(ORG_ID)).toBe(null);
  });
});

describe("requireRole", () => {
  it("returns the role when it matches one of the required", async () => {
    mockRpc.mockResolvedValue({ data: "manager", error: null });
    expect(await requireRole(["manager"], ORG_ID)).toBe("manager");
  });

  it("returns the role when it matches any of multiple required", async () => {
    mockRpc.mockResolvedValue({ data: "instructor", error: null });
    expect(await requireRole(["manager", "instructor"], ORG_ID)).toBe("instructor");
  });

  it("throws RoleForbiddenError when role does not match", async () => {
    mockRpc.mockResolvedValue({ data: "viewer", error: null });
    await expect(requireRole(["manager"], ORG_ID)).rejects.toBeInstanceOf(RoleForbiddenError);
  });

  it("throws RoleForbiddenError when caller has no role", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(requireRole(["manager"], ORG_ID)).rejects.toBeInstanceOf(RoleForbiddenError);
  });

  it("throws RoleForbiddenError when RPC errors", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(requireRole(["manager"], ORG_ID)).rejects.toBeInstanceOf(RoleForbiddenError);
  });

  it("error carries required, actual, and orgId for downstream audit logging", async () => {
    mockRpc.mockResolvedValue({ data: "viewer", error: null });
    try {
      await requireRole(["manager", "instructor"], ORG_ID);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RoleForbiddenError);
      if (!(err instanceof RoleForbiddenError)) throw err;
      expect(err.code).toBe("FORBIDDEN");
      expect(err.required).toEqual(["manager", "instructor"]);
      expect(err.actual).toBe("viewer");
      expect(err.orgId).toBe(ORG_ID);
    }
  });

  it("error has actual=null when caller is not a member", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    try {
      await requireRole(["manager"], ORG_ID);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RoleForbiddenError);
      if (!(err instanceof RoleForbiddenError)) throw err;
      expect(err.actual).toBe(null);
    }
  });
});
