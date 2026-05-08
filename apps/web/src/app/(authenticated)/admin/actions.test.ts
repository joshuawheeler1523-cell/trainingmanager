import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as EmailModule from "@/lib/email";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: (k: string) => (k === "x-forwarded-host" ? "arbor.test" : null),
    }),
  ),
}));

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
      rpc: mockRpc,
      auth: { getUser: mockGetUser },
    }),
  ),
}));

const mockGetCurrentOrgId = vi.fn();
const mockIsOrgAdmin = vi.fn();
vi.mock("@/lib/auth/current-org", () => ({
  getCurrentOrgId: mockGetCurrentOrgId,
}));
vi.mock("@/lib/auth/org-admin", () => ({
  isOrgAdmin: mockIsOrgAdmin,
}));

// Mock just sendEmail so the action doesn't try to hit the network.
// The html/text helpers stay un-mocked so a separate test can verify them.
vi.mock("@/lib/email", async (importOriginal) => {
  const actual: typeof EmailModule = await importOriginal();
  return {
    ...actual,
    sendEmail: vi.fn(() => Promise.resolve({ ok: true, id: null, degraded: true })),
  };
});

const {
  inviteUser,
  resendInvitation,
  revokeInvitation,
  updateMember,
  removeMember,
  updateOrgSettings,
  setFeatureFlag,
} = await import("./actions");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const INVITE_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const MEMBER_ID = "cccccccc-0000-0000-0000-000000000000";

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
  mockIsOrgAdmin.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({
    data: { user: { email: "admin@example.com", user_metadata: {} } },
  });
});

describe("inviteUser", () => {
  it("rejects an invalid email", async () => {
    const result = await inviteUser({ email: "not-an-email" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects an unknown role", async () => {
    const result = await inviteUser({ email: "x@y.com", role: "boss" });
    expect(result.ok).toBe(false);
  });

  it("returns FORBIDDEN when caller isn't org admin", async () => {
    mockIsOrgAdmin.mockResolvedValue(false);
    const result = await inviteUser({ email: "x@y.com" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("succeeds and returns an accept URL", async () => {
    const insertChain = makeInsertChain({
      data: { id: INVITE_ID, token: "tok123", email: "newuser@example.com" },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "org_invitations") return insertChain;
      if (table === "organizations") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { name: "Acme" }, error: null }),
        };
      }
      return insertChain;
    });

    const result = await inviteUser({ email: "newuser@example.com" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.acceptUrl).toContain("/accept-invite/tok123");
      expect(result.data.emailDelivered).toBe(false); // mocked email is degraded
    }
  });
});

describe("revokeInvitation + resendInvitation", () => {
  it("revokes when caller is admin", async () => {
    // delete().eq().eq() — both eq() calls need to be chainable, second
    // resolves the promise.
    const eq2 = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({ eq: eq1 }),
    });
    const result = await revokeInvitation(INVITE_ID);
    expect(result.ok).toBe(true);
  });

  it("resend rejects FORBIDDEN for non-admin", async () => {
    mockIsOrgAdmin.mockResolvedValue(false);
    const result = await resendInvitation(INVITE_ID);
    expect(result.ok).toBe(false);
  });
});

describe("updateMember last-admin guard", () => {
  it("rejects demoting the last admin", async () => {
    let countChainCalls = 0;
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockImplementation((_arg, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          countChainCalls++;
          // First call returns the count of admins (1).
          return {
            eq: vi.fn().mockReturnThis(),
            not: vi.fn().mockResolvedValue({ count: 1, error: null }),
          };
        }
        // Second call: "select role" for the target membership.
        return {
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { role: "org_admin" },
            error: null,
          }),
        };
      }),
      update: vi.fn(),
    }));
    const result = await updateMember(MEMBER_ID, { role: "member" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("LAST_ADMIN");
    expect(countChainCalls).toBeGreaterThan(0);
  });
});

describe("removeMember last-admin guard", () => {
  it("rejects removing the last admin", async () => {
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockImplementation((_arg, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          return {
            eq: vi.fn().mockReturnThis(),
            not: vi.fn().mockResolvedValue({ count: 1, error: null }),
          };
        }
        return {
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { role: "org_admin", user_id: "u" },
            error: null,
          }),
        };
      }),
      delete: vi.fn(),
    }));
    const result = await removeMember(MEMBER_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("LAST_ADMIN");
  });
});

describe("updateOrgSettings", () => {
  it("rejects an invalid hex color", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { settings: {} }, error: null }),
    });
    const result = await updateOrgSettings({ brand_color: "blueish" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects working hours > 80", async () => {
    const result = await updateOrgSettings({ default_working_hours_per_week: 100 });
    expect(result.ok).toBe(false);
  });

  it("succeeds with valid input", async () => {
    // First call to .from() reads existing settings; second writes the patch.
    let calls = 0;
    mockFrom.mockImplementation(() => {
      calls++;
      if (calls === 1) {
        // select("settings").eq("id", orgId).maybeSingle()
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { settings: {} },
                error: null,
              }),
            }),
          }),
        };
      }
      // update(...).eq("id", orgId)
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };
    });
    const result = await updateOrgSettings({
      name: "New Name",
      brand_color: "#2563eb",
      default_working_hours_per_week: 40,
    });
    expect(result.ok).toBe(true);
  });
});

describe("setFeatureFlag", () => {
  it("rejects an empty key", async () => {
    const result = await setFeatureFlag({ key: "", enabled: true });
    expect(result.ok).toBe(false);
  });

  it("upserts a valid flag", async () => {
    mockFrom.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const result = await setFeatureFlag({ key: "ai_estimation", enabled: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.enabled).toBe(true);
  });
});

describe("email helpers", () => {
  it("inviteEmailHtml escapes the org name and inviter", async () => {
    const { inviteEmailHtml } = await import("@/lib/email");
    const html = inviteEmailHtml({
      orgName: "<script>alert(1)</script>",
      inviterName: 'Sam "the SQL"',
      acceptUrl: "https://app/accept-invite/abc",
    });
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Sam &quot;the SQL&quot;");
  });
});
