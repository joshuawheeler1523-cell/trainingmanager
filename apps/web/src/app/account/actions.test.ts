import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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
vi.mock("@/lib/auth/current-org", () => ({
  getCurrentOrgId: mockGetCurrentOrgId,
}));

const {
  createTicket,
  replyToTicket,
  setTicketStatus,
  markTicketReadForViewer,
  markNotificationRead,
  markAllNotificationsRead,
} = await import("./actions");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const USER_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const TICKET_ID = "cccccccc-0000-0000-0000-000000000000";

function makeInsertChain(result: { data?: unknown; error?: unknown }) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

function makeUpdateChain(result: { error?: unknown }) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentOrgId.mockResolvedValue(ORG_ID);
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
});

describe("createTicket", () => {
  it("rejects an empty subject", async () => {
    const result = await createTicket({ subject: "", description: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects an empty description", async () => {
    const result = await createTicket({ subject: "Help", description: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects when no org is active", async () => {
    mockGetCurrentOrgId.mockResolvedValueOnce(null);
    const result = await createTicket({ subject: "Help", description: "thing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });

  it("rejects an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const result = await createTicket({ subject: "Help", description: "thing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
  });

  it("inserts with defaults and returns the new id", async () => {
    const insertChain = makeInsertChain({ data: { id: TICKET_ID }, error: null });
    mockFrom.mockReturnValueOnce(insertChain);

    const result = await createTicket({ subject: "Hello", description: "world" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toBe(TICKET_ID);
    expect(mockFrom).toHaveBeenCalledWith("support_tickets");
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        user_id: USER_ID,
        subject: "Hello",
        description: "world",
        category: "how_to",
        priority: "medium",
      }),
    );
  });

  it("propagates the database error", async () => {
    const insertChain = makeInsertChain({
      data: null,
      error: { code: "23505", message: "boom" },
    });
    mockFrom.mockReturnValueOnce(insertChain);

    const result = await createTicket({ subject: "Hello", description: "world" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("boom");
  });
});

describe("replyToTicket", () => {
  it("rejects an empty body", async () => {
    const result = await replyToTicket(TICKET_ID, { body: "", authorKind: "user" });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown author kind", async () => {
    const result = await replyToTicket(TICKET_ID, { body: "hi", authorKind: "ghost" });
    expect(result.ok).toBe(false);
  });

  it("inserts a reply and clears the unread flag for the author side", async () => {
    const insertChain = makeInsertChain({ data: { id: "msg-1" }, error: null });
    const updateChain = makeUpdateChain({ error: null });
    mockFrom.mockReturnValueOnce(insertChain).mockReturnValueOnce(updateChain);

    const result = await replyToTicket(TICKET_ID, { body: "hi there", authorKind: "user" });
    expect(result.ok).toBe(true);
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: TICKET_ID,
        author_kind: "user",
        author_id: USER_ID,
        body: "hi there",
      }),
    );
    expect(updateChain.update).toHaveBeenCalledWith({ unread_for_user: false });
  });

  it("clears the admin unread flag when an admin replies", async () => {
    const insertChain = makeInsertChain({ data: { id: "msg-2" }, error: null });
    const updateChain = makeUpdateChain({ error: null });
    mockFrom.mockReturnValueOnce(insertChain).mockReturnValueOnce(updateChain);

    await replyToTicket(TICKET_ID, { body: "thanks", authorKind: "admin" });
    expect(updateChain.update).toHaveBeenCalledWith({ unread_for_admin: false });
  });
});

describe("setTicketStatus", () => {
  it("rejects an invalid status", async () => {
    const result = await setTicketStatus(TICKET_ID, { status: "doomed" });
    expect(result.ok).toBe(false);
  });

  it("updates the status", async () => {
    const updateChain = makeUpdateChain({ error: null });
    mockFrom.mockReturnValueOnce(updateChain);

    const result = await setTicketStatus(TICKET_ID, { status: "resolved" });
    expect(result.ok).toBe(true);
    expect(updateChain.update).toHaveBeenCalledWith({ status: "resolved" });
    expect(updateChain.eq).toHaveBeenCalledWith("id", TICKET_ID);
  });
});

describe("markTicketReadForViewer", () => {
  it("clears the user-side flag", async () => {
    const updateChain = makeUpdateChain({ error: null });
    mockFrom.mockReturnValueOnce(updateChain);

    await markTicketReadForViewer(TICKET_ID, "user");
    expect(updateChain.update).toHaveBeenCalledWith({ unread_for_user: false });
  });

  it("clears the admin-side flag", async () => {
    const updateChain = makeUpdateChain({ error: null });
    mockFrom.mockReturnValueOnce(updateChain);

    await markTicketReadForViewer(TICKET_ID, "admin");
    expect(updateChain.update).toHaveBeenCalledWith({ unread_for_admin: false });
  });
});

describe("notifications", () => {
  it("markNotificationRead calls the RPC", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const result = await markNotificationRead("notif-1");
    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("mark_notification_read", { p_id: "notif-1" });
  });

  it("markAllNotificationsRead returns the count from the RPC", async () => {
    mockRpc.mockResolvedValueOnce({ data: 7, error: null });
    const result = await markAllNotificationsRead();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.count).toBe(7);
  });

  it("propagates an RPC error from markNotificationRead", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: "X", message: "no" } });
    const result = await markNotificationRead("notif-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe("no");
  });
});
