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

const { isOrgAdmin } = await import("./org-admin");

const ORG_ID = "org-aaaa-0000-0000-000000000000";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isOrgAdmin", () => {
  it("returns true when RPC returns true", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    expect(await isOrgAdmin(ORG_ID)).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("is_org_admin", { p_org_id: ORG_ID });
  });

  it("returns false when RPC returns false", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    expect(await isOrgAdmin(ORG_ID)).toBe(false);
  });

  it("returns false when RPC returns an error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    expect(await isOrgAdmin(ORG_ID)).toBe(false);
  });

  it("returns false when RPC returns null data", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await isOrgAdmin(ORG_ID)).toBe(false);
  });
});
