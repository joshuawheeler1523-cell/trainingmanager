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

const { createApiKeyAction, revokeApiKeyAction } = await import("./actions");

const ORG_ID = "aaaaaaaa-0000-0000-0000-000000000000";
const KEY_ID = "bbbbbbbb-0000-0000-0000-000000000000";
const USER_ID = "cccccccc-0000-0000-0000-000000000000";

/** Captures the filters applied so tests can assert org scoping. */
function makeUpdateChain(eqCalls: [string, string][]) {
  const chain = {
    update: vi.fn(() => chain),
    insert: vi.fn(() => Promise.resolve({ error: null })),
    eq: vi.fn((col: string, val: string) => {
      eqCalls.push([col, val]);
      return chain;
    }),
    then: undefined as unknown,
  };
  // Terminal await on the builder resolves to { error: null }.
  return Object.assign(chain, {
    then: (res: (v: { error: null }) => unknown) => res({ error: null }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentOrgId.mockResolvedValue(ORG_ID);
  mockIsManager.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
});

describe("createApiKeyAction — authorization", () => {
  it("refuses a non-manager and records the denial", async () => {
    mockIsManager.mockResolvedValue(false);

    const result = await createApiKeyAction({ name: "CI", env: "live" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(mockWriteAuditDenial).toHaveBeenCalledWith(
      ORG_ID,
      "api_keys",
      "createApiKey",
      "not_manager",
    );
    // Critically: no key row was written.
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("refuses when there is no active org", async () => {
    mockGetCurrentOrgId.mockResolvedValue(null);

    const result = await createApiKeyAction({ name: "CI", env: "live" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_ORG");
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("validates input before checking anything else", async () => {
    const result = await createApiKeyAction({ name: "", env: "live" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
  });

  it("rejects an unsupported env", async () => {
    const result = await createApiKeyAction({ name: "CI", env: "staging" });
    expect(result.ok).toBe(false);
  });
});

describe("createApiKeyAction — issuance", () => {
  it("returns the full key once and stores only its hash and prefix", async () => {
    let inserted: Record<string, unknown> | null = null;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "api_keys") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            inserted = row;
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { id: KEY_ID }, error: null }),
              })),
            };
          }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const result = await createApiKeyAction({ name: "CI", env: "live" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.fullKey.startsWith("arbor_live_")).toBe(true);
    expect(result.data.fullKey).toHaveLength(43);
    expect(result.data.prefix).toHaveLength(23);

    // The plaintext key must never reach the database.
    expect(inserted).not.toBeNull();
    const row = inserted as unknown as Record<string, unknown>;
    expect(row["key_hash"]).not.toBe(result.data.fullKey);
    expect(String(row["key_hash"]).startsWith("$2")).toBe(true);
    expect(row["key_prefix"]).toBe(result.data.prefix);
    expect(row["org_id"]).toBe(ORG_ID);
    expect(Object.values(row)).not.toContain(result.data.fullKey);
  });
});

describe("revokeApiKeyAction", () => {
  it("refuses a non-manager and records the denial", async () => {
    mockIsManager.mockResolvedValue(false);

    const result = await revokeApiKeyAction(KEY_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(mockWriteAuditDenial).toHaveBeenCalledWith(
      ORG_ID,
      "api_keys",
      "revokeApiKey",
      "not_manager",
    );
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("scopes the revoke to the caller's org so a foreign key id cannot be revoked", async () => {
    const eqCalls: [string, string][] = [];
    mockAdminFrom.mockImplementation((table: string) =>
      table === "api_keys"
        ? makeUpdateChain(eqCalls)
        : { insert: vi.fn().mockResolvedValue({ error: null }) },
    );

    const result = await revokeApiKeyAction(KEY_ID);

    expect(result.ok).toBe(true);
    expect(eqCalls).toContainEqual(["id", KEY_ID]);
    expect(eqCalls).toContainEqual(["org_id", ORG_ID]);
  });
});
