// This file's purpose is to verify the deprecated alias still works during
// the Phase 2 → Phase 7 migration window. The deprecation warning is expected.
/* eslint-disable @typescript-eslint/no-deprecated */
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
const { isManager } = await import("./role");

const ORG_ID = "org-aaaa-0000-0000-000000000000";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isOrgAdmin (deprecated alias)", () => {
  it("is the same function as isManager (re-export)", () => {
    expect(isOrgAdmin).toBe(isManager);
  });

  it("calls the is_manager RPC, not the legacy is_org_admin RPC", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    expect(await isOrgAdmin(ORG_ID)).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("is_manager", { p_org_id: ORG_ID });
  });

  it("returns false when RPC returns false", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    expect(await isOrgAdmin(ORG_ID)).toBe(false);
  });

  it("returns false when RPC returns an error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    expect(await isOrgAdmin(ORG_ID)).toBe(false);
  });
});
