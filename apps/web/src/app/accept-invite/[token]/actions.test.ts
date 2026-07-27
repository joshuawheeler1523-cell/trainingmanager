import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
const mockUpdateUserById = vi.fn();
const mockCreateUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    rpc: mockAdminRpc,
    auth: { admin: { updateUserById: mockUpdateUserById, createUser: mockCreateUser } },
  })),
}));

const mockGetUser = vi.fn();
const mockRpc = vi.fn();
const mockSignIn = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser, signInWithPassword: mockSignIn },
      rpc: mockRpc,
    }),
  ),
}));

const { acceptInvitationAction, acceptInvitationWithPassword } = await import("./actions");

const TOKEN = "tok_abc123";
const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";

function inviteLookup(invite: Record<string, unknown> | null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: invite ? [invite] : [], error: null }),
      })),
    })),
  };
}

function futureIso(days = 7) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}
function pastIso(days = 1) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("acceptInvitationAction (already signed in)", () => {
  it("refuses an anonymous caller without touching the RPC", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await acceptInvitationAction(TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("maps a wrong-email failure to a non-leaky message", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "invitation is for a different email address" },
    });

    const result = await acceptInvitationAction(TOKEN);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("This invitation is for a different email");
  });

  it("maps an expired failure", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "invitation expired" },
    });

    const result = await acceptInvitationAction(TOKEN);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("Invitation expired");
  });
});

describe("acceptInvitationWithPassword — token gating", () => {
  // This path creates or re-passwords an auth user, so the invite checks are
  // the entire security boundary. Each rejection must happen before any
  // account is touched.
  it("rejects a short password before any lookup", async () => {
    const result = await acceptInvitationWithPassword(TOKEN, "short");

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("PASSWORD_TOO_SHORT");
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("rejects an unknown token without creating an account", async () => {
    mockAdminFrom.mockReturnValue(inviteLookup(null));

    const result = await acceptInvitationWithPassword(TOKEN, "a-good-password");

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("INVITE_NOT_FOUND");
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it("rejects an already-accepted invitation (no token replay)", async () => {
    mockAdminFrom.mockReturnValue(
      inviteLookup({
        id: "i1",
        org_id: ORG_ID,
        email: "nurse@example.org",
        role: "instructor",
        expires_at: futureIso(),
        accepted_at: pastIso(),
      }),
    );

    const result = await acceptInvitationWithPassword(TOKEN, "a-good-password");

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("INVITE_ACCEPTED");
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it("rejects an expired invitation without resetting an existing password", async () => {
    mockAdminFrom.mockReturnValue(
      inviteLookup({
        id: "i1",
        org_id: ORG_ID,
        email: "nurse@example.org",
        role: "instructor",
        expires_at: pastIso(),
        accepted_at: null,
      }),
    );

    const result = await acceptInvitationWithPassword(TOKEN, "a-good-password");

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("INVITE_EXPIRED");
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it("binds the new account to the invitation's email, not any caller input", async () => {
    mockAdminFrom.mockReturnValue(
      inviteLookup({
        id: "i1",
        org_id: ORG_ID,
        email: "Nurse@Example.org",
        role: "instructor",
        expires_at: futureIso(),
        accepted_at: null,
      }),
    );
    mockAdminRpc.mockResolvedValue({ data: null, error: null });
    mockCreateUser.mockResolvedValue({ error: null });
    mockSignIn.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ error: null });

    await acceptInvitationWithPassword(TOKEN, "a-good-password").catch(() => undefined);

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "nurse@example.org" }),
    );
  });
});
