import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockHeaderGet = vi.fn();
vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve({ get: mockHeaderGet })),
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(() => Promise.resolve({ ok: true, id: "e1", degraded: false })),
  inviteEmailHtml: vi.fn(() => "<p/>"),
  inviteEmailText: vi.fn(() => "text"),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    auth: { admin: { generateLink: vi.fn() } },
  })),
}));

const { createAgencySignupAction } = await import("./actions");

const VALID = {
  agencyName: "Ellit Group",
  agencySlug: "ellit-group",
  adminEmail: "admin@ellitgroup.com",
  adminFullName: "Alex Rivera",
};

/**
 * The action issues two counting queries (IP window, then email window)
 * before inserting the attempt row. `counts` supplies them in order.
 */
function mockAttemptCounts(counts: number[]) {
  let call = 0;
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "agency_signup_attempts") {
      return {
        select: vi.fn(() => {
          const n = counts[call] ?? 0;
          call++;
          const terminal = { count: n, data: null, error: null };
          const chain: Record<string, unknown> = {
            eq: vi.fn(() => chain),
            ilike: vi.fn(() => chain),
            gte: vi.fn(() => Promise.resolve(terminal)),
            then: (res: (v: typeof terminal) => unknown) => res(terminal),
          };
          return chain;
        }),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { id: "attempt-1" }, error: null }),
          })),
        })),
      };
    }
    // Any later table (agencies slug check, etc.) — return "already taken"
    // so the action stops before the auth/email work.
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "existing" }, error: null }),
          limit: vi.fn().mockResolvedValue({ data: [{ id: "existing" }], error: null }),
        })),
      })),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHeaderGet.mockReturnValue("203.0.113.9");
});

describe("createAgencySignupAction — validation", () => {
  it.each([
    ["blank agency name", { agencyName: "" }],
    ["slug with uppercase-only invalid chars", { agencySlug: "Ellit Group!" }],
    ["malformed email", { adminEmail: "not-an-email" }],
    ["blank admin name", { adminFullName: "" }],
  ])("rejects %s before any database work", async (_label, patch) => {
    const result = await createAgencySignupAction({ ...VALID, ...patch });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("reports which field failed so the form can bind the message", async () => {
    const result = await createAgencySignupAction({ ...VALID, adminEmail: "nope" });

    expect(result.ok).toBe(false);
    // This is the `field` property that 13 of the 42 old local ActionResult
    // copies omitted — it has to survive the shared type.
    if (!result.ok) expect(result.error.field).toBe("adminEmail");
  });
});

describe("createAgencySignupAction — throttling", () => {
  // The action emails a magic link to an arbitrary address, so an unthrottled
  // endpoint is a mass-mailer.
  it("blocks once the per-IP hourly limit is reached", async () => {
    mockAttemptCounts([3, 0]);

    const result = await createAgencySignupAction(VALID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RATE_LIMITED");
      expect(result.error.message).toContain("IP");
    }
  });

  it("blocks once the per-email daily limit is reached", async () => {
    mockAttemptCounts([0, 3]);

    const result = await createAgencySignupAction(VALID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RATE_LIMITED");
      expect(result.error.message).toContain("email");
    }
  });

  it("still applies the email limit when no IP header is present", async () => {
    mockHeaderGet.mockReturnValue(null);
    mockAttemptCounts([3]); // first count call is now the email window

    const result = await createAgencySignupAction(VALID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RATE_LIMITED");
  });

  it("proceeds past the throttle when both windows are under the limit", async () => {
    mockAttemptCounts([0, 0]);

    const result = await createAgencySignupAction(VALID);

    // Stops later on the taken-slug check, which is enough to prove the
    // throttle did not short-circuit it.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).not.toBe("RATE_LIMITED");
  });
});
