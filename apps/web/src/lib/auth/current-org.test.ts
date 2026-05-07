import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only so it doesn't throw in test environment
vi.mock("server-only", () => ({}));

// Mock next/headers
const mockCookies = vi.fn();
vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

// Mock supabase server client
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    }),
  ),
}));

// Import after mocks are in place
const { getCurrentOrgId } = await import("./current-org");

const ORG_A = "org-aaaa-0000-0000-000000000000";
const ORG_B = "org-bbbb-0000-0000-000000000000";
const USER_ID = "user-1111-0000-0000-000000000000";

function makeCookieStore(value?: string) {
  return { get: () => (value ? { name: "current_org_id", value } : undefined) };
}

function makeMembershipQuery(rows: { org_id: string }[] | null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: rows?.[0] ?? null, error: null }),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe("getCurrentOrgId", () => {
  it("returns null when user is not authenticated", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockFrom.mockReturnValue(makeMembershipQuery(null));

    expect(await getCurrentOrgId()).toBeNull();
  });

  it("returns the cookie org when the user has a valid accepted membership there", async () => {
    mockCookies.mockResolvedValue(makeCookieStore(ORG_A));
    mockFrom.mockReturnValue(makeMembershipQuery([{ org_id: ORG_A }]));

    expect(await getCurrentOrgId()).toBe(ORG_A);
  });

  it("falls back to most-recently-accepted membership when cookie org has no accepted membership", async () => {
    mockCookies.mockResolvedValue(makeCookieStore(ORG_A));
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      // First call: validate stored cookie → no membership found
      // Second call: fallback query → returns ORG_B
      return makeMembershipQuery(callCount === 1 ? null : [{ org_id: ORG_B }]);
    });

    expect(await getCurrentOrgId()).toBe(ORG_B);
  });

  it("returns fallback membership when no cookie is set", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());
    mockFrom.mockReturnValue(makeMembershipQuery([{ org_id: ORG_B }]));

    expect(await getCurrentOrgId()).toBe(ORG_B);
  });

  it("returns null when user has no accepted memberships", async () => {
    mockCookies.mockResolvedValue(makeCookieStore());
    mockFrom.mockReturnValue(makeMembershipQuery(null));

    expect(await getCurrentOrgId()).toBeNull();
  });

  it("ignores a cookie org the user is not a member of and returns the fallback", async () => {
    const STRANGER_ORG = "org-zzzz-0000-0000-000000000000";
    mockCookies.mockResolvedValue(makeCookieStore(STRANGER_ORG));
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return makeMembershipQuery(callCount === 1 ? null : [{ org_id: ORG_A }]);
    });

    expect(await getCurrentOrgId()).toBe(ORG_A);
  });
});
