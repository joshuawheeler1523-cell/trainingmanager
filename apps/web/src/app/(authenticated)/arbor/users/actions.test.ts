import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve({ get: () => null })),
}));

const mockFrom = vi.fn();
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
    auth: {
      admin: {
        getUserById: vi.fn(),
        generateLink: vi.fn(),
        signOut: vi.fn(),
        updateUserById: vi.fn(),
        deleteUser: vi.fn(),
      },
      resetPasswordForEmail: vi.fn(),
    },
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    }),
  ),
}));

vi.mock("@/lib/auth/arbor-admin", () => ({
  requireArborAdmin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue({ ok: true, id: null, degraded: false }),
}));

const {
  changeUserOrgRoleAction,
  addUserToOrgAction,
  removeUserFromOrgAction,
  changeUserAgencyRoleAction,
} = await import("./actions");

const USER_ID = "user-1111-0000-0000-000000000000";
const ORG_ID = "org-aaaa-0000-0000-000000000000";
const AGENCY_ID = "ag-bbbb-0000-0000-000000000000";

function chain(initial: { data?: unknown; error?: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(initial),
    single: vi.fn().mockResolvedValue(initial),
    then: undefined,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
});

describe("changeUserOrgRoleAction", () => {
  it("rejects an invalid role", async () => {
    const result = await changeUserOrgRoleAction({
      userId: USER_ID,
      orgId: ORG_ID,
      // @ts-expect-error — bad role on purpose
      role: "owner",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("BAD_ROLE");
  });

  it("returns NOT_A_MEMBER when no membership row exists", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        // First call: lookup existing
        return chain({ data: null, error: null });
      }
      return chain({ data: null, error: null });
    });
    const result = await changeUserOrgRoleAction({
      userId: USER_ID,
      orgId: ORG_ID,
      role: "manager",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_A_MEMBER");
  });

  it("returns ok without writing when role is already the requested value", async () => {
    mockFrom.mockReturnValue(chain({ data: { role: "manager" }, error: null }));
    const result = await changeUserOrgRoleAction({
      userId: USER_ID,
      orgId: ORG_ID,
      role: "manager",
    });
    expect(result.ok).toBe(true);
  });

  it("updates the role when different", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return chain({ data: { role: "instructor" }, error: null });
      }
      // Second call: the update — returns ok
      return chain({ data: null, error: null });
    });
    const result = await changeUserOrgRoleAction({
      userId: USER_ID,
      orgId: ORG_ID,
      role: "manager",
    });
    expect(result.ok).toBe(true);
  });
});

describe("addUserToOrgAction", () => {
  it("rejects an invalid role", async () => {
    const result = await addUserToOrgAction({
      userId: USER_ID,
      orgId: ORG_ID,
      // @ts-expect-error — invalid role to exercise the validation branch
      role: "garbage",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("BAD_ROLE");
  });

  it("returns ALREADY_MEMBER when a row exists", async () => {
    mockFrom.mockReturnValue(chain({ data: { role: "viewer" }, error: null }));
    const result = await addUserToOrgAction({
      userId: USER_ID,
      orgId: ORG_ID,
      role: "manager",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ALREADY_MEMBER");
  });

  it("inserts a membership when not already a member", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount += 1;
      // First: lookup → null
      if (callCount === 1) return chain({ data: null, error: null });
      // Second: insert → null
      return chain({ data: null, error: null });
    });
    const result = await addUserToOrgAction({
      userId: USER_ID,
      orgId: ORG_ID,
      role: "instructor",
    });
    expect(result.ok).toBe(true);
  });
});

describe("removeUserFromOrgAction", () => {
  it("calls delete on the membership", async () => {
    const c = chain({ data: null, error: null });
    mockFrom.mockReturnValue(c);
    const result = await removeUserFromOrgAction({ userId: USER_ID, orgId: ORG_ID });
    expect(result.ok).toBe(true);
    expect(c.delete).toHaveBeenCalled();
  });
});

describe("changeUserAgencyRoleAction", () => {
  it("rejects an invalid agency role", async () => {
    const result = await changeUserAgencyRoleAction({
      userId: USER_ID,
      agencyId: AGENCY_ID,
      // @ts-expect-error — invalid agency role to exercise validation
      role: "manager",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("BAD_ROLE");
  });

  it("returns NOT_A_MEMBER when no agency membership exists", async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: null }));
    const result = await changeUserAgencyRoleAction({
      userId: USER_ID,
      agencyId: AGENCY_ID,
      role: "agency_admin",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_A_MEMBER");
  });
});
