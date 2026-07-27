import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({ auth: { getUser: mockGetUser } })),
}));

const mockGetCurrentOrgId = vi.fn();
vi.mock("@/lib/auth/current-org", () => ({ getCurrentOrgId: mockGetCurrentOrgId }));

const mockIsManager = vi.fn();
vi.mock("@/lib/auth/role", () => ({ isManager: mockIsManager }));

const mockWriteAuditDenial = vi.fn();
vi.mock("@/lib/auth/audit-denial", () => ({ writeAuditDenial: mockWriteAuditDenial }));

vi.mock("@/lib/webhooks", () => ({
  deliverDelivery: vi.fn(),
  generateSigningSecret: vi.fn(() => "whsec_deterministic_for_test"),
}));

const { upsertWebhookEndpointAction, rotateWebhookSecretAction, deleteWebhookEndpointAction } =
  await import("./actions");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const ENDPOINT_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const USER_ID = "cccccccc-0000-0000-0000-000000000000";

const VALID = {
  url: "https://hooks.example.com/arbor",
  events: ["tra.created"],
  enabled: true,
};

/** Terminal builder that records the .eq() filters applied. */
function makeFilterChain(eqCalls: [string, string][]) {
  const chain: Record<string, unknown> = {
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    insert: vi.fn(() => Promise.resolve({ error: null })),
    eq: vi.fn((col: string, val: string) => {
      eqCalls.push([col, val]);
      return chain;
    }),
    then: (res: (v: { error: null }) => unknown) => res({ error: null }),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentOrgId.mockResolvedValue(ORG_ID);
  mockIsManager.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
});

describe("upsertWebhookEndpointAction — URL validation", () => {
  // The endpoint URL is fetched server-side by the delivery worker, so a
  // non-https or malformed target is an SSRF-shaped foot-gun.
  it.each([
    ["plain http", "http://hooks.example.com/arbor"],
    ["not a url", "not-a-url"],
    ["file scheme", "file:///etc/passwd"],
    ["gopher scheme", "gopher://internal/"],
  ])("rejects %s", async (_label, url) => {
    const result = await upsertWebhookEndpointAction({ ...VALID, url });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("rejects an unsupported event name", async () => {
    const result = await upsertWebhookEndpointAction({ ...VALID, events: ["org.deleted"] });
    expect(result.ok).toBe(false);
  });

  it("requires at least one event", async () => {
    const result = await upsertWebhookEndpointAction({ ...VALID, events: [] });
    expect(result.ok).toBe(false);
  });
});

describe("upsertWebhookEndpointAction — authorization", () => {
  it("refuses a non-manager and records the denial", async () => {
    mockIsManager.mockResolvedValue(false);

    const result = await upsertWebhookEndpointAction(VALID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(mockWriteAuditDenial).toHaveBeenCalledWith(
      ORG_ID,
      "webhooks",
      "upsertWebhookEndpoint",
      "not_manager",
    );
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("refuses when there is no active org", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);
    const result = await upsertWebhookEndpointAction(VALID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
  });

  it("scopes an update to the caller's org so a foreign endpoint id cannot be edited", async () => {
    const eqCalls: [string, string][] = [];
    mockAdminFrom.mockImplementation(() => makeFilterChain(eqCalls));

    const result = await upsertWebhookEndpointAction({ ...VALID, id: ENDPOINT_ID });

    expect(result.ok).toBe(true);
    expect(eqCalls).toContainEqual(["id", ENDPOINT_ID]);
    expect(eqCalls).toContainEqual(["org_id", ORG_ID]);
  });
});

describe("rotateWebhookSecretAction", () => {
  it("refuses a non-manager", async () => {
    mockIsManager.mockResolvedValue(false);
    const result = await rotateWebhookSecretAction(ENDPOINT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("scopes the rotate to the caller's org", async () => {
    const eqCalls: [string, string][] = [];
    mockAdminFrom.mockImplementation(() => makeFilterChain(eqCalls));

    const result = await rotateWebhookSecretAction(ENDPOINT_ID);

    expect(result.ok).toBe(true);
    expect(eqCalls).toContainEqual(["id", ENDPOINT_ID]);
    expect(eqCalls).toContainEqual(["org_id", ORG_ID]);
  });
});

describe("deleteWebhookEndpointAction", () => {
  it("refuses a non-manager", async () => {
    mockIsManager.mockResolvedValue(false);
    const result = await deleteWebhookEndpointAction(ENDPOINT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("scopes the delete to the caller's org", async () => {
    const eqCalls: [string, string][] = [];
    mockAdminFrom.mockImplementation(() => makeFilterChain(eqCalls));

    const result = await deleteWebhookEndpointAction(ENDPOINT_ID);

    expect(result.ok).toBe(true);
    expect(eqCalls).toContainEqual(["id", ENDPOINT_ID]);
    expect(eqCalls).toContainEqual(["org_id", ORG_ID]);
  });
});
